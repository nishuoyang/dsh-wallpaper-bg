/**
 * WE API 只读代理服务
 * ====================
 * 为 dsh-wallpaper-bg 插件提供 Wallpaper Engine 壁纸库的只读 HTTP API。
 *
 * 端点（全部只读 GET，仅绑定 127.0.0.1）：
 *   GET /health、/            → 服务状态
 *   GET /api/wallpapers       → 已安装壁纸列表（含 /wallpapers 等别名）
 *   GET /api/current          → 当前桌面壁纸（含 /current 等别名）
 *
 * 隔离原则：
 *   - 只调用 wallpaper-engine-api 的 listWallpapers() / wallpaper().current()，
 *     绝不触碰 load / stop / openProfile 等写入接口，桌面壁纸不受任何影响；
 *   - 调用 current() 前先用 tasklist 确认 WE 正在运行，未运行直接返回 null，
 *     避免 -control 命令意外拉起 Wallpaper Engine 主程序。
 *
 * 订阅过滤：列表按 Steam UGC 订阅清单（userdata/<id>/ugc/431960_subscriptions.vdf）
 * 过滤，已退订 / 本地禁用但文件夹仍残留的壁纸不会出现在列表里，与 WE 界面一致；
 * 清单读不到时退化为不过滤。可用环境变量 WE_SUBSCRIPTIONS_FILE 或
 * we-api.config 的 WE_SUBSCRIPTIONS_FILE 显式指定清单路径。
 *
 * 路径解析优先级：环境变量 > 同目录 we-api.config（由 启动服务.bat 首次运行
 * 向导写入）> 自动探测（注册表 SteamPath → 常见 Steam 安装位置）。
 *
 * 环境变量（可选）：
 *   WEAPI_PORT        端口，默认 8088（8080 被 Jenkins 占用）
 *   WE_INSTALL_PATH   WE 安装目录（含 wallpaper64.exe / wallpaper32.exe）
 *   WE_WORKSHOP_PATH  创意工坊壁纸库目录（...\steamapps\workshop\content\431960）
 */

'use strict'

const http = require('http')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')
const { WallpaperEngineApi } = require('wallpaper-engine-api')

const PORT = Number(process.env.WEAPI_PORT || 8088)
const HOST = '127.0.0.1'

// ---------------------------------------------------------------------------
// 路径解析：环境变量 > we-api.config > 自动探测
// ---------------------------------------------------------------------------

function readConfigFile() {
  try {
    const cfgPath = path.join(__dirname, 'we-api.config')
    const text = fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, '')
    const lines = {}
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      lines[line.slice(0, eq).trim().toUpperCase()] = line.slice(eq + 1).trim()
    }
    return lines
  } catch {
    return {}
  }
}

/** 候选 Steam 根目录：注册表 SteamPath 优先，其次常见安装位置 */
function candidateSteamRoots() {
  const roots = []
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true },
    ).toString()
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out)
    if (m) roots.push(path.normalize(m[1].trim().replace(/^"|"$/g, '')))
  } catch {
    /* 注册表读不到就跳过 */
  }
  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    roots.push(drive + ':\\Program Files (x86)\\Steam')
    roots.push(drive + ':\\Program Files\\Steam')
    roots.push(drive + ':\\Steam')
  }
  return roots
}

/** 自动探测 WE 安装目录（返回含 wallpaper64/32.exe 的目录，找不到返回 null） */
function detectWeInstallPath() {
  for (const root of candidateSteamRoots()) {
    const weDir = path.join(root, 'steamapps', 'common', 'wallpaper_engine')
    if (fs.existsSync(path.join(weDir, 'wallpaper64.exe')) ||
        fs.existsSync(path.join(weDir, 'wallpaper32.exe'))) {
      return weDir
    }
  }
  return null
}

/** 由安装目录推导创意工坊壁纸库目录（允许被单独覆盖） */
function deriveWorkshopPath(installPath) {
  const steamapps = path.join(installPath, '..', '..')
  return path.normalize(path.join(steamapps, 'workshop', 'content', '431960'))
}

const cfgFile = readConfigFile()

let WE_INSTALL_PATH =
  process.env.WE_INSTALL_PATH ||
  cfgFile.WE_INSTALL_PATH ||
  detectWeInstallPath()
