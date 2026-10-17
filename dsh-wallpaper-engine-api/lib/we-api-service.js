/**
 * dsh-wallpaper-engine-api —— 只读 WE API 服务（进程内）
 * ======================================================
 * 由 dsh-wallpaper-bg 仓库里原来的 `wallpaper-engine-api/server.js` 改写：
 *   - 不再 `require('wallpaper-engine-api')`：列表 / 当前壁纸都直接读 WE 自己的
 *     project.json、config.json，零运行时依赖，也不受第三方包对损坏 project.json
 *     直接抛错的影响；
 *   - 不再 `process.exit(1)`：找不到 WE / 端口被占用 / 监听失败都只反映在
 *     `/health` 与同源状态路由里，插件照常激活，不会拖垮 DSH 启动；
 *   - 增加 Steam 库自动发现（libraryfolders.vdf，覆盖装在第二个 Steam 库里的 WE）；
 *   - 增加 base / port / external / error 状态，供 dsh-wallpaper-bg 自动发现。
 *
 * 端点（全部只读 GET / HEAD，仅绑定 127.0.0.1）：
 *   /health、/                        服务状态
 *   /api/wallpapers                   已安装壁纸列表（含 /wallpapers 等别名）
 *   /api/current[?monitor=]           当前桌面壁纸（含 /current 等别名）
 *   /files/<id>/<rel>                 网页类壁纸目录文件（HTML 注入 WE 私有接口垫片）
 *
 * 隔离原则：
 *   - 只读：绝不调用 WE 的 load / stop / openProfile 等写入接口；
 *   - 不解析 scene.pkg、不截屏、不产生缓存文件；
 *   - 网页壁纸跑在**独立端口**（与 DSH 页面不同源）——不把创意工坊里的第三方
 *     HTML 提升到 DSH 的 origin 上，保持浏览器同源隔离。
 */

import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PLUGIN_NAME = 'dsh-wallpaper-engine-api'
/** 与旧 dsh-wallpaper-engine-api 服务对外的 API 契约保持兼容 */
export const API_COMPAT = '0.5.1'

export const PLUGIN_VERSION = (() => {
  try {
    const file = fileURLToPath(new URL('../package.json', import.meta.url))
    return JSON.parse(fs.readFileSync(file, 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

const HOST = '127.0.0.1'
const DEFAULT_PORT = 8088
const LIST_TTL_MS = 60 * 1000
const VISIBLE_IDS_TTL_MS = 30 * 1000
const RUN_CACHE_TTL_MS = 10 * 1000
const DETECT_RETRY_MS = 15 * 1000

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 带超时的 execFile；失败也 resolve，避免未捕获的 rejection / 同步 spawn 异常 */
function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const done = (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error || null,
      })
    }
    try {
      execFile(
        file,
        args,
        { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024, ...options },
        done,
      )
    } catch (error) {
      // Windows 沙箱 / 受限宿主里 spawn 可能在同步阶段就抛 EPERM；当作“命令不可用”
      done(error)
    }
  })
}

function cleanPath(value) {
  if (typeof value !== 'string') return ''
  let text = value.trim().replace(/^"|"$/g, '')
  if (!text) return ''
  text = text.replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? '')
  if (process.platform === 'win32') text = text.replace(/\//g, '\\')
  return path.normalize(text)
}

function hasWeExe(dir) {
  if (!dir) return false
  return ['wallpaper64.exe', 'wallpaper32.exe', 'wallpaper.exe']
    .some((exe) => fs.existsSync(path.join(dir, exe)))
}

/** 安装目录 → 创意工坊壁纸库目录 */
function deriveWorkshopPath(installPath) {
  // <root>\steamapps\common\wallpaper_engine → <root>\steamapps\workshop\content\431960
  return path.resolve(installPath, '..', '..', 'workshop', 'content', '431960')
}

/** 安装目录 → Steam 根目录 */
function deriveSteamRoot(installPath) {
  return path.resolve(installPath, '..', '..', '..')
}

function toPort(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 65535 ? n : fallback
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {}
  return {
    port: toPort(config.port ?? process.env.WEAPI_PORT ?? process.env.WE_API_PORT, DEFAULT_PORT),
    autoPort: config.autoPort !== false,
    verbose: config.verbose === true || process.env.DSH_WE_API_DEBUG === '1',
    weInstallPath: cleanPath(
      (typeof config.weInstallPath === 'string' && config.weInstallPath) || process.env.WE_INSTALL_PATH,
    ),
    workshopPath: cleanPath(
      (typeof config.workshopPath === 'string' && config.workshopPath) || process.env.WE_WORKSHOP_PATH,
    ),
    subscriptionsFile: cleanPath(
      (typeof config.subscriptionsFile === 'string' && config.subscriptionsFile) ||
        process.env.WE_SUBSCRIPTIONS_FILE,
    ),
  }
}

// ---------------------------------------------------------------------------
// Steam / Wallpaper Engine 路径发现
// ---------------------------------------------------------------------------

/** 读注册表里的 Steam 根目录（SteamPath / InstallPath） */
async function readRegistrySteamRoots() {
  if (process.platform !== 'win32') return []
  const roots = []
  const queries = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
  ]
  for (const [key, name] of queries) {
    const result = await run('reg', ['query', key, '/v', name])
    if (!result.ok) continue
    const match = new RegExp(name + '\\s+REG_SZ\\s+(.+)$', 'im').exec(result.stdout)
    if (match) roots.push(match[1].trim().replace(/^"|"$/g, ''))
  }
  return roots
}

