/**
 * dsh-wallpaper-bg v0.5.12 — 宿主半（Node 侧）
 * ===========================================
 * 静态 DSH 双半插件的主入口。随预设行挂载，只消费宿主服务、不发布服务。
 *
 * 提供的路由（同源，解决浏览器跨域问题）：
 *   GET /dsh-wallpaper-bg/health               健康检查
 *   GET /dsh-wallpaper-bg/we?action=list|current|ping&base=...&refresh=1&monitor=...
 *                                              Wallpaper Engine 只读 API 代理（带缓存）；
 *                                              monitor 仅在 action=current 时透传（跟随哪台显示器，
 *                                              MonitorN / 数字，空 = 由服务自动判定），且计入缓存键
 *   GET /dsh-wallpaper-bg/asset?path=...&mime=...&（支持 Range）
 *                                              本地资源流式代理（壁纸图片/视频文件）
 *
 * 桌面壁纸同步：客户端只读跟随 WE 当前桌面壁纸（走 /we?action=current），再按类型正常
 * 渲染——场景 / 视频 / 图片 / 网页各走各的图层，不采样桌面画面、不本地渲染、不产缓存文件。
 * 跟随哪台显示器由 WE API 服务判定（多显示器时不能盲取 Monitor0，见服务端 resolveCurrent），
 * 插件设置面板也可以显式指定（monitor 参数）。
 *
 * 只读原则：仅请求 WE 本机 API 的 list / current，绝不调用任何设置、播放接口。
 */
import { createReadStream, statSync } from 'node:fs'

const DEFAULT_WE_BASE = 'http://127.0.0.1:8088'
const CACHE_TTL_LIST = 5 * 60 * 1000
const CACHE_TTL_CURRENT = 10 * 1000

const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
  svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4', ogg: 'video/ogg',
}

