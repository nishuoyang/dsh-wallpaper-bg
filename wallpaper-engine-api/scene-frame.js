/**
 * 场景壁纸完整帧渲染（服务端）
 * ==============================
 * WE 的 scene 类壁纸是 `scene.pkg` 编译字节码（对象树 / 纹理 / puppet 骨骼网格 /
 * 粒子 / shader 效果全在里面），浏览器无法执行，WE 官方预览图只是 preview.gif。
 * 本模块把上游 dsh-plugin-wallpaper-engine 的纯 JS 场景渲染器（lib/we-renderer）
 * 跑在 **worker 线程** 里，输出完整场景帧 PNG，供插件当动态壁纸背景用。
 *
 * 三级回退（任一环节失败都不会让接口报错，插件端总能拿到一张图）：
 *   1. SceneRenderer 完整场景渲染（对象树 + 纹理 + 骨骼 + 粒子 + shader 效果）
 *   2. 空白帧门禁：渲染"成功"但画面与 clearcolor 几乎一致 → 视为失败，继续回退
 *   3. 主纹理静态帧提取（extractSceneMainImage）→ 再不行由插件端回退 preview.gif
 *
 * 渲染跑在 worker 线程：4K 级场景 CPU 光栅化要数秒到数十秒，绝不能阻塞
 * 8088 服务的事件循环（否则同时的 /api/wallpapers 等请求全被卡住）。
 *
 * 缓存：`~/.dsh-wallpaper-bg/cache/scene-frames/`（可用 DSH_WB_CACHE_DIR 覆盖），
 * key 含场景文件 mtime + 渲染尺寸 + 时刻 + 管线版本，工坊更新后自动失效重建。
 *
 * 总开关：场景渲染**默认关闭**（WE_SCENE_RENDER=1/true/on/yes 才启用）——
 * 关闭时本模块不建任何缓存目录、不渲染，接口由服务端返回 403。
 * 只读：仅读取用户本机壁纸目录，不复制、不上传、不修改任何 WE 配置。
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { pathToFileURL } = require('url')
const { Worker } = require('worker_threads')

/**
 * 场景渲染总开关：WE_SCENE_RENDER=1/true/on/yes 才启用。
 * 默认关——避免只装壁纸插件的用户被自动创建 ~/.dsh-wallpaper-bg 缓存目录。
 * 服务端在启动时会先把 we-api.config 里的 WE_SCENE_RENDER 合并进环境变量，
 * 因此这里只看环境变量即可（配置文件入口统一由 server.js 处理）。
 */
function sceneRenderEnabled() {
  const v = String(process.env.WE_SCENE_RENDER ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}

// 管线版本：渲染逻辑变化时递增，旧缓存自动失效（与上游 sf* 同语义）
const PIPELINE_VERSION = 'wb3'
const DEFAULT_WIDTH = 2560
const DEFAULT_TIME = 2.5
const BLANK_RATIO = 0.0005 // 非背景像素占比低于 0.05% → 判为空白帧
// 质量门禁：渲染器"成功"但画面退化成均匀色块（常见于视频纹理 / 纯 shader 生成类场景：
// 只画出了文字、logo 层）时，宁可回退主纹理静态帧，也不给用户一张白屏/灰屏。
const DARK_RATIO = 0.9 // 亮度 < 24 的采样点占比超过该值
const MIN_COLORS = 48 // 采样到的不同颜色数低于该值 → 画面过于单调
// 近均匀帧判定（2026-09-09）：旧条件要求"几乎全黑"才算退化，于是
//   - 3640882040：只渲染出白底 + 红色水印文字（2 色）→ 漏过，显示成一张白屏
//   - 3562086244：全屏渐变层没渲染出来（23 色灰渐变）→ 漏过
// 任何真实画面（照片/插画/3D）在 4bit 量化采样下都有数百~数万种颜色，
// 因此"颜色数 < MIN_COLORS"本身即足以判定退化，无需再附加亮度条件。
function isDegenerateFrame(q) {
  return !!q && (q.colors < MIN_COLORS || (q.darkPct > DARK_RATIO && q.colors < MIN_COLORS * 8))
}
const RENDER_TIMEOUT_MS = 600000

/** 缓存目录（可用 DSH_WB_CACHE_DIR 覆盖） */
function cacheDir() {
  const dir = process.env.DSH_WB_CACHE_DIR || path.join(os.homedir(), '.dsh-wallpaper-bg', 'cache', 'scene-frames')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* 目录建不出来时后续写入会失败并走回退 */
  }
  return dir
}