/** 解析 steamapps/libraryfolders.vdf 里的库路径（新版 "path"、旧版 "1" "D:\\..."） */
async function readLibraryFolders(steamRoot) {
  const file = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf')
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const found = []
  const add = (value) => {
    const cleaned = cleanPath(value.replace(/\\\\/g, '\\'))
    if (cleaned && !found.some((item) => item.toLowerCase() === cleaned.toLowerCase())) found.push(cleaned)
  }
  for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) add(match[1])
  for (const match of text.matchAll(/^\s*"\d+"\s+"([^"]+)"\s*$/gm)) add(match[1])
  return found
}

/**
 * 候选 Steam 根目录：注册表 → 各根目录的 libraryfolders.vdf → 常见安装位置。
 * 之所以要读 libraryfolders.vdf：WE 装在第二个 Steam 库时（D:\SteamLibrary\...）
 * 只看常见路径会漏掉。
 */
async function candidateSteamRoots() {
  const roots = []
  const add = (value) => {
    const cleaned = cleanPath(value)
    if (!cleaned) return
    if (roots.some((item) => item.toLowerCase() === cleaned.toLowerCase())) return
    roots.push(cleaned)
  }

  const registryRoots = await readRegistrySteamRoots()
  for (const root of registryRoots) add(root)

  for (const root of registryRoots) {
    for (const library of await readLibraryFolders(root)) add(library)
  }

  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (base) add(path.join(base, 'Steam'))
  }
  for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
    add(drive + ':\\Program Files (x86)\\Steam')
    add(drive + ':\\Program Files\\Steam')
    add(drive + ':\\Steam')
    add(drive + ':\\SteamLibrary')
  }

  // 常见位置本身也可能有 libraryfolders.vdf（例如 D:\SteamLibrary 里有）
  for (const root of [...roots]) {
    if (fs.existsSync(path.join(root, 'steamapps', 'libraryfolders.vdf'))) {
      for (const library of await readLibraryFolders(root)) add(library)
    }
  }
  return roots
}

async function detectWePaths() {
  const roots = await candidateSteamRoots()
  for (const root of roots) {
    const installPath = path.join(root, 'steamapps', 'common', 'wallpaper_engine')
    if (!hasWeExe(installPath)) continue
    return {
      installPath,
      workshopPath: deriveWorkshopPath(installPath),
      steamRoots: roots,
      source: 'auto',
    }
  }
  return { installPath: '', workshopPath: '', steamRoots: roots, source: 'none' }
}

/**
 * 解析本次要用的路径：配置 > 环境变量 > 自动探测。
 * 即使解析失败也返回对象（error 里写明原因），让服务照常监听并如实上报。
 */
async function resolvePaths(config) {
  let installPath = cleanPath(config.weInstallPath)
  let workshopPath = cleanPath(config.workshopPath)
  let steamRoots = []
  let source = installPath || workshopPath ? 'config' : 'none'

  // 只给了壁纸库目录时，先按它所在的 Steam 库反推 WE 安装目录——
  // 比全盘自动探测更准（WE 和壁纸库通常在同一库，但也可能在第二个库）。
  if (!installPath && workshopPath) {
    const derivedInstall = path.resolve(
      workshopPath, '..', '..', '..', '..', 'steamapps', 'common', 'wallpaper_engine',
    )
    if (hasWeExe(derivedInstall)) installPath = derivedInstall
  }

  if (!installPath || !workshopPath) {
    const detected = await detectWePaths()
    steamRoots = detected.steamRoots
    if (!installPath) installPath = detected.installPath
    if (!workshopPath) workshopPath = detected.workshopPath
    if (detected.source === 'auto') source = 'auto'
  } else {
    steamRoots = [deriveSteamRoot(installPath)]
  }

  if (!workshopPath && installPath) workshopPath = deriveWorkshopPath(installPath)

  const installOk = !!installPath && hasWeExe(installPath)
  const workshopOk = !!workshopPath && fs.existsSync(workshopPath)

  let error = ''
  if (!installPath && !workshopPath) {
    error = '未找到 Wallpaper Engine：请确认已在 Steam 安装 Wallpaper Engine；'
      + '装在非默认 Steam 库时会自动读取 libraryfolders.vdf 发现。'
      + '也可以给插件配置 weInstallPath（含 wallpaper64.exe 的目录）或设置环境变量 WE_INSTALL_PATH。'
  } else if (!installOk && !workshopOk) {
    error = 'Wallpaper Engine 路径不可用：安装目录 ' + (installPath || '(未找到)')
      + ' 里找不到 wallpaper64.exe / wallpaper32.exe，创意工坊壁纸库 ' + (workshopPath || '(未找到)')
      + ' 也不存在。请检查插件配置里的 weInstallPath / workshopPath。'
  } else if (!workshopOk) {
    error = '找不到创意工坊壁纸库：' + workshopPath
      + '（先在 Wallpaper Engine 里订阅壁纸；或给插件配置 workshopPath）。'
  } else if (!installOk) {
    error = '找不到 Wallpaper Engine 安装目录：' + (installPath || '(未找到)')
      + '（列表可用，但「同步桌面壁纸」需要读 WE 的 config.json）。'
  }

  return {
    installPath,
    workshopPath,
    subscriptionsFile: cleanPath(config.subscriptionsFile),
    installOk,
    workshopOk,
    steamRoots,
    source,
    error,
  }
}

// ---------------------------------------------------------------------------
// 订阅过滤 / project.json 解析
// ---------------------------------------------------------------------------

/** 解析 Steam UGC 订阅清单，返回仍订阅且未本地禁用的 publishedfileid 集合 */
function parseVisibleIds(text) {
  const visible = new Set()
  const entryRe = /"(\d+)"\s*\{([^}]*)\}/g
  let match
  while ((match = entryRe.exec(text))) {
    const body = match[2]
    const id = /"publishedfileid"\s+"(\d+)"/.exec(body)
    if (!id) continue
    const disabled = /"disabled_locally"\s+"(\d+)"/.exec(body)
    if (disabled && disabled[1] === '1') continue
    visible.add(id[1])
  }
  return visible
}

