/**
 * 场景壁纸「动画烘焙」——把场景渲染成一段可无缝循环的 MP4
 * ======================================================
 * 背景：WE 场景壁纸里的动画（粒子飘动、水面波动、角色呼吸/眨眼）在当前实现里
 * 只被渲染成**一帧静态图**。真正的实时播放需要把渲染器搬到 GPU（工程量以周计），
 * 而「离线烘焙成视频」能以小得多的代价拿到同样的观感：CPU 渲染若干帧 → ffmpeg
 * 编码 H.264 → 浏览器用原生 <video loop> 播放，60fps 且几乎零 CPU 开销。
 *
 * 关键点：
 *   - **多帧复用同一个渲染器实例**：pkg 解析 + 纹理解码只做一次，后续每帧只跑
 *     效果链 + 光栅化（实测普通场景 1080p ≈ 1s/帧，重效果场景 10~20s/帧）。
 *   - **逐帧写盘**，不把整段动画留在内存（4K 96 帧 = 数百 MB）。
 *   - **循环点检测**：worker 顺便算每帧 32×N 的缩略签名，主线程找一个与首帧
 *     最接近的帧作为循环终点并裁掉尾部——循环播放时不会看到跳变。找不到就
 *     用完整时长（多数水面/粒子场景本身近似周期）。
 *   - **静止场景直接跳过**：所有帧签名几乎一致时判定该壁纸本身没有动画，
 *     不产出视频（客户端会提示）。
 *
 * 缓存：`~/.dsh-wallpaper-bg/cache/scene-anim/<key>.mp4` + `<key>.json` 旁注。
 * 同一时刻只跑一个烘焙任务，其余排队（CPU 单线程渲染，并发只会互相拖慢）。
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { Worker } = require('worker_threads')
const { pathToFileURL } = require('url')

// 与 scene-frame.js 同一套管线版本号语义：渲染逻辑变化 → 旧缓存自动失效
const ANIM_PIPELINE_VERSION = 'wa1'
const DEFAULT_WIDTH = 1920
const DEFAULT_FPS = 24
const DEFAULT_DURATION = 4        // 循环时长（秒）
const MAX_DURATION = 12
const LOOP_WINDOW = 1.0           // 额外多渲染的秒数，用于寻找循环终点
const MIN_LOOP_SECONDS = 1.5      // 循环不得短于该时长
const STATIC_THRESHOLD = 1.2      // 帧签名平均差异低于该值 → 判定为静止场景
const LOOP_THRESHOLD = 6.0        // 循环终点候选的签名差异上限
const RENDER_TIMEOUT_MS = 3600000 // 单张烘焙最长 1 小时（重效果场景 1080p 可能 20 分钟+）

/** 烘焙缓存目录（可用 DSH_WB_CACHE_DIR 覆盖） */
function animCacheDir() {
  const dir = process.env.DSH_WB_CACHE_DIR
    ? path.join(process.env.DSH_WB_CACHE_DIR, 'scene-anim')
    : path.join(os.homedir(), '.dsh-wallpaper-bg', 'cache', 'scene-anim')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* 写不进去时后续报错 */ }
  return dir
}

function num(v, fallback, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n) || n < lo || n > hi) return fallback
  return n
}

/** 规范化烘焙参数（宽/帧率/时长都在合理范围内） */
function normalizeOpts(opts) {
  const o = opts || {}
  return {
    width: Math.round(num(o.width, DEFAULT_WIDTH, 320, 3840) / 2) * 2,
    height: Math.round(num(o.height, 0, 0, 2160)),
    fps: Math.round(num(o.fps, DEFAULT_FPS, 8, 60)),
    duration: num(o.duration, DEFAULT_DURATION, 1, MAX_DURATION),
    weAssetsDir: o.weAssetsDir || null,
    refresh: o.refresh === true,
  }
}