/** 原子写：先写 .tmp 再 rename，写一半崩溃不会留下半截缓存 */
function atomicWrite(file, buf) {
  const tmp = file + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, file)
}

/** 缓存旁注（记录实际使用的静态帧时刻等元信息；缺失时按请求时刻处理） */
function writeMeta(cacheFile, meta) {
  try {
    atomicWrite(cacheFile.replace(/\.(png|jpg)$/, '.json'), Buffer.from(JSON.stringify(meta)))
  } catch { /* 旁注写不了不影响主缓存 */ }
}

function readMeta(cacheFile) {
  try {
    return JSON.parse(fs.readFileSync(cacheFile.replace(/\.(png|jpg)$/, '.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 画面质量抽检（解码 PNG 后 4 像素采样）：
 * 返回 { darkPct, colors } 或 null（解码失败则不拦，交给下游）。
 * 用于识别「渲染成功但基本是黑底」的帧 —— 视频纹理、纯 shader 生成类场景常见。
 */
async function frameQuality(png) {
  try {
    const { decodePngBuffer } = await import('./lib/we-renderer/canvas.js')
    const img = decodePngBuffer(png)
    const { width: W, height: H, rgba } = img
    if (!W || !H) return null
    let dark = 0
    let n = 0
    const colors = new Set()
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const i = (y * W + x) * 4
        const l = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
        n++
        if (l < 24) dark++
        colors.add((rgba[i] >> 4) * 256 + (rgba[i + 1] >> 4) * 16 + (rgba[i + 2] >> 4))
      }
    }
    return { darkPct: n ? dark / n : 0, colors: colors.size }
  } catch {
    return null
  }
}

/** 场景正交投影宽高比（非 16:9 壁纸按比例渲染，避免垂直裁切） */
async function sceneAspect(src) {
  try {
    const { readPkg } = await import('./we-renderer/textures.js')
    const target = String(src).toLowerCase().endsWith('.json') ? path.dirname(src) : src
    const pk = readPkg(target)
    const sc = pk.readJson('scene.json')
    const ortho = sc && sc.general && sc.general.orthogonalprojection
    if (ortho && ortho.width && ortho.height) {
      const ar = parseFloat(ortho.width) / parseFloat(ortho.height)
      if (Number.isFinite(ar) && ar > 0.05 && ar < 20) return ar
    }
  } catch {
    /* 读不到就按 16:9 */
  }
  return null
}

/** 在 worker 线程里渲染一帧；返回 { ok, png?, diff?, checked?, stillTime?, error? } */
function renderInWorker(src, width, height, time, weAssetsDir, signal, videoFrames, autoTime) {
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('./lib/scene-render-worker.mjs', pathToFileURL(__filename)), {
        workerData: {
          src, width, height, time, weAssetsDir: weAssetsDir || null,
          // 静态帧时刻选择（默认时刻落在眨眼闭眼相位时自动换时刻）
          autoTime: autoTime !== false,
          // 视频纹理静态帧映射（主线程 ffmpeg 预抽帧）：纹理引用 → PNG 路径
          videoFrames: videoFrames && videoFrames.size ? Object.fromEntries(videoFrames) : null,
        },
        type: 'module',
      })
    } catch (err) {
      resolve({ ok: false, error: String((err && err.message) || err) })
      return
    }
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      try { worker.terminate() } catch { /* 已退出 */ }
      resolve(value)
    }
    const onAbort = () => finish({ ok: false, error: 'cancelled' })
    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'scene render timeout' }), RENDER_TIMEOUT_MS)
    worker.on('message', (msg) => {
      if (msg && msg.ok && msg.png) {
        finish({
          ok: true, png: Buffer.from(msg.png), diff: msg.diff || 0, checked: msg.checked || 0,
          stillTime: Number.isFinite(msg.stillTime) ? msg.stillTime : time,
        })
      } else {
        finish({ ok: false, error: (msg && msg.error) || 'scene render failed' })
      }
    })
    worker.once('error', (err) => finish({ ok: false, error: String((err && err.message) || err) }))
    worker.once('exit', (code) => {
      if (code !== 0) finish({ ok: false, error: 'scene render worker exited ' + code })
    })
  })
}