function findSubscriptionsFiles(paths) {
  if (paths.subscriptionsFile && fs.existsSync(paths.subscriptionsFile)) {
    return [paths.subscriptionsFile]
  }
  const roots = new Set()
  if (paths.workshopPath) {
    roots.add(path.resolve(paths.workshopPath, '..', '..', '..', '..'))
  }
  if (paths.installPath) roots.add(deriveSteamRoot(paths.installPath))
  for (const root of paths.steamRoots || []) roots.add(root)

  const files = []
  const seen = new Set()
  for (const root of roots) {
    const userdataDir = path.join(root, 'userdata')
    let entries
    try {
      entries = fs.readdirSync(userdataDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const file = path.join(userdataDir, entry.name, 'ugc', '431960_subscriptions.vdf')
      if (!fs.existsSync(file)) continue
      const key = file.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      files.push(file)
    }
  }
  return files
}

function readProjectJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 由扩展名兜底判断类型（project.json 的 type 缺失时） */
function inferType(filepath) {
  const ext = path.extname(String(filepath || '')).toLowerCase()
  if (ext === '.pkg') return 'scene'
  if (ext === '.html' || ext === '.htm') return 'web'
  if (/\.(mp4|webm|mkv|avi|mov|m4v)$/i.test(ext)) return 'video'
  if (/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(ext)) return 'image'
  return ''
}

/** 工坊预览图的像素尺寸（只解析 GIF / PNG / JPEG 头；解析不出返回 null） */
function imageSizeOf(file) {
  try {
    const stat = fs.statSync(file)
    if (stat.size > 8 * 1024 * 1024) return null
    const fd = fs.openSync(file, 'r')
    try {
      const head = Buffer.alloc(32)
      const read = fs.readSync(fd, head, 0, 32, 0)
      if (read < 10) return null
      if (head.slice(0, 6).toString('latin1') === 'GIF87a' ||
          head.slice(0, 6).toString('latin1') === 'GIF89a') {
        return { w: head.readUInt16LE(6), h: head.readUInt16LE(8) }
      }
      if (head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) }
      }
      if (head[0] === 0xff && head[1] === 0xd8) {
        const buf = fs.readFileSync(file)
        let i = 2
        while (i + 9 < buf.length) {
          if (buf[i] !== 0xff) { i++; continue }
          const marker = buf[i + 1]
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
          }
          const len = buf.readUInt16BE(i + 2)
          if (len <= 0) break
          i += 2 + len
        }
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    /* 解析失败不影响壁纸本身 */
  }
  return null
}

/** project.json + 目录 → 插件可消费的条目 */
function projectItem(dir, id, projectJson) {
  const type = projectJson && typeof projectJson.type === 'string' && projectJson.type
    ? projectJson.type.trim().toLowerCase()
    : ''
  let filepath = ''
  let entry = ''
  if (projectJson && typeof projectJson.file === 'string' && projectJson.file) {
    entry = projectJson.file
    const candidate = path.resolve(dir, projectJson.file)
    if (fs.existsSync(candidate)) filepath = candidate
  }

  const gifPath = path.join(dir, 'preview.gif')
  const previewRel = projectJson && typeof projectJson.preview === 'string' ? projectJson.preview : ''
  const previewPath = previewRel ? path.resolve(dir, previewRel) : ''
  const previewFile = fs.existsSync(gifPath)
    ? gifPath
    : (previewPath && fs.existsSync(previewPath) ? previewPath : '')
  const previewSize = previewFile ? imageSizeOf(previewFile) : null

  return {
    id: String(id),
    title: projectJson && typeof projectJson.title === 'string' && projectJson.title
      ? projectJson.title
      : String(id),
    type: type || inferType(filepath),
    filepath,
    entry,
    thumbnail: previewFile,
    previewUrl: '',
    previewFile,
    previewSize,
    tags: projectJson && Array.isArray(projectJson.tags) ? projectJson.tags : [],
    description: projectJson && typeof projectJson.description === 'string'
      ? projectJson.description
      : '',
    rating: projectJson && typeof projectJson.contentrating === 'string'
      ? projectJson.contentrating.trim().toLowerCase()
      : '',
  }
}

// ---------------------------------------------------------------------------
// 列表 / 当前壁纸
// ---------------------------------------------------------------------------

let listCache = { key: '', time: 0, items: null, hidden: 0, skipped: 0 }
let visibleIdsCache = { key: '', time: 0, ids: null }

function loadVisibleIds(paths) {
  const files = findSubscriptionsFiles(paths)
  const key = files.join('|')
  if (visibleIdsCache.key === key && Date.now() - visibleIdsCache.time < VISIBLE_IDS_TTL_MS) {
    return visibleIdsCache.ids
  }
  let ids = null
  if (files.length) {
    const set = new Set()
    for (const file of files) {
      try {
        for (const id of parseVisibleIds(fs.readFileSync(file, 'utf8'))) set.add(id)
      } catch {
        /* 单份清单读不了就跳过 */
      }
    }
    ids = set.size ? set : null
  }
  visibleIdsCache = { key, time: Date.now(), ids }
  return ids
}

