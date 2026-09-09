/**
 * 场景视频纹理的静态帧抽取（ffmpeg）
 * ====================================
 * WE 场景壁纸的主画面常常是一个**视频纹理**：要么是 `.tex` 容器里内嵌的 MP4
 * （WE 的 sync 动画，TEXI 标记 0x2000/0x2200，或 mip0 直接以 `ftyp` box 开头），
 * 要么是材质直接引用一个独立的 `.mp4` / `.webm` / `.mov` 文件。
 * SceneRenderer 只会解码静态纹理（RGBA/DXT/JPEG/PNG），遇到视频纹理会抛错，
 * 于是整个场景回退成主纹理甚至 422。
 *
 * 本模块在渲染前用 ffmpeg 抽出指定时刻的一帧 PNG，返回
 * `Map<纹理引用, PNG 路径>`；渲染器遇到该纹理时用 PNG 替代（`videoFrames` 选项）。
 * 抽帧失败不影响渲染——该纹理缺省，行为与之前一致。
 *
 * ffmpeg 来源：环境变量 WE_FFMPEG / FFMPEG_PATH → 系统 PATH → 常见安装位置。
 * 找不到就返回空 Map（不报错）。
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

const VIDEO_EXT_RE = /\.(mp4|m4v|webm|mov)$/i
const FFMPEG_TIMEOUT_MS = 120000

let ffmpegCache
/** 解析 ffmpeg 可执行文件路径（找不到返回 null，结果缓存） */
function resolveFfmpeg() {
  if (ffmpegCache !== undefined) return ffmpegCache
  const candidates = [
    process.env.WE_FFMPEG,
    process.env.FFMPEG_PATH,
    'ffmpeg',
  ].filter(Boolean)
  // 常见安装位置兜底（Windows）
  if (process.platform === 'win32') {
    for (const root of [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages'),
      'C:\\ffmpeg\\bin',
      'C:\\Program Files\\ffmpeg\\bin',
    ]) {
      if (!root || !fs.existsSync(root)) continue
      try {
        for (const dir of fs.readdirSync(root)) {
          if (!/ffmpeg/i.test(dir)) continue
          const base = path.join(root, dir)
          const stack = [base]
          while (stack.length) {
            const cur = stack.pop()
            let names = []
            try { names = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
            for (const n of names) {
              const full = path.join(cur, n.name)
              if (n.isDirectory()) { if (stack.length < 40) stack.push(full) }
              else if (/^ffmpeg\.exe$/i.test(n.name)) { candidates.push(full) }
            }
          }
        }
      } catch { /* 忽略 */ }
    }
  }
  for (const c of candidates) {
    if (c === 'ffmpeg') { ffmpegCache = c; return c }   // 交给 PATH 解析
    try {
      if (fs.existsSync(c)) { ffmpegCache = c; return c }
    } catch { /* 忽略 */ }
  }
  ffmpegCache = null
  return null
}

function runFfmpeg(bin, args, timeout = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 1 << 22 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String((stderr || err.message || '').split('\n').slice(-3).join(' ')).trim()))
      else resolve(stdout)
    })
  })
}

/** 抽帧缓存目录（与场景帧缓存同根） */
function framesCacheDir() {
  const dir = process.env.DSH_WB_CACHE_DIR
    ? path.join(process.env.DSH_WB_CACHE_DIR, 'video-frames')
    : path.join(os.homedir(), '.dsh-wallpaper-bg', 'cache', 'video-frames')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* 写不进去时后续走失败分支 */ }
  return dir
}

/** 列出一个场景源里的全部条目：{ path, read() } —— 兼容 scene.pkg 与松散目录 */
async function listSceneEntries(src) {
  const target = String(src)
  let isDir = false
  try { isDir = fs.statSync(target).isDirectory() } catch { /* 不存在 */ }
  if (!isDir && target.toLowerCase().endsWith('.json')) {
    return listSceneEntries(path.dirname(target))
  }
  if (isDir) {
    const root = target
    const out = []
    const walk = (dir) => {
      let names = []
      try { names = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const n of names) {
        const full = path.join(dir, n.name)
        if (n.isDirectory()) { if (!n.name.startsWith('.')) walk(full) }
        else out.push({ path: full.slice(root.length + 1).replace(/\\/g, '/'), read: () => fs.readFileSync(full) })
      }
    }
    walk(root)
    return out
  }
  const { parsePkg, readPkgEntry } = await import('./lib/pkg-extract.js')
  const data = await fs.promises.readFile(target)
  return parsePkg(data).map((e) => ({ path: e.path, read: () => readPkgEntry(data, e) }))
}