function guessMime(p) {
  const clean = String(p).split(/[?#]/)[0].toLowerCase()
  const ext = clean.includes('.') ? (clean.split('.').pop() || '') : ''
  return MIME_MAP[ext] || 'application/octet-stream'
}

function inferKind(item, filepath) {
  const rawType = String(item.type ?? item.filetype ?? item.kind ?? item.wallpaperType ?? '').toLowerCase()
  if (/web|html/.test(rawType)) return 'web'
  if (/scene|application/.test(rawType)) return 'scene'
  if (/video|movie/.test(rawType)) return 'video'
  if (/image|picture|photo/.test(rawType)) return 'image'
  const lower = filepath.toLowerCase()
  if (/(\.mp4|\.webm|\.mkv|\.avi|\.mov|\.m4v)([?#]|$)/.test(lower)) return 'video'
  if (/(\.jpe?g|\.png|\.webp|\.gif|\.bmp|\.avif)([?#]|$)/.test(lower)) return 'image'
  if (lower.includes('scene')) return 'scene'
  return 'unknown'
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = String(item.id ?? item.publishedfileid ?? item.workshopId ?? item.wid ?? '').trim()
  if (!id) return null
  const filepath = String(item.filepath ?? item.path ?? item.file ?? item.filePath ?? item.resourcePath ?? '').trim()
  const previewUrl = String(item.previewUrl ?? item.preview_url ?? item.sceneUrl ?? '').trim()
  // 分级字段透传：WE project.json 的 contentrating（everyone/questionable/mature），
  // 供前端 18+ / 非18+ 筛选；API 未提供时为 ''
  const rating = String(item.rating ?? item.contentrating ?? item.contentRating ?? '').trim().toLowerCase()
  return {
    id,
    title: String(item.title ?? item.name ?? item.projectname ?? '壁纸 ' + id).trim(),
    thumbnail: String(item.thumbnail ?? item.thumb ?? item.preview ?? item.thumbUrl ?? '').trim(),
    kind: inferKind(item, filepath),
    rating,
    filepath,
    entry: String(item.entry ?? item.entryFile ?? '').trim(),
    previewUrl,
    // 工坊预览图绝对路径（preview.gif / preview.jpg），客户端经 /asset 代理展示
    previewFile: String(item.previewFile ?? '').trim(),
    // 工坊预览图像素尺寸（服务端解析 GIF/PNG/JPEG 头得到）：前端据此如实说明
    // 「预览图本身只有 192×192」，避免用户把发虚的预览当成「缓存里的旧图 / 没生效」
    previewSize: (function () {
      const ps = item.previewSize
      if (!ps || typeof ps !== 'object') return null
      const w = Number(ps.w)
      const h = Number(ps.h)
      return w > 0 && h > 0 ? { w: w, h: h } : null
    })(),
  }
}

function pickList(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    for (const k of ['wallpapers', 'items', 'list', 'data', 'result', 'results']) {
      const v = raw[k]
      if (Array.isArray(v)) return v
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k2 of ['wallpapers', 'items', 'list', 'data']) {
          if (Array.isArray(v[k2])) return v[k2]
        }
      }
    }
  }
  return null
}

function parseJsonText(t) {
  const text = String(t).replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('WE API 返回空响应')
  try {
    return JSON.parse(text)
  } catch {
    const a = text.indexOf('{')
    const b = text.indexOf('[')
    const start = a === -1 ? b : (b === -1 ? a : Math.min(a, b))
    if (start === -1) throw new Error('WE API 返回非 JSON 内容: ' + text.slice(0, 200))
    return JSON.parse(text.slice(start))
  }
}

const ENDPOINTS = {
  wallpapers: ['/api/wallpapers', '/wallpapers', '/api/wallpapers/list', '/api/list', '/list'],
  current: ['/api/current', '/current', '/api/wallpapers/current', '/wallpapers/current', '/api/state'],
  ping: ['/', '/health', '/api/health'],
}

export default {
  name: 'dsh-wallpaper-bg',
  // 宿主服务按需注入——不要改回 inject: ['webServer'] 硬门控：
  //  - 硬注入在没有 Web 服务的 profile（headless / tui / 自建 profile）里会让
  //    这条插件行永远 pending，DSH 启动直接以 "1 entry did not activate /
  //    waiting for service: webServer" 失败——用户装完插件整个 profile 都起不来；
  //  - ctx.inject(deps, cb) 走同一套服务解析，但只作用于回调自己的子 fiber：
  //    webServer 缺失时插件照常激活、什么都不注册；出现时自动注册路由，
  //    服务消失时自动注销（webServer 在 standing mount 下 ctx.get 取不到，
  //    所以必须走 inject 拦截而不是 ctx.get）。
  //  - 行配置走 apply 的第二个参数（ctx.config 需要 'config' 注入，而该注入
  //    在 standing mount 下不会兑现，挂载会报 "waiting for config"）。
  apply(ctx, config) {
    ctx.inject(['webServer'], (ctx) => {
      const webServer = ctx.webServer
      if (!webServer || typeof webServer.register !== 'function') return
      const rowConfig = config && typeof config === 'object' ? config : {}
      const defaultBase =
        typeof rowConfig.weBase === 'string' && rowConfig.weBase ? rowConfig.weBase : DEFAULT_WE_BASE

      const cache = new Map()

      /** 出站只读 GET：逐个候选端点尝试（WE API 各版本路径不同）；refresh 透传以绕过下游缓存 */
      async function fetchWe(base, endpoint, refresh, extra) {
        const cleanBase = String(base).replace(/\/+$/, '')
        const candidates = ENDPOINTS[endpoint] || ['/']
        const query = []
        if (refresh) query.push('refresh=1')
        // 显示器选择（/api/current 专用）：旧版服务会忽略未知参数，行为退化为自动判定
        if (extra && extra.monitor) query.push('monitor=' + encodeURIComponent(extra.monitor))
        const suffix = query.length ? '?' + query.join('&') : ''
        let lastError = null
        for (const ep of candidates) {
          try {
            const url = cleanBase + ep + suffix
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
            if (!res.ok) throw new Error('HTTP ' + res.status)
            return parseJsonText(await res.text())
          } catch (error) {
            lastError = error
          }
        }
        throw lastError || new Error('WE API 不可达')
      }

      async function weApi(query) {
        const base = typeof query.base === 'string' && query.base ? query.base : defaultBase
        const action = typeof query.action === 'string' ? query.action : 'list'
        const endpoint = action === 'current' ? 'current' : action === 'ping' ? 'ping' : 'wallpapers'
        const refresh = query.refresh === '1'
        // monitor：插件设置面板的「跟随显示器」（MonitorN / 数字；空 / auto = 让服务自动判定）
        const monitor = typeof query.monitor === 'string' ? query.monitor.trim() : ''
        const wantMonitor = endpoint === 'current' && monitor && !/^auto$/i.test(monitor) ? monitor : ''
        // 缓存键必须带上显示器与刷新维度：否则切显示器会命中上一台的缓存
        const key = base + '|' + endpoint + '|' + wantMonitor
        const ttl = endpoint === 'current' ? CACHE_TTL_CURRENT : CACHE_TTL_LIST
        const hit = cache.get(key)
        if (!refresh && hit && Date.now() - hit.time < ttl) {
          return Object.assign({ ok: true, fromCache: true }, hit.payload)
        }
        const raw = await fetchWe(base, endpoint, refresh, { monitor: wantMonitor })
        let payload
        if (endpoint === 'ping') {
          payload = { reachable: true }
        } else if (endpoint === 'current') {
          // 0.5.1 服务会额外给出 monitor / monitorSource / monitors[]；旧服务只有 current。
          // 两种形态都原样透传给前端（前端按 monitors 是否存在决定是否显示显示器下拉）。
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const monitorInfo = {
              monitor: typeof raw.monitor === 'string' ? raw.monitor : '',
              monitorSource: typeof raw.monitorSource === 'string' ? raw.monitorSource : '',
              monitors: Array.isArray(raw.monitors) ? raw.monitors : [],
            }
            let item = null
            if (raw.current !== undefined) {
              item = normalizeItem(raw.current)
            } else {
              item = normalizeItem(
                raw.currentWallpaper ?? raw.wallpaper ?? raw.data ?? raw.result ?? raw,
              )
            }
            payload = Object.assign({ current: item }, monitorInfo)
          } else if (Array.isArray(raw)) {
            payload = { current: normalizeItem(raw[0]), monitor: '', monitorSource: '', monitors: [] }
          } else {
            payload = { current: null, monitor: '', monitorSource: '', monitors: [] }
          }
        } else {
          const list = pickList(raw)
          if (!list) throw new Error('无法识别的壁纸列表结构')
          payload = {
            wallpapers: list.map(normalizeItem).filter(Boolean),
          }
        }
        cache.set(key, { time: Date.now(), payload })
        return Object.assign({ ok: true, fromCache: false }, payload)
      }

      function sendJson(res, code, obj) {
        try {
          res.writeHead(code, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          })
          res.end(JSON.stringify(obj))
        } catch {
          /* 连接已断开 */
        }
      }

      ctx.effect(() => webServer.register({
        kind: 'prefix',
        path: '/dsh-wallpaper-bg',
        handler: async (req, res) => {
          try {
            const url = new URL(req.url, 'http://localhost')
            const p = url.pathname

            if (p === '/dsh-wallpaper-bg/health') {
              return sendJson(res, 200, {
                ok: true,
                plugin: 'dsh-wallpaper-bg',
                version: '0.5.12',
                // /we?action=current 支持 monitor 参数（设置面板的「跟随显示器」）：
                // 1 = 本宿主半会把 monitor 透传给 WE API 服务；0/缺失 = 旧宿主半，只按服务自动判定
                monitorForward: 1,
              })
            }

            if (p === '/dsh-wallpaper-bg/we') {
              const query = Object.fromEntries(url.searchParams)
              try {
                return sendJson(res, 200, await weApi(query))
              } catch (error) {
                return sendJson(res, 502, { ok: false, error: String((error && error.message) || error) })
              }
            }

            if (p === '/dsh-wallpaper-bg/asset') {
              const filePath = url.searchParams.get('path')
              if (!filePath) return sendJson(res, 400, { ok: false, error: '缺少 path 参数' })
              const mime = url.searchParams.get('mime') || guessMime(filePath)
              let size
              try {
                size = statSync(filePath).size
              } catch {
                return sendJson(res, 404, { ok: false, error: '文件不存在: ' + filePath })
              }

              let start = 0
              let end = size - 1
              let code = 200
              const range = req.headers.range
              if (typeof range === 'string') {
                const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
                if (m) {
                  let s = m[1] ? parseInt(m[1], 10) : 0
                  let e = m[2] ? parseInt(m[2], 10) : size - 1
                  if (Number.isNaN(s)) s = 0
                  if (Number.isNaN(e)) e = size - 1
                  if (s > e || s >= size) {
                    res.writeHead(416, { 'Content-Range': 'bytes */' + size })
                    res.end()
                    return
                  }
                  start = s
                  end = Math.min(e, size - 1)
                  code = 206
                }
              }

              const headers = {
                'Content-Type': mime,
                'Content-Length': String(end - start + 1),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=300',
              }
              if (code === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size
              res.writeHead(code, headers)
              if (req.method === 'HEAD') {
                res.end()
                return
              }
              // 大文件（GB 级视频）走流式传输，不整读进内存
              const stream = createReadStream(filePath, { start, end })
              stream.on('error', () => {
                try { res.destroy() } catch { /* 已断开 */ }
              })
              stream.pipe(res)
              return
            }

            return sendJson(res, 404, { ok: false, error: '未知路由: ' + p })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
          }
        },
      }))
    })
  },
}