function getWallpapers(refresh, paths) {
  const key = paths.workshopPath
  if (!refresh && listCache.items && listCache.key === key &&
      Date.now() - listCache.time < LIST_TTL_MS) {
    return listCache
  }

  let entries
  try {
    entries = fs.readdirSync(paths.workshopPath, { withFileTypes: true })
  } catch (error) {
    throw new Error('读取壁纸库失败：' + (error && error.message ? error.message : error))
  }

  const items = []
  let skipped = 0
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const dir = path.join(paths.workshopPath, entry.name)
    const projectJson = readProjectJson(path.join(dir, 'project.json'))
    if (!projectJson) {
      skipped++
      continue
    }
    items.push(projectItem(dir, entry.name, projectJson))
  }

  const visibleIds = loadVisibleIds(paths)
  let hidden = 0
  let filtered = items
  if (visibleIds) {
    const before = items.length
    filtered = items.filter((item) => visibleIds.has(String(item.id)))
    hidden = before - filtered.length
  }

  listCache = { key, time: Date.now(), items: filtered, hidden, skipped }
  return listCache
}

/** WE 的 config.json 顶层按 Windows 用户名分节；取当前用户的 general 节 */
function currentUserGeneral(cfg) {
  if (!cfg || typeof cfg !== 'object') return null
  const username = os.userInfo().username
  if (cfg[username] && cfg[username].general) return cfg[username].general
  for (const key of Object.keys(cfg)) {
    if (key.toLowerCase() === username.toLowerCase() && cfg[key] && cfg[key].general) {
      return cfg[key].general
    }
  }
  return null
}

function readWeConfig(installPath) {
  if (!installPath) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(installPath, 'config.json'), 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

/** 各显示器当前壁纸文件：{ Monitor0: 'E:\\…\\scene.pkg', … } */
function selectedWallpaperFiles(cfg) {
  const general = currentUserGeneral(cfg)
  const selected = general && general.wallpaperconfig && general.wallpaperconfig.selectedwallpapers
  const out = new Map()
  if (!selected || typeof selected !== 'object') return out
  for (const key of Object.keys(selected)) {
    const entry = selected[key]
    const file = entry && typeof entry.file === 'string' ? entry.file : ''
    if (key && file) out.set(key, path.normalize(file))
  }
  return new Map([...out.entries()].sort((a, b) => {
    const ma = /^Monitor(\d+)$/i.exec(a[0])
    const mb = /^Monitor(\d+)$/i.exec(b[0])
    if (ma && mb) return Number(ma[1]) - Number(mb[1])
    return a[0].localeCompare(b[0])
  }))
}

function configFiles(entry) {
  const selected = entry && entry.config && entry.config.selectedwallpapers
  const out = {}
  if (selected && typeof selected === 'object') {
    for (const key of Object.keys(selected)) {
      out[key] = String((selected[key] && selected[key].file) || '')
    }
  }
  return out
}

/** 用户最近真正换过壁纸的是哪台显示器（wallpaperconfigrecent 最后两条的差异） */
function lastChangedMonitorKey(cfg) {
  const general = currentUserGeneral(cfg)
  const recent = general && general.wallpaperconfigrecent
  if (!Array.isArray(recent) || recent.length < 2) return null
  const latest = configFiles(recent[recent.length - 1])
  const previous = configFiles(recent[recent.length - 2])
  const keys = new Set([...Object.keys(latest), ...Object.keys(previous)])
  const changed = [...keys].filter((key) => (latest[key] || '') !== (previous[key] || ''))
  return changed.length === 1 ? changed[0] : null
}

/** 壁纸配置里的 file 可能指向 project.json，这里解出真正被读取的媒体文件 */
function mediaFileOf(file) {
  const norm = path.normalize(file)
  if (path.basename(norm).toLowerCase() !== 'project.json') return norm
  const projectJson = readProjectJson(norm)
  if (projectJson && typeof projectJson.file === 'string' && projectJson.file) {
    return path.join(path.dirname(norm), projectJson.file)
  }
  return norm
}

/** 正在被 WE 读取 / 播放的那张壁纸在哪台显示器：媒体文件 atime 最新者 */
function liveMonitorKey(files) {
  let key = null
  let newest = 0
  let second = 0
  for (const [monitor, file] of files) {
    let atime = 0
    try {
      atime = fs.statSync(mediaFileOf(file)).atimeMs
    } catch {
      atime = 0
    }
    if (atime > newest) {
      second = newest
      newest = atime
      key = monitor
    } else if (atime > second) {
      second = atime
    }
  }
  if (!key || newest <= 0) return null
  return { key, exclusive: newest > second }
}

function normalizeMonitorParam(raw, files) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text || /^auto$/i.test(text)) return null
  if (files.has(text)) return text
  const match = /^(?:monitor)?\s*(\d+)$/i.exec(text)
  if (match) {
    const key = 'Monitor' + match[1]
    if (files.has(key)) return key
  }
  return null
}

/** 由壁纸文件构造「当前壁纸」条目 */
function itemFromWallpaperFile(file) {
  try {
    let norm = path.normalize(file)
    const dir = path.dirname(norm)
    if (!fs.existsSync(norm)) return null
    const projectJson = readProjectJson(path.join(dir, 'project.json'))

    if (path.basename(norm).toLowerCase() === 'project.json') {
      if (projectJson && typeof projectJson.file === 'string' && projectJson.file) {
        const candidate = path.join(dir, projectJson.file)
        if (fs.existsSync(candidate)) norm = candidate
      } else {
        return null
      }
    }

    const item = projectItem(dir, path.basename(dir), projectJson)
    item.filepath = norm
    if (projectJson && typeof projectJson.file === 'string') item.entry = projectJson.file
    return item
  } catch {
    return null
  }
}

/**
 * 解析「当前桌面壁纸」：跟随哪台显示器 + 那台的壁纸条目。
 * monitorSource: manual | changed | live | first | none
 */