if (!WE_INSTALL_PATH) {
  console.error('[WE-API] 未找到 Wallpaper Engine。请通过 启动服务.bat 填写安装目录，')
  console.error('[WE-API] 或设置环境变量 WE_INSTALL_PATH 指向含 wallpaper64.exe 的目录。')
  process.exit(1)
}

const WE_WORKSHOP_PATH =
  process.env.WE_WORKSHOP_PATH ||
  cfgFile.WE_WORKSHOP_PATH ||
  deriveWorkshopPath(WE_INSTALL_PATH)

// ---------------------------------------------------------------------------
// 初始化 wallpaper-engine-api（构造函数会校验 WE 可执行文件是否存在）
// ---------------------------------------------------------------------------

let we
try {
  we = new WallpaperEngineApi(WE_INSTALL_PATH, WE_WORKSHOP_PATH, false)
} catch (err) {
  console.error('[WE-API] Wallpaper Engine 初始化失败：' + (err && err.message ? err.message : err))
  console.error('[WE-API] 当前使用的安装目录：' + WE_INSTALL_PATH)
  console.error('[WE-API] 请双击 启动服务.bat 重新填写正确的安装目录，')
  console.error('[WE-API] 或用环境变量 WE_INSTALL_PATH / WE_WORKSHOP_PATH 覆盖。')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Steam 订阅过滤（与 WE 界面一致：退订 / 本地禁用的壁纸不再出现在列表里）
// ---------------------------------------------------------------------------

/**
 * 解析 Steam UGC 订阅清单（userdata/<id>/ugc/431960_subscriptions.vdf），
 * 返回仍然订阅且未被本地禁用的 publishedfileid 集合。
 * 背景：从 WE 退订壁纸后，Steam 会立刻把条目从订阅清单移除，但 workshop
 * content 目录下的文件夹删除可能被延迟（文件被占用等），wallpaper-engine-api
 * 只按文件夹列目录，就会把「已退订但文件夹还在」的壁纸列出来——与 WE 界面
 * 不一致。所以这里按真实订阅清单过滤。清单读不到时返回 null（不过滤）。
 */
function parseVisibleIds(text) {
  const visible = new Set()
  const entryRe = /"(\d+)"\s*\{([^}]*)\}/g
  let m
  while ((m = entryRe.exec(text))) {
    const body = m[2]
    const fid = /"publishedfileid"\s+"(\d+)"/.exec(body)
    if (!fid) continue
    const dis = /"disabled_locally"\s+"(\d+)"/.exec(body)
    if (dis && dis[1] === '1') continue
    visible.add(fid[1])
  }
  return visible
}

/** 定位订阅清单文件：显式配置优先，其次从 workshop 路径反推 Steam 根目录扫描 userdata */
function findSubscriptionsFiles() {
  const explicit = [process.env.WE_SUBSCRIPTIONS_FILE, cfgFile.WE_SUBSCRIPTIONS_FILE].filter(Boolean)
  for (const f of explicit) {
    if (fs.existsSync(f)) return [f]
  }
  const files = []
  try {
    const steamRoot = path.normalize(path.join(WE_WORKSHOP_PATH, '..', '..', '..', '..'))
    const userdataDir = path.join(steamRoot, 'userdata')
    if (fs.existsSync(userdataDir)) {
      for (const entry of fs.readdirSync(userdataDir)) {
        const p = path.join(userdataDir, entry, 'ugc', '431960_subscriptions.vdf')
        if (fs.existsSync(p)) files.push(p)
      }
    }
  } catch {
    /* 定位失败则退化为不过滤 */
  }
  return files
}

function loadVisibleIds() {
  const files = findSubscriptionsFiles()
  if (!files.length) return null
  const visible = new Set()
  for (const f of files) {
    try {
      for (const id of parseVisibleIds(fs.readFileSync(f, 'utf8'))) visible.add(id)
    } catch {
      /* 单份清单读不了就跳过 */
    }
  }
  return visible.size ? visible : null
}

// ---------------------------------------------------------------------------
// 只读数据层
// ---------------------------------------------------------------------------

const LIST_TTL_MS = 60 * 1000
let listCache = { time: 0, items: null, hidden: 0 }