/** 规范化纹理引用，与渲染器查表口径一致（materials/<name>.tex 或裸名） */
function normalizeRef(ref) {
  const r = String(ref || '')
  return r.startsWith('materials/') ? r : 'materials/' + r
}

/**
 * 抽取场景内所有视频纹理在 time 秒处的静态帧。
 * @returns {Promise<Map<string, string>>} 纹理引用 → PNG 绝对路径（可能为空 Map）
 */
async function extractSceneVideoFrames(src, time) {
  const map = new Map()
  let entries
  try {
    entries = await listSceneEntries(src)
  } catch {
    return map
  }
  const { extractTexVideoMp4 } = await import('./lib/pkg-extract.js')

  // 收集视频来源：内嵌 MP4 的 .tex + 独立视频文件
  const videos = []
  for (const e of entries) {
    if (VIDEO_EXT_RE.test(e.path)) {
      let b = null
      try { b = e.read() } catch { /* 忽略 */ }
      if (b && b.length) videos.push({ ref: e.path, bytes: b, ext: path.extname(e.path) })
      continue
    }
    if (!e.path.toLowerCase().endsWith('.tex')) continue
    let b = null
    try { b = e.read() } catch { /* 忽略 */ }
    if (!b) continue
    let mp4 = null
    try { mp4 = extractTexVideoMp4(b) } catch { /* 非视频纹理 */ }
    if (mp4 && mp4.length) videos.push({ ref: e.path, bytes: mp4, ext: '.mp4' })
  }
  if (!videos.length) return map

  const bin = resolveFfmpeg()
  if (!bin) return map

  const outDir = framesCacheDir()
  const tKey = String(Math.round((Number(time) || 0) * 1000))
  const tmpDir = path.join(os.tmpdir(), 'dsh-wb-vid-' + process.pid)
  try { fs.mkdirSync(tmpDir, { recursive: true }) } catch { /* 忽略 */ }

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i]
    const hash = crypto.createHash('sha256').update(v.ref + '|' + v.bytes.length).digest('hex').slice(0, 16)
    const outPng = path.join(outDir, 'vid_' + hash + '_' + tKey + '.png')
    const refs = [v.ref, normalizeRef(v.ref), v.ref.replace(/^materials\//, '')]
    if (fs.existsSync(outPng)) {
      for (const r of refs) map.set(r, outPng)
      continue
    }
    const tmpVideo = path.join(tmpDir, hash + v.ext)
    try {
      await fs.promises.writeFile(tmpVideo, v.bytes)
      // 抽帧命令：用 select 过滤器按时间（pts，单位秒）取一帧再写 PNG。
      // 踩过的坑（ffmpeg 9.0 实测）：`-ss` 与 `select=eq(n,0)` 同时用会一帧都不写
      // （退出码 0、无 stderr、无输出文件）；`-frames:v 1` 单独用也不写；
      // `select=gte(t,X)` 里的 t 是时间基单位、不匹配 2.5 这种秒值。
      // 只有 `-vf select=gte(pts,<秒>) -frames:v 1 -f image2 -vcodec png` 稳定出图。
      await runFfmpeg(bin, [
        '-hide_banner', '-loglevel', 'error',
        '-i', tmpVideo,
        '-vf', 'select=gte(pts\\,' + String(Number(time) || 0) + ')',
        '-frames:v', '1',
        '-f', 'image2', '-vcodec', 'png',
        '-y', outPng,
      ])
    } catch {
      try { fs.unlinkSync(tmpVideo) } catch { /* 忽略 */ }
      continue   // 抽帧失败 → 该视频纹理缺省（与之前行为一致）
    }
    try { fs.unlinkSync(tmpVideo) } catch { /* 忽略 */ }
    if (fs.existsSync(outPng) && fs.statSync(outPng).size > 0) {
      for (const r of refs) map.set(r, outPng)
    }
  }
  return map
}

module.exports = { extractSceneVideoFrames, resolveFfmpeg, runFfmpeg, framesCacheDir }