/** 缓存 key：源文件 + mtime + 尺寸 + 帧率 + 时长 + 管线版本 */
function animKey(src, opts) {
  let mtime = 0
  try { mtime = fs.statSync(src).mtimeMs } catch { /* 文件不在时 key 仍稳定 */ }
  return ANIM_PIPELINE_VERSION + '_' + crypto
    .createHash('sha256')
    .update([src, Math.round(mtime), opts.width, opts.height || 'auto', opts.fps, opts.duration].join('|'))
    .digest('hex')
    .slice(0, 32)
}

function videoPathOf(key) { return path.join(animCacheDir(), key + '.mp4') }
function metaPathOf(key) { return path.join(animCacheDir(), key + '.json') }

function readMeta(key) {
  try { return JSON.parse(fs.readFileSync(metaPathOf(key), 'utf8')) } catch { return null }
}

/** 已烘焙完成的视频（缓存命中） */
function getBaked(src, rawOpts) {
  const opts = normalizeOpts(rawOpts)
  const key = animKey(src, opts)
  const file = videoPathOf(key)
  if (!opts.refresh && fs.existsSync(file)) {
    let size = 0
    try { size = fs.statSync(file).size } catch { /* 忽略 */ }
    if (size > 0) return { key, file, meta: readMeta(key), size }
  }
  return null
}

/** 帧签名距离（平均绝对差，0-255 量级） */
function sigDistance(a, b) {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return n ? sum / n : Infinity
}

// ── 任务队列（单并发） ─────────────────────────────────────────
const jobs = new Map()          // key → { state, done, total, startedAt, error, meta, cancelled }
const queue = []                // 待执行的 key
let running = null              // 正在执行的 key
// 每个 key 对应的源文件与参数（排队时需要）
const jobEntries = new Map()

function jobView(key) {
  const j = jobs.get(key)
  if (!j) return null
  const total = j.total || 0
  return {
    key,
    state: j.state,
    done: j.done || 0,
    total,
    percent: total ? Math.round((j.done / total) * 100) : 0,
    elapsedMs: j.startedAt ? Date.now() - j.startedAt : 0,
    error: j.error || null,
    meta: j.meta || null,
  }
}

function listJobs() {
  return [...jobs.keys()].map(jobView).filter(Boolean)
}

/** 在 worker 线程里把 times 逐帧写盘，返回 { ok, frames, sigs, ... } */
function renderFramesToDir(src, opts, times, framesDir, onProgress, registerWorker) {
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('./lib/scene-render-worker.mjs', pathToFileURL(__filename)), {
        workerData: {
          src,
          width: opts.width,
          height: opts.height || Math.round(opts.width * 9 / 16),
          time: times[0],
          times,
          framesDir,
          sigWidth: 32,
          weAssetsDir: opts.weAssetsDir || null,
        },
        type: 'module',
      })
    } catch (err) {
      resolve({ ok: false, error: String((err && err.message) || err) })
      return
    }
    if (registerWorker) registerWorker(worker)
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { worker.terminate() } catch { /* 已退出 */ }
      resolve(value)
    }
    const timer = setTimeout(() => finish({ ok: false, error: '烘焙超时' }), RENDER_TIMEOUT_MS)
    worker.on('message', (msg) => {
      if (msg && msg.progress) { if (onProgress) onProgress(msg.done, msg.total); return }
      if (msg && msg.ok) finish(msg)
      else finish({ ok: false, error: (msg && msg.error) || '渲染线程异常退出' })
    })
    worker.on('error', (err) => finish({ ok: false, error: String((err && err.message) || err) }))
    worker.on('exit', (code) => { if (!settled) finish({ ok: false, error: '渲染线程退出 (code ' + code + ')' }) })
  })
}