function readProjectJson(pjPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pjPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * 把 wallpaper-engine-api 的列表条目补全为插件可消费的形态：
 *  - filepath：project.json 里 file 字段指向的真实媒体文件（视频/图片/pkg）
 *  - type：project.json 的 type 字段（统一小写）；缺失时按扩展名兜底
 *    （.pkg→scene、.html→web、视频扩展名→video、图片扩展名→image）
 *  - rating：project.json 的 contentrating（everyone/questionable/mature，
 *    缺失为空字符串）——供前端 18+ / 非18+ 筛选使用
 *  - thumbnail：预览图绝对路径
 */
function enrich(w) {
  if (!w || typeof w.path !== 'string') return null
  const pj = readProjectJson(w.path)
  const dir = path.dirname(w.path)
  let filepath = ''
  let type = ''
  if (pj) {
    if (typeof pj.type === 'string' && pj.type) type = pj.type.trim().toLowerCase()
    if (typeof pj.file === 'string' && pj.file) {
      const candidate = path.join(dir, pj.file)
      if (fs.existsSync(candidate)) filepath = candidate
    }
  }
  if (!type && filepath) {
    const ext = path.extname(filepath).toLowerCase()
    if (ext === '.pkg') type = 'scene'
    else if (ext === '.html' || ext === '.htm') type = 'web'
    else if (/\.(mp4|webm|mkv|avi|mov|m4v)$/i.test(ext)) type = 'video'
    else if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(ext)) type = 'image'
  }
  let rating = ''
  if (pj && typeof pj.contentrating === 'string' && pj.contentrating) {
    rating = pj.contentrating.trim().toLowerCase()
  }
  return {
    id: String(w.id),
    title: typeof w.title === 'string' && w.title ? w.title : '未命名壁纸',
    type,
    filepath,
    thumbnail: typeof w.preview === 'string' ? w.preview : '',
    previewUrl: '',
    tags: Array.isArray(w.tags) ? w.tags : [],
    description: typeof w.description === 'string' ? w.description : '',
    rating,
  }
}

async function getWallpapers(refresh) {
  if (!refresh && listCache.items && Date.now() - listCache.time < LIST_TTL_MS) {
    return { items: listCache.items, hidden: listCache.hidden || 0 }
  }
  const raw = await we.listWallpapers()
  let items = raw.map(enrich).filter(Boolean)
  const visibleIds = loadVisibleIds()
  let hidden = 0
  if (visibleIds) {
    const before = items.length
    items = items.filter((it) => visibleIds.has(String(it.id)))
    hidden = before - items.length
  }
  listCache = { time: Date.now(), items, hidden }
  return { items, hidden }
}

/** tasklist 检测 WE 是否在运行（结果缓存 10 秒，仅供 /health 展示） */
let runCache = { time: 0, running: false }
function isWeRunning() {
  return new Promise((resolve) => {
    if (Date.now() - runCache.time < 10000) return resolve(runCache.running)
    execFile('tasklist', ['/NH'], { windowsHide: true }, (err, stdout) => {
      const running =
        !err && /wallpaper(32|64)\.exe|wallpaperservice32\.exe/i.test(String(stdout))
      runCache = { time: Date.now(), running }
      resolve(running)
    })
  })
}

/**
 * 读取当前桌面壁纸（纯只读）。
 *
 * 新版 Wallpaper Engine 把渲染分离到 wallpaperservice32.exe，
 * 命令行 `-control getWallpaper` 不再返回内容，因此这里直接解析
 * WE 安装目录下 config.json 的 general.wallpaperconfig.selectedwallpapers：
 * 该字段由各显示器当前壁纸的文件路径组成，取 Monitor0（缺失时取第一个）。
 */