function resolveCurrent(monitorParam, paths) {
  const cfg = readWeConfig(paths.installPath)
  if (!cfg) {
    return {
      current: null,
      monitor: null,
      monitorSource: 'none',
      monitors: [],
      error: '读不到 ' + path.join(paths.installPath || '', 'config.json')
        + '（Wallpaper Engine 是否安装在该目录？）',
    }
  }
  const files = selectedWallpaperFiles(cfg)
  if (!files.size) {
    return { current: null, monitor: null, monitorSource: 'none', monitors: [] }
  }

  const manual = normalizeMonitorParam(monitorParam, files)
  const changed = lastChangedMonitorKey(cfg)
  const live = liveMonitorKey(files)

  let monitor = null
  let source = ''
  if (manual) {
    monitor = manual
    source = 'manual'
  } else if (changed && files.has(changed)) {
    monitor = changed
    source = 'changed'
  } else if (live && live.exclusive) {
    monitor = live.key
    source = 'live'
  } else {
    monitor = [...files.keys()][0]
    source = 'first'
  }

  const items = new Map()
  for (const [key, file] of files) items.set(key, itemFromWallpaperFile(file))
  const monitors = [...files.keys()].map((key) => {
    const item = items.get(key) || null
    return {
      key,
      title: item ? item.title : null,
      type: item ? item.type : '',
      live: !!(live && live.key === key),
      selected: key === monitor,
    }
  })
  return { current: items.get(monitor) || null, monitor, monitorSource: source, monitors }
}

// ---------------------------------------------------------------------------
// WE 是否在运行（仅 /health 展示；不拉起 WE 主程序）
// ---------------------------------------------------------------------------

let runCache = { time: 0, running: false }
function isWeRunning() {
  if (process.platform !== 'win32') return Promise.resolve(false)
  if (Date.now() - runCache.time < RUN_CACHE_TTL_MS) return Promise.resolve(runCache.running)
  return run('tasklist', ['/NH'], { timeout: 3000, maxBuffer: 16 * 1024 * 1024 }).then((result) => {
    const running = result.ok && /wallpaper(32|64)\.exe|wallpaperservice32\.exe/i.test(result.stdout)
    runCache = { time: Date.now(), running }
    return running
  })
}

// ---------------------------------------------------------------------------
// 网页类壁纸目录文件服务
// ---------------------------------------------------------------------------

const WEB_FILE_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
}

/**
 * 网页壁纸兼容垫片：WE 用 file:// 加载网页壁纸并注入私有接口，裸 iframe 没有这些。
 * 详见旧服务实现；行为与 0.5.1 一致。
 */
function buildWeShim(props, id) {
  const defaults = {}
  for (const [key, value] of Object.entries(props || {})) {
    if (value && typeof value === 'object' && 'value' in value) defaults[key] = value.value
  }
  const json = JSON.stringify(defaults).replace(/</g, '\\u003c')
  return `;(function(){
  if (window.__wbgWeShim) return;
  window.__wbgWeShim = 1;
  var DEFAULTS = ${json};
  var ID = ${JSON.stringify(String(id))};
  function report(type, payload) {
    try { parent.postMessage({ __wbg: 1, type: type, id: ID, payload: payload || null }, '*'); } catch (e) {}
  }
  // ── 用户属性：project.json 默认值 ──
  var listeners = [];
  var props = {};
  Object.keys(DEFAULTS).forEach(function (k) { props[k] = DEFAULTS[k]; });
  window.wallpaperPropertyListener = window.wallpaperPropertyListener || {};
  var origApply = window.wallpaperPropertyListener.applyUserProperties;
  window.wallpaperPropertyListener.applyUserProperties = function (values) {
    try { Object.keys(values || {}).forEach(function (k) { props[k] = values[k]; }); } catch (e) {}
    try { if (typeof origApply === 'function') origApply(values); } catch (e) { report('error', { message: String(e && e.message || e) }); }
    listeners.forEach(function (fn) { try { fn(values || {}) } catch (e) {} });
  };
  // ── 媒体 / 音频接口占位（浏览器里没有 WE 的采集与播放通道）──
  var noop = function () { return { cancel: function () {} }; };
  var mediaNames = ["wallpaperRegisterMediaPlaybackListener","wallpaperRegisterMediaPropertiesListener","wallpaperRegisterMediaThumbnailListener","wallpaperRegisterMediaTimelineListener","wallpaperRegisterMediaStatusListener"];
  mediaNames.forEach(function (n) { if (typeof window[n] !== 'function') window[n] = noop; });
  if (typeof window.wallpaperMediaIntegration !== 'object' || !window.wallpaperMediaIntegration) {
    window.wallpaperMediaIntegration = { enabled: false, requestAllThumbnails: function () {}, requestThumbnail: function () {} };
  }
  if (typeof window.wallpaperRegisterAudioListener !== 'function') {
    // 静音频谱：16 段左右声道全 0，避免壁纸因 undefined 抛错
    window.wallpaperRegisterAudioListener = function (cb) {
      if (typeof cb !== 'function') return;
      var silence = new Array(16).fill(0);
      var tick = function () { try { cb(silence, silence) } catch (e) {} };
      var timer = setInterval(tick, 250);
      tick();
      return { cancel: function () { clearInterval(timer) } };
    };
  }
  // ── 「已画出内容」上报：canvas 像素 / img / video / 元素背景采样 ──
  var painted = false;
  function hasPaint() {
    try {
      var c = document.querySelector('canvas');
      if (c && c.width > 8 && c.height > 8) {
        var cx = c.getContext('2d');
        if (cx) {
          var w = Math.min(c.width, 48), h = Math.min(c.height, 27);
          var d = cx.getImageData(0, 0, w, h).data;
          for (var i = 3; i < d.length; i += 4) { if (d[i] > 8) return true; }
        }
      }
      var imgs = document.querySelectorAll('img');
      for (var j = 0; j < imgs.length; j++) {
        var im = imgs[j];
        if (im.complete && im.naturalWidth > 8 && im.offsetWidth > 8) return true;
      }
      var vids = document.querySelectorAll('video');
      for (var k = 0; k < vids.length; k++) {
        if (vids[k].readyState >= 2 && vids[k].videoWidth > 8) return true;
      }
      var els = document.querySelectorAll('div,section,main,body>canvas');
      for (var m = 0; m < Math.min(els.length, 80); m++) {
        var s = getComputedStyle(els[m]);
        if (s.backgroundImage && s.backgroundImage !== 'none') return true;
      }
    } catch (e) { /* 跨域 canvas 等：忽略，交给兜底 */ }
    return false;
  }
  function check() {
    if (painted) return;
    if (hasPaint()) { painted = true; report('painted'); }
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    check();
    if (painted || tries > 120) clearInterval(timer);
  }, 250);
  window.addEventListener('load', function () {
    try { window.wallpaperPropertyListener.applyUserProperties(props) } catch (e) {}
    setTimeout(check, 60);
    setTimeout(check, 300);
    setTimeout(check, 1200);
  });
  if (document.readyState === 'complete') {
    setTimeout(function () { try { window.wallpaperPropertyListener.applyUserProperties(props) } catch (e) {} }, 0);
  }
})();`
}