// 并发去重：同一缓存 key 的多个请求只渲染一次
const inflight = new Map()

/**
 * 渲染场景帧（带磁盘缓存）。
 * @param {string} src  scene.pkg 文件 / 松散 scene.json 目录 / scene.json 文件
 * @param {object} opts { width, height, time, refresh, weAssetsDir, signal, autoTime }
 *   autoTime=false 时严格使用 time（不做「避开眨眼闭眼相位」的时刻选择）
 * @returns {Promise<{ ok:boolean, png?:Buffer, mime?:string, cached?:boolean, mode?:string,
 *                     width?:number, height?:number, time?:number, stillTime?:number,
 *                     error?:string, fallbackFrom?:string }>}
 */
async function renderSceneFrame(src, opts = {}) {
  // 总开关：关闭时不建缓存目录、不渲染（服务端路由层还会先返回 403，这里是兜底）
  if (!sceneRenderEnabled()) {
    return { ok: false, error: '场景渲染未启用（WE_SCENE_RENDER=1 开启）' }
  }
  const time = Number.isFinite(opts.time) ? Number(opts.time) : DEFAULT_TIME
  const weAssetsDir = opts.weAssetsDir || null
  const signal = opts.signal || null

  // 渲染尺寸：宽度取 opts.width，高度按场景正交比例（缺省 16:9）
  const width = Math.max(64, Math.min(7680, Math.round(opts.width || DEFAULT_WIDTH)))
  let height = opts.height ? Math.round(opts.height) : 0
  if (!height) {
    const ar = await sceneAspect(src)
    height = Math.round(width / (ar || (16 / 9)))
    height = Math.max(64, Math.min(7680, height))
  }

  let mtime = 0
  try { mtime = fs.statSync(src).mtimeMs } catch { /* 文件不在时 key 仍稳定 */ }

  const key = PIPELINE_VERSION + '_' + crypto
    .createHash('sha256')
    .update(src + '|' + Math.round(mtime) + '|' + width + 'x' + height + '|' + time + '|' + (opts.autoTime === false ? 'na' : 'auto'))
    .digest('hex')
    .slice(0, 32)
  const dir = cacheDir()
  const pngPath = path.join(dir, key + '.png')
  const jpgPath = path.join(dir, key + '.jpg')
  // 负缓存：质量门禁判定该场景渲染退化（白屏/灰屏/只画出文字层）时记录标记，
  // 避免每次选到这张壁纸都白跑一次 10~45s 的渲染。管线版本变化 → key 变化 → 自动失效。
  const failPath = path.join(dir, key + '.fail.json')

  if (!opts.refresh) {
    if (fs.existsSync(pngPath)) {
      const meta = readMeta(pngPath)
      return {
        ok: true, png: fs.readFileSync(pngPath), mime: 'image/png', cached: true, mode: 'scene',
        width, height, time, stillTime: meta && Number.isFinite(meta.stillTime) ? meta.stillTime : time,
      }
    }
    if (fs.existsSync(jpgPath)) {
      return { ok: true, png: fs.readFileSync(jpgPath), mime: 'image/jpeg', cached: true, mode: 'main-texture', width, height, time }
    }
    if (fs.existsSync(failPath)) {
      try {
        const cachedFail = JSON.parse(fs.readFileSync(failPath, 'utf8'))
        if (cachedFail && cachedFail.error) return { ok: false, error: cachedFail.error, cachedFail: true }
      } catch { /* 标记损坏 → 忽略, 重新渲染 */ }
    }
  }

  let task = inflight.get(key)
  if (!task) {
    task = (async () => {
      let fallbackFrom = null
      // 0) 视频纹理预抽帧：场景主画面是内嵌 MP4 / 独立视频时，渲染器本身无法解码，
      //    先用 ffmpeg 抽出该时刻的一帧 PNG 传给它（失败不影响后续渲染，只是该纹理缺省）。
      let videoFrames = null
      try {
        const { extractSceneVideoFrames } = await import('./scene-video-frames.js')
        videoFrames = await extractSceneVideoFrames(src, time)
      } catch { /* 抽帧不可用 → 按原逻辑渲染 */ }
      if (signal && signal.aborted) throw new Error('cancelled')
      // 1) 完整场景渲染
      try {
        const result = await renderInWorker(src, width, height, time, weAssetsDir, signal, videoFrames, opts.autoTime)
        if (!result.ok) throw new Error(result.error)
        if (result.checked && result.diff < result.checked * BLANK_RATIO) {
          throw new Error('blank frame (renderer)')
        }
        // 质量门禁：退化帧（近均匀色块）→ 回退主纹理静态帧
        const q = await frameQuality(result.png)
        if (isDegenerateFrame(q)) {
          throw new Error(`degenerate frame (renderer): ${Math.round(q.darkPct * 100)}% dark, ${q.colors} colors`)
        }
        atomicWrite(pngPath, result.png)
        writeMeta(pngPath, { stillTime: result.stillTime, mode: 'scene', width, height, time })
        return {
          ok: true, png: result.png, mime: 'image/png', cached: false, mode: 'scene',
          width, height, time, stillTime: result.stillTime,
          videoTextures: videoFrames && videoFrames.size ? videoFrames.size : 0,
        }
      } catch (err) {
        fallbackFrom = String((err && err.message) || err)
        if (signal && signal.aborted) throw err
      }
      // 2) 回退：主纹理静态帧
      const { extractSceneMainImage, extractSceneMainImageFromDir } = await import('./lib/pkg-extract.js')
      const isDirLike = !String(src).toLowerCase().endsWith('.pkg')
      const frame = isDirLike
        ? extractSceneMainImageFromDir(String(src).toLowerCase().endsWith('.json') ? path.dirname(src) : src)
        : extractSceneMainImage(new Uint8Array(await fs.promises.readFile(src)))
      if (!frame || !frame.bytes || !frame.bytes.length) throw new Error(fallbackFrom || 'scene frame 提取失败')
      // 主纹理同样退化（近均匀）时放行给插件端回退 preview（工坊预览图通常有画面）
      const fq = await frameQuality(Buffer.from(frame.bytes))
      if (isDegenerateFrame(fq)) {
        throw new Error(`degenerate main texture: ${Math.round(fq.darkPct * 100)}% dark, ${fq.colors} colors`)
      }
      const target = frame.mime === 'image/jpeg' ? jpgPath : pngPath
      atomicWrite(target, Buffer.from(frame.bytes))
      return {
        ok: true,
        png: Buffer.from(frame.bytes),
        mime: frame.mime || 'image/png',
        cached: false,
        mode: 'main-texture',
        width,
        height,
        time,
        fallbackFrom,
      }
    })()
    inflight.set(key, task)
    task.then(
      () => inflight.delete(key),
      () => inflight.delete(key),
    )
  }
  try {
    return await task
  } catch (err) {
    const message = String((err && err.message) || err)
    // 只对确定性判定（质量门禁 / 主纹理门禁）写负缓存：瞬时错误（超时/取消/读盘失败）保持可重试
    if (/degenerate|blank frame|frame rejected/.test(message) && !/cancelled/.test(message)) {
      try { atomicWrite(failPath, Buffer.from(JSON.stringify({ error: message, at: new Date().toISOString() }))) } catch { /* 忽略 */ }
    }
    return { ok: false, error: message }
  }
}

module.exports = { renderSceneFrame, cacheDir, sceneAspect, sceneRenderEnabled, PIPELINE_VERSION, DEFAULT_WIDTH, DEFAULT_TIME }