/** ffmpeg 编码：PNG 序列 → H.264 MP4（faststart，无音轨） */
async function encodeVideo(framesDir, outFile, fps, frames) {
  const { resolveFfmpeg, runFfmpeg } = require('./scene-video-frames.js')
  const bin = resolveFfmpeg()
  if (!bin) throw new Error('未找到 ffmpeg（设 WE_FFMPEG / FFMPEG_PATH 或加入 PATH）——视频烘焙需要它')
  const tmpOut = outFile + '.part.mp4'
  try { fs.rmSync(tmpOut, { force: true }) } catch { /* 忽略 */ }
  await runFfmpeg(bin, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(fps),
    '-start_number', '0',
    '-i', path.join(framesDir, 'f_%05d.png'),
    '-frames:v', String(frames),
    // yuv420p 要求偶数宽高（渲染尺寸已取偶，这里再兜一层）
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    tmpOut,
  ], 1800000)
  if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) throw new Error('ffmpeg 未产出视频文件')
  fs.renameSync(tmpOut, outFile)
  return fs.statSync(outFile).size
}

/** 真正执行一次烘焙 */
async function runBake(src, opts, key) {
  const job = jobs.get(key)
  const dir = animCacheDir()
  const tmpDir = path.join(os.tmpdir(), 'dsh-wb-anim-' + process.pid + '-' + key.slice(-8))
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })

  const wanted = Math.max(1, Math.round(opts.duration * opts.fps))
  const extra = Math.max(0, Math.round(LOOP_WINDOW * opts.fps))
  const times = []
  for (let i = 0; i < wanted + extra; i++) times.push(i / opts.fps)
  job.total = times.length

  let workerRef = null
  const result = await renderFramesToDir(
    src, opts, times, tmpDir,
    (done, total) => { job.done = done; job.total = total },
    // 立即登记 worker（同步回调）：取消时才能 terminate 掉正在跑的渲染
    (w) => { workerRef = w; job.worker = w },
  )
  if (job.cancelled) throw new Error('cancelled')
  if (!result.ok) throw new Error(result.error || '渲染失败')

  // ── 循环点检测 ──
  const sigs = result.sigs || []
  const first = sigs[0] || null
  let staticScene = false
  if (first && sigs.length > 1) {
    let maxDist = 0
    for (let i = 1; i < sigs.length; i++) maxDist = Math.max(maxDist, sigDistance(first, sigs[i]))
    staticScene = maxDist < STATIC_THRESHOLD
  }
  const minLoopFrames = Math.min(wanted, Math.round(MIN_LOOP_SECONDS * opts.fps))
  let loopFrames = wanted
  let loopDistance = null
  if (first) {
    let best = Infinity
    let bestIdx = -1
    for (let i = minLoopFrames; i < sigs.length; i++) {
      const d = sigDistance(first, sigs[i])
      if (d < best) { best = d; bestIdx = i }
    }
    if (bestIdx > 0 && best <= LOOP_THRESHOLD) { loopFrames = bestIdx; loopDistance = +best.toFixed(2) }
  }
  loopFrames = Math.max(minLoopFrames, Math.min(loopFrames, wanted + extra))

  if (staticScene) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    const meta = { static: true, width: opts.width, fps: opts.fps, frames: sigs.length, note: '该壁纸本身没有动画（所有帧几乎一致）' }
    // 落盘：服务重启后仍能直接回答「这张没有动画」，不必再渲染一遍
    try { fs.writeFileSync(metaPathOf(key), JSON.stringify(meta)) } catch { /* 忽略 */ }
    job.state = 'static'
    job.meta = meta
    return { static: true, meta }
  }

  const outFile = videoPathOf(key)
  const bytes = await encodeVideo(tmpDir, outFile, opts.fps, loopFrames)
  fs.rmSync(tmpDir, { recursive: true, force: true })

  const meta = {
    frames: loopFrames,
    fps: opts.fps,
    durationSec: +(loopFrames / opts.fps).toFixed(3),
    width: opts.width,
    height: opts.height || Math.round(opts.width * 9 / 16),
    loopDistance,
    renderedFrames: sigs.length,
    bytes,
    createdAt: new Date().toISOString(),
  }
  try { fs.writeFileSync(metaPathOf(key), JSON.stringify(meta)) } catch { /* 旁注写不了不影响播放 */ }
  job.state = 'done'
  job.meta = meta
  return { static: false, meta, file: outFile }
}