function injectWeShim(html, props, id) {
  const tag = '<script data-wbg-we-shim="1">' + buildWeShim(props, id) + '</script>'
  const headOpen = /<head[^>]*>/i.exec(html)
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length
    return html.slice(0, at) + tag + html.slice(at)
  }
  const htmlOpen = /<html[^>]*>/i.exec(html)
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length
    return html.slice(0, at) + tag + html.slice(at)
  }
  return tag + html
}

function sendJson(req, res, code, obj) {
  if (res.headersSent) {
    try { res.end() } catch { /* 已断开 */ }
    return
  }
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  try {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    })
    if (req.method === 'HEAD') res.end()
    else res.end(body)
  } catch {
    /* 连接已断开 */
  }
}

/**
 * 只读地服务 workshop 目录里的文件：
 *   GET /files/<workshopId>/<相对路径>
 * 约束：id 仅数字、必须在订阅清单内（清单缺失时跳过该检查）、
 * 解析后的绝对路径必须落在 <workshopPath>\<id> 目录内。
 */
function serveWorkshopFile(req, res, id, relIn, paths) {
  if (!/^\d{1,20}$/.test(String(id || ''))) {
    return sendJson(req, res, 400, { ok: false, error: '非法壁纸 ID' })
  }
  const visibleIds = loadVisibleIds(paths)
  if (visibleIds && !visibleIds.has(id)) {
    return sendJson(req, res, 403, { ok: false, error: '该壁纸未订阅或已本地禁用' })
  }
  const root = path.join(paths.workshopPath, id)
  if (!fs.existsSync(root)) return sendJson(req, res, 404, { ok: false, error: '壁纸目录不存在' })

  const rel = relIn || 'index.html'
  let file
  try {
    file = path.resolve(root, rel)
    if (file !== root && !file.startsWith(root + path.sep)) {
      return sendJson(req, res, 403, { ok: false, error: '路径越界' })
    }
  } catch {
    return sendJson(req, res, 400, { ok: false, error: '非法路径' })
  }

  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return sendJson(req, res, 404, { ok: false, error: '文件不存在' })
  }
  if (!stat.isFile()) return sendJson(req, res, 404, { ok: false, error: '不是文件' })

  const ext = path.extname(file).toLowerCase()
  const mime = WEB_FILE_MIME[ext] || 'application/octet-stream'
  const isHtml = ext === '.html' || ext === '.htm'
  const etag = '"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"'

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300' })
    return res.end()
  }

  const headers = {
    'Content-Type': mime,
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  }

  // HTML 需要注入垫片，读进内存；其它文件一律流式发送
  if (isHtml) {
    let html
    try {
      html = fs.readFileSync(file, 'utf8')
    } catch {
      return sendJson(req, res, 500, { ok: false, error: '读取失败' })
    }
    const dest = String(req.headers['sec-fetch-dest'] || '')
    const asDocument = dest === '' || dest === 'iframe' || dest === 'document' || dest === 'frame'
    const looksDoc = /<body[\s>]/i.test(html) || /<html[\s>]/i.test(html)
    if (asDocument && looksDoc) {
      const projectJson = readProjectJson(path.join(root, 'project.json'))
      html = injectWeShim(html, projectJson && projectJson.general ? projectJson.general.properties : null, id)
    }
    const buf = Buffer.from(html, 'utf8')
    headers['Content-Length'] = String(buf.length)
    res.writeHead(200, headers)
    if (req.method === 'HEAD') return res.end()
    return res.end(buf)
  }

  let start = 0
  let end = stat.size - 1
  let code = 200
  const range = req.headers.range
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (match) {
      let from = match[1] ? parseInt(match[1], 10) : 0
      let to = match[2] ? parseInt(match[2], 10) : stat.size - 1
      if (Number.isNaN(from)) from = 0
      if (Number.isNaN(to)) to = stat.size - 1
      if (from > to || from >= stat.size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size })
        return res.end()
      }
      start = from
      end = Math.min(to, stat.size - 1)
      code = 206
    }
  }
  headers['Content-Length'] = String(end - start + 1)
  if (code === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size
  res.writeHead(code, headers)
  if (req.method === 'HEAD') return res.end()
  const stream = createReadStream(file, { start, end })
  stream.on('error', () => {
    try { res.destroy() } catch { /* 已断开 */ }
  })
  stream.pipe(res)
  return undefined
}