async function getCurrent() {
  try {
    const cfgPath = path.join(WE_INSTALL_PATH, 'config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    const userCfg = cfg[os.userInfo().username]
    const wallCfg = userCfg && userCfg.general && userCfg.general.wallpaperconfig
    const selected = wallCfg && wallCfg.selectedwallpapers
    if (!selected || typeof selected !== 'object') return null

    let file = null
    if (selected.Monitor0 && typeof selected.Monitor0.file === 'string') {
      file = selected.Monitor0.file
    } else {
      const key = Object.keys(selected)[0]
      if (key && selected[key] && typeof selected[key].file === 'string') {
        file = selected[key].file
      }
    }
    if (!file) return null

    let norm = path.normalize(file)
    let dir = path.dirname(norm)
    const pjPath = path.join(dir, 'project.json')
    const pj = readProjectJson(pjPath)

    // config 直接指向 project.json 时（本地壁纸），解析其 file 字段
    if (path.basename(norm).toLowerCase() === 'project.json') {
      if (pj && typeof pj.file === 'string' && pj.file) {
        const candidate = path.join(dir, pj.file)
        if (fs.existsSync(candidate)) norm = candidate
      } else {
        return null
      }
    }

    let type = ''
    if (pj && typeof pj.type === 'string' && pj.type) type = pj.type.trim().toLowerCase()
    if (!type) {
      const ext = path.extname(norm).toLowerCase()
      if (ext === '.pkg') type = 'scene'
      else if (ext === '.html' || ext === '.htm') type = 'web'
      else if (/\.(mp4|webm|mkv|avi|mov|m4v)$/i.test(ext)) type = 'video'
      else if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(ext)) type = 'image'
    }

    let rating = ''
    if (pj && typeof pj.contentrating === 'string' && pj.contentrating) {
      rating = pj.contentrating.trim().toLowerCase()
    }

    return {
      id: path.basename(dir),
      title: pj && typeof pj.title === 'string' && pj.title ? pj.title : path.basename(dir),
      type,
      filepath: norm,
      thumbnail: pj && typeof pj.preview === 'string' && pj.preview ? path.join(dir, pj.preview) : '',
      previewUrl: '',
      tags: pj && Array.isArray(pj.tags) ? pj.tags : [],
      description: pj && typeof pj.description === 'string' ? pj.description : '',
      rating,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// HTTP 服务
// ---------------------------------------------------------------------------

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(obj))
}

const server = http.createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
  } catch {
    return sendJson(res, 400, { ok: false, error: '非法 URL' })
  }
  const p = url.pathname.replace(/\/+$/, '') || '/'
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: '只读服务，仅支持 GET' })
  }
  try {
    if (p === '/' || p === '/health' || p === '/api/health') {
      const subFiles = findSubscriptionsFiles()
      return sendJson(res, 200, {
        ok: true,
        service: 'we-api-proxy',
        mode: 'readonly',
        weInstallPath: WE_INSTALL_PATH,
        workshopPath: WE_WORKSHOP_PATH,
        subscriptionsFile: subFiles.length ? subFiles.join('; ') : null,
        weRunning: await isWeRunning(),
        time: new Date().toISOString(),
      })
    }
    if (
      p === '/api/wallpapers' || p === '/wallpapers' ||
      p === '/api/wallpapers/list' || p === '/api/list' || p === '/list'
    ) {
      const refresh = url.searchParams.get('refresh') === '1'
      const { items, hidden } = await getWallpapers(refresh)
      return sendJson(res, 200, {
        ok: true,
        wallpapers: items,
        count: items.length,
        hiddenUnsubscribed: hidden,
      })
    }
    if (
      p === '/api/current' || p === '/current' ||
      p === '/api/wallpapers/current' || p === '/wallpapers/current' || p === '/api/state'
    ) {
      return sendJson(res, 200, { ok: true, current: await getCurrent() })
    }
    return sendJson(res, 404, { ok: false, error: '未知端点: ' + p })
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
  }
})

server.listen(PORT, HOST, () => {
  console.log('[WE-API] 只读代理服务已启动: http://' + HOST + ':' + PORT)
  console.log('[WE-API] 端点: /health  /api/wallpapers  /api/current')
  console.log('[WE-API] 壁纸库: ' + WE_WORKSHOP_PATH)
  console.log('[WE-API] 本服务只读，不调用任何设置/播放壁纸的接口，桌面壁纸不受影响。')
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('[WE-API] 端口 ' + PORT + ' 已被占用。请关闭占用程序，或设置环境变量 WEAPI_PORT 换端口。')
  } else {
    console.error('[WE-API] 启动失败: ' + (err && err.message ? err.message : err))
  }
  process.exit(1)
})