/** 入队并（在空闲时）开始烘焙；已有缓存/正在跑/已排队时直接返回状态 */
function startBake(src, rawOpts) {
  const opts = normalizeOpts(rawOpts)
  const key = animKey(src, opts)
  const baked = getBaked(src, opts)
  if (baked) return { key, state: 'done', cached: true, meta: baked.meta }
  const existing = jobs.get(key)
  if (existing && (existing.state === 'running' || existing.state === 'queued')) {
    return Object.assign(jobView(key), { cached: false })
  }
  jobs.set(key, { state: 'queued', done: 0, total: 0, startedAt: Date.now(), meta: null, error: null, cancelled: false })
  queue.push(key)
  pump()
  return Object.assign(jobView(key), { cached: false })
}

function pump() {
  if (running || !queue.length) return
  const key = queue.shift()
  const job = jobs.get(key)
  if (!job || job.cancelled) { pump(); return }
  running = key
  job.state = 'running'
  job.startedAt = Date.now()
  const entry = jobEntries.get(key)
  if (!entry) { running = null; jobs.delete(key); pump(); return }
  runBake(entry.src, entry.opts, key)
    .then((r) => { if (r && r.static) job.state = 'static' })
    .catch((err) => {
      job.state = 'error'
      job.error = String((err && err.message) || err)
    })
    .finally(() => {
      job.worker = null
      // 只清理自己这一轮：取消后立刻又有新任务启动时，不能被上一轮的收尾清掉
      if (running === key) running = null
      jobEntries.delete(key)
      pump()
    })
}

/** 查询状态：'idle' | queued | running | done | static | error */
function bakeStatus(src, rawOpts) {
  const opts = normalizeOpts(rawOpts)
  const key = animKey(src, opts)
  const view = jobView(key)
  if (view) return Object.assign(view, { url: view.state === 'done' ? '/scene-anim/' + key : null })
  const baked = getBaked(src, opts)
  if (baked) return { key, state: 'done', cached: true, meta: baked.meta, percent: 100, done: 0, total: 0, url: '/scene-anim/' + key }
  const meta = readMeta(key)
  if (meta && meta.static) return { key, state: 'static', cached: true, meta, percent: 100, done: 0, total: 0 }
  return { key, state: 'idle', percent: 0 }
}

/** 取消排队中/进行中的任务 */
function cancelBake(src, rawOpts) {
  const opts = normalizeOpts(rawOpts)
  const key = animKey(src, opts)
  const job = jobs.get(key)
  if (!job) return false
  job.cancelled = true
  if (job.worker) { try { job.worker.terminate() } catch { /* 忽略 */ } }
  const qi = queue.indexOf(key)
  if (qi >= 0) queue.splice(qi, 1)
  jobs.delete(key)
  jobEntries.delete(key)
  if (running === key) running = null
  return true
}

/** 直接按 key 取视频文件（服务端 /scene-anim/<key>.mp4 用） */
function videoByKey(key) {
  if (!/^wa\d+_[0-9a-f]{32}$/.test(String(key))) return null
  const file = videoPathOf(key)
  if (!fs.existsSync(file)) return null
  try { if (fs.statSync(file).size <= 0) return null } catch { return null }
  return { file, meta: readMeta(key) }
}

/** 启动烘焙（带源信息登记，供 pump 使用） */
function enqueueBake(src, rawOpts) {
  const opts = normalizeOpts(rawOpts)
  const key = animKey(src, opts)
  if (!jobEntries.has(key)) jobEntries.set(key, { src, opts })
  return startBake(src, opts)
}

module.exports = {
  enqueueBake, bakeStatus, cancelBake, listJobs, getBaked, videoByKey,
  animCacheDir, normalizeOpts, animKey, ANIM_PIPELINE_VERSION,
  DEFAULT_WIDTH, DEFAULT_FPS, DEFAULT_DURATION,
}