function parseFilesPath(pathname) {
  let rest
  try {
    rest = decodeURIComponent(pathname.slice('/files/'.length))
  } catch {
    return { badEncoding: true }
  }
  const segments = rest.split('/').filter(Boolean)
  const id = segments.shift() || ''
  if (!/^\d{1,20}$/.test(id)) return null
  return { id, rel: segments.join('/') }
}

function refererWorkshopId(req) {
  const referer = req.headers.referer || req.headers.referrer
  if (typeof referer !== 'string') return null
  const match = /^https?:\/\/[^/]*\/files\/(\d{1,20})\//i.exec(referer)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// 端口探测 / 监听
// ---------------------------------------------------------------------------

async function probeExternal(port) {
  if (!port) return null
  try {
    const response = await fetch('http://' + HOST + ':' + port + '/health', {
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return null
    const data = await response.json()
    const known = data && (
      data.service === 'we-api-proxy' ||
      data.service === PLUGIN_NAME ||
      data.plugin === PLUGIN_NAME
    )
    if (!known) return null
    return { base: 'http://' + HOST + ':' + port, health: data }
  } catch {
    return null
  }
}

function listenErrorMessage(error, port) {
  if (error && error.code === 'EADDRINUSE') {
    return '端口 ' + port + ' 已被其它程序占用。可以把插件配置里的 port 改成别的值（默认 8088），'
      + '或关闭占用该端口的程序后重启 DSH。'
  }
  if (error && error.code === 'EACCES') {
    return '没有权限监听 ' + HOST + ':' + port + '。请换一个端口（通常是 1024–65535）。'
  }
  return '监听 ' + HOST + ':' + port + ' 失败：' + ((error && error.message) || error)
}

// ---------------------------------------------------------------------------
// 服务对象
// ---------------------------------------------------------------------------

/**
 * @param {object} [rawConfig]
 * @returns {{ start(): Promise<void>, stop(): Promise<void>, status(): Promise<object>, getConfig(): object }}
 */
export function createWeApiService(rawConfig = {}) {
  const config = normalizeConfig(rawConfig)

  const state = {
    status: 'idle',
    server: null,
    port: null,
    base: '',
    external: false,
    externalService: '',
    externalHealth: null,
    fallbackFrom: null,
    error: '',
    startedAt: null,
    paths: null,
  }

  let startPromise = null
  let lastDetectAt = 0
  let lastErrorLogged = ''

  function log(...args) {
    if (config.verbose || process.env.DSH_WE_API_DEBUG === '1') {
      console.log('[dsh-wallpaper-engine-api]', ...args)
    }
  }

  function logError(message) {
    if (message === lastErrorLogged) return
    lastErrorLogged = message
    console.error('[dsh-wallpaper-engine-api] ' + message)
  }

  /** 路径解析结果缓存；失败时最多每 15 秒重试一次（用户可能刚装好 WE / 订阅壁纸） */
  async function ensurePaths(force = false) {
    if (state.paths && !force && !state.paths.error) return state.paths
    if (!force && state.paths && Date.now() - lastDetectAt < DETECT_RETRY_MS) return state.paths
    lastDetectAt = Date.now()
    const next = await resolvePaths(config)
    state.paths = next
    if (next.error) logError(next.error)
    return next
  }

  async function healthPayload(paths, weRunning) {
    const running = state.status === 'running' || state.status === 'external'
    const subscriptionFiles = findSubscriptionsFiles(paths)
    return {
      ok: running,
      service: PLUGIN_NAME,
      plugin: PLUGIN_NAME,
      version: PLUGIN_VERSION,
      api: API_COMPAT,
      status: state.status,
      running,
      external: state.external,
      externalService: state.externalService || '',
      base: state.base || '',
      port: state.port,
      requestedPort: config.port,
      fallbackFrom: state.fallbackFrom,
      mode: 'readonly',
      webShim: 1,
      monitorSelect: 1,
      weInstallPath: paths.installPath || '',
      workshopPath: paths.workshopPath || '',
      subscriptionsFile: subscriptionFiles.length
        ? subscriptionFiles.join('; ')
        : (paths.subscriptionsFile || ''),
      pathsSource: paths.source,
      weRunning: weRunning === undefined ? await isWeRunning() : weRunning,
      error: state.error || paths.error || '',
      startedAt: state.startedAt,
      time: new Date().toISOString(),
    }
  }

  async function handleRequest(req, res) {
    let url
    try {
      url = new URL(req.url, 'http://' + HOST)
    } catch {
      return sendJson(req, res, 400, { ok: false, error: '非法 URL' })
    }
    const pathname = url.pathname.replace(/\/+$/, '') || '/'

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(req, res, 405, { ok: false, error: '只读服务，仅支持 GET / HEAD' })
    }

    const paths = await ensurePaths(false)

    if (pathname === '/' || pathname === '/health' || pathname === '/api/health') {
      return sendJson(req, res, 200, await healthPayload(paths))
    }

    if (pathname === '/api/wallpapers' || pathname === '/wallpapers' ||
        pathname === '/api/wallpapers/list' || pathname === '/api/list' || pathname === '/list') {
      if (!paths.workshopOk) {
        return sendJson(req, res, 503, { ok: false, error: paths.error || '找不到创意工坊壁纸库' })
      }
      try {
        const refresh = url.searchParams.get('refresh') === '1'
        const cache = getWallpapers(refresh, paths)
        return sendJson(req, res, 200, {
          ok: true,
          wallpapers: cache.items,
          count: cache.items.length,
          hiddenUnsubscribed: cache.hidden,
          skippedNoProject: cache.skipped,
        })
      } catch (error) {
        return sendJson(req, res, 500, { ok: false, error: String((error && error.message) || error) })
      }
    }

    if (pathname === '/api/current' || pathname === '/current' ||
        pathname === '/api/wallpapers/current' || pathname === '/wallpapers/current' ||
        pathname === '/api/state') {
      if (!paths.installOk) {
        return sendJson(req, res, 503, { ok: false, error: paths.error || '找不到 Wallpaper Engine 安装目录' })
      }
      try {
        const monitor = url.searchParams.get('monitor') || url.searchParams.get('m') || ''
        return sendJson(req, res, 200, Object.assign({ ok: true }, resolveCurrent(monitor, paths)))
      } catch (error) {
        return sendJson(req, res, 500, { ok: false, error: String((error && error.message) || error) })
      }
    }

    if (pathname.startsWith('/files/')) {
      if (!paths.workshopOk) {
        return sendJson(req, res, 503, { ok: false, error: paths.error || '找不到创意工坊壁纸库' })
      }
      const parsed = parseFilesPath(pathname)
      if (parsed && parsed.badEncoding) {
        return sendJson(req, res, 400, { ok: false, error: '非法路径编码' })
      }
      if (parsed) return serveWorkshopFile(req, res, parsed.id, parsed.rel, paths)

      // 首段不是数字 ID：壁纸按 file:// 写死的 `../assets/...` 会被浏览器折叠成
      // /files/assets/...，这里用 Referer 里的壁纸 ID 兜底（路径仍限制在该目录内）
      const refererId = refererWorkshopId(req)
      if (refererId) {
        let rel
        try {
          rel = decodeURIComponent(pathname.slice('/files/'.length))
        } catch {
          return sendJson(req, res, 400, { ok: false, error: '非法路径编码' })
        }
        return serveWorkshopFile(req, res, refererId, rel, paths)
      }
      return sendJson(req, res, 400, { ok: false, error: '非法壁纸 ID' })
    }

    return sendJson(req, res, 404, { ok: false, error: '未知端点: ' + pathname })
  }

  function createServer() {
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch((error) => {
        try {
          sendJson(req, res, 500, { ok: false, error: String((error && error.message) || error) })
        } catch {
          /* 已断开 */
        }
      })
    })
    server.keepAliveTimeout = 5000
    server.on('clientError', (_error, socket) => {
      try { socket.destroy() } catch { /* 已断开 */ }
    })
    return server
  }

  function tryListen(port) {
    return new Promise((resolve) => {
      const server = createServer()
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        server.removeListener('error', onError)
        resolve(result)
      }
      const onError = (error) => {
        try { server.close() } catch { /* 从未开始监听 */ }
        finish({ ok: false, code: error && error.code, error })
      }
      server.once('error', onError)
      server.listen(port, HOST, () => {
        finish({ ok: true, server, port: server.address().port })
      })
    })
  }

  async function doStart() {
    state.startedAt = new Date().toISOString()
    if (process.platform !== 'win32') {
      state.status = 'unsupported'
      state.error = 'dsh-wallpaper-engine-api 只支持 Windows（Wallpaper Engine 没有非 Windows 版本）。'
      return
    }

    state.status = 'starting'
    const paths = await ensurePaths(true)

    const requested = config.port
    if (requested !== 0) {
      // 先探测：旧的 WE API 服务已经在该端口上 → 直接复用，不再抢端口
      const existing = await probeExternal(requested)
      if (existing) {
        state.external = true
        state.externalService = existing.health.service || ''
        state.externalHealth = existing.health
        state.base = existing.base
        state.port = requested
        state.status = 'external'
        log('端口 ' + requested + ' 上已有 WE API 服务（' + state.externalService + '），直接复用。')
        return
      }
    }

    let result = await tryListen(requested)
    let attempted = requested

    if (!result.ok && config.autoPort) {
      state.fallbackFrom = requested
      const alternative = requested === 0 ? 0 : requested + 1
      if (alternative !== requested) {
        // 换端口前也探测一下：若已有另一个 WE API 在候选端口，同样复用
        const existing = await probeExternal(alternative)
        if (existing) {
          state.external = true
          state.externalService = existing.health.service || ''
          state.externalHealth = existing.health
          state.base = existing.base
          state.port = alternative
          state.status = 'external'
          log('端口 ' + alternative + ' 上已有 WE API 服务（' + state.externalService + '），直接复用。')
          return
        }
        attempted = alternative
        result = await tryListen(alternative)
      }
      if (!result.ok) {
        attempted = 0
        result = await tryListen(0)
      }
    }

    if (!result.ok) {
      state.status = 'error'
      state.error = listenErrorMessage(result.error, attempted)
      logError(state.error)
      return
    }

    state.server = result.server
    state.port = result.port
    state.base = 'http://' + HOST + ':' + result.port
    state.status = 'running'
    state.error = paths.error || ''
    log('只读 WE API 已启动：' + state.base + '（壁纸库：' + (paths.workshopPath || '未找到') + '）')
  }

  function start() {
    if (!startPromise) startPromise = doStart().catch((error) => {
      state.status = 'error'
      state.error = String((error && error.message) || error)
      logError(state.error)
    })
    return startPromise
  }

  async function stop() {
    const server = state.server
    state.server = null
    if (server) {
      try { server.closeAllConnections?.() } catch { /* 旧 Node / 无连接 */ }
      await new Promise((resolve) => {
        try {
          server.close(() => resolve())
        } catch {
          resolve()
        }
      })
    }
    if (state.status === 'running' || state.status === 'starting') state.status = 'stopped'
  }

  async function status() {
    if (startPromise) await startPromise
    const paths = await ensurePaths(false)
    const running = state.status === 'running' || state.status === 'external'
    const weRunning = running ? await isWeRunning() : false
    return healthPayload(paths, weRunning)
  }

  return { start, stop, status, getConfig: () => ({ ...config }) }
}

export default { createWeApiService, PLUGIN_NAME, PLUGIN_VERSION, API_COMPAT }
