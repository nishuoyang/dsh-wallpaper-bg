/**
 * dsh-wallpaper-bg v0.5.15 — 宿主半（Node 侧）
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
// 同源发现路由：dsh-wallpaper-engine-api 插件把「实际端口 / 是否复用外部服务 / 错误」
// 放在宿主的 webServer 上，主插件据此自动接上，不需要用户手改基地址。
const DISCOVER_PATH = '/dsh-wallpaper-engine-api/status'
const DISCOVER_TTL = 30 * 1000
const DISCOVER_MISS_TTL = 15 * 1000
const DISCOVER_TIMEOUT = 1500

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
      // 同 key 的并发请求共用一个 Promise（in-flight 合并）：多标签页 / 面板打开 + 30 秒轮询 /
      // 切换跟随显示器都会同时打过来，旧实现每次都穿透到下游（实测慢下游下并发 10 → 下游被打 10 次）。
      const pending = new Map()
      // 失败负缓存：下游刚挂掉时不要每个请求都重走一遍端点探测（refresh=1 会绕过它，用户点「刷新」仍能立刻重试）
      const failCache = new Map()
      const FAIL_TTL = 5 * 1000
      // 端点记忆：WE API 各版本路径不同，首次要逐个试（5 个候选 × 8 秒超时，服务挂起时最坏 40 秒）。
      // 某个候选成功过就记住它，之后直接用它；该端点失效时清掉记忆，让下一次重新完整探测。
      // 注：不改 8 秒单端点超时 —— 本机服务虽快，但指向局域网/慢盘时留足余量，避免把「慢」误判成「挂」。
      const endpointMemo = new Map()   // base|endpoint -> 成功过的路径
      // WE API 插件发现缓存：成功 30 秒内复用，失败 15 秒内不再重试（避免无插件时
      // 每个 WE 请求都白等一次 1.5 秒超时）。
      let discoverMemo = { base: '', time: 0 }
      let discoverMissAt = 0
      let discoverInFlight = null

      /** 通过同源状态路由发现 dsh-wallpaper-engine-api 的实际 base；找不到返回 '' */
      async function discoverWeBase() {
        const now = Date.now()
        if (discoverMemo.base && now - discoverMemo.time < DISCOVER_TTL) return discoverMemo.base
        if (!discoverMemo.base && now - discoverMissAt < DISCOVER_MISS_TTL) return ''
        if (discoverInFlight) return discoverInFlight
        discoverInFlight = (async function () {
          try {
            if (typeof webServer.getOrigin !== 'function') return ''
            const origin = String(webServer.getOrigin()).replace(/\/+$/, '')
            const res = await fetch(origin + DISCOVER_PATH, {
              signal: AbortSignal.timeout(DISCOVER_TIMEOUT),
              cache: 'no-store',
            })
            if (!res.ok) {
              discoverMissAt = Date.now()
              return ''
            }
            const data = await res.json()
            if (!data || data.ok !== true || typeof data.base !== 'string') {
              discoverMissAt = Date.now()
              return ''
            }
            if (!/^https?:\/\/[^\s]+$/i.test(data.base)) {
              discoverMissAt = Date.now()
              return ''
            }
            discoverMemo = { base: data.base.replace(/\/+$/, ''), time: Date.now() }
            discoverMissAt = 0
            return discoverMemo.base
          } catch {
            discoverMissAt = Date.now()
            return ''
          } finally {
            discoverInFlight = null
          }
        })()
        return discoverInFlight
      }

      /** 出站只读 GET：逐个候选端点尝试（WE API 各版本路径不同）；refresh 透传以绕过下游缓存。
       *  成功过的端点会被记住并优先使用，避免每次请求都重走整串探测。 */
      async function fetchWe(base, endpoint, refresh, extra) {
        const cleanBase = String(base).replace(/\/+$/, '')
        const memoKey = cleanBase + '|' + endpoint
        const remembered = endpointMemo.get(memoKey)
        const all = ENDPOINTS[endpoint] || ['/']
        // 记忆命中：先试它，再试其余候选兜底
        const candidates = remembered ? [remembered].concat(all.filter((p) => p !== remembered)) : all
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
            const text = await res.text()
            let data = null
            try {
              data = parseJsonText(text)
            } catch (error) {
              // 非 JSON 的错误响应（例如反代 502 HTML）：保留状态码，不把 HTML 塞进错误
              if (!res.ok) throw new Error('HTTP ' + res.status)
              throw error
            }
            if (!res.ok) {
              // 新版服务会在 503 里给出可操作原因（找不到 WE / 找不到壁纸库），
              // 直接透出给面板，而不是只剩一句 "HTTP 503"。
              const detail = data && typeof data.error === 'string' ? data.error : ''
              throw new Error(detail || ('HTTP ' + res.status))
            }
            if (ep !== remembered) endpointMemo.set(memoKey, ep)   // 记住可用端点
            return data
          } catch (error) {
            lastError = error
            if (ep === remembered) endpointMemo.delete(memoKey)    // 记的端点失效了：下轮重新完整探测
          }
        }
        throw lastError || new Error('WE API 不可达')
      }

      async function weApi(query) {
        const requestedBase = typeof query.base === 'string' && query.base
          ? query.base.replace(/\/+$/, '')
          : ''
        // 发现只在「用户没改过基地址（客户端默认值 / 留空）」时启用：手动填了地址就
        // 尊重用户，不擅自换成插件端口。
        let base = requestedBase || defaultBase
        let discovered = false
        if (!requestedBase || requestedBase === DEFAULT_WE_BASE) {
          const found = await discoverWeBase()
          if (found) {
            base = found
            discovered = true
          }
        }
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
          return Object.assign({ ok: true, fromCache: true, weBase: base }, hit.payload)
        }
        if (!refresh) {
          // 刚失败过 → 快速失败，别再让每个请求各走一遍端点探测（点「刷新」走 refresh=1 可立即重试）
          const failedAt = failCache.get(key)
          if (failedAt && Date.now() - failedAt < FAIL_TTL) {
            throw new Error('WE API 暂不可达，' + Math.ceil((FAIL_TTL - (Date.now() - failedAt)) / 1000) + ' 秒后可重试')
          }
          // in-flight 合并：同一个 key 已经在请求中，就直接等它，不再发第二次下游调用
          const inflight = pending.get(key)
          if (inflight) {
            const shared = await inflight
            return Object.assign({ ok: true, fromCache: true, deduped: true, weBase: base }, shared)
          }
        }
        /** 真正打下游并归一化成 payload；同一个 key 的并发请求共享这一个 Promise */
        const task = (async function () {
          const raw = await fetchWe(base, endpoint, refresh, { monitor: wantMonitor })
          if (endpoint === 'ping') return { reachable: true }
          if (endpoint === 'current') {
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
              return Object.assign({ current: item }, monitorInfo)
            }
            if (Array.isArray(raw)) {
              return { current: normalizeItem(raw[0]), monitor: '', monitorSource: '', monitors: [] }
            }
            return { current: null, monitor: '', monitorSource: '', monitors: [] }
          }
          const list = pickList(raw)
          if (!list) throw new Error('无法识别的壁纸列表结构')
          return { wallpapers: list.map(normalizeItem).filter(Boolean) }
        })()
        if (!refresh) pending.set(key, task)
        try {
          const payload = await task
          cache.set(key, { time: Date.now(), payload })
          failCache.delete(key)
          return Object.assign({ ok: true, fromCache: false, weBase: base, discovered: discovered || undefined }, payload)
        } catch (error) {
          if (!refresh) failCache.set(key, Date.now())
          // 发现出来的端口刚失联：清掉成功缓存，下一次请求重新发现（插件可能刚重启 / 换端口）
          if (discovered) discoverMemo = { base: '', time: 0 }
          throw error
        } finally {
          if (!refresh && pending.get(key) === task) pending.delete(key)
        }
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
                version: '0.5.15',
                // /we?action=current 支持 monitor 参数（设置面板的「跟随显示器」）：
                // 1 = 本宿主半会把 monitor 透传给 WE API 服务；0/缺失 = 旧宿主半，只按服务自动判定
                monitorForward: 1,
                // 1 = 会先向同源 /dsh-wallpaper-engine-api/status 发现 dsh-wallpaper-engine-api
                // 插件的实际端口；用户手填基地址时不做替换
                discoverWeApi: 1,
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
              let st
              try {
                st = statSync(filePath)
              } catch {
                return sendJson(res, 404, { ok: false, error: '文件不存在: ' + filePath })
              }
              const size = st.size
              // ETag = mtime + size：只有 Cache-Control 时，5 分钟一过浏览器就得重新下载整段
              // （壁纸视频动辄几百 MB）；带上 ETag 后可走 If-None-Match → 304，
              // 循环播放 / 重新选中同一张时省掉整段重传。
              const etag = '"' + st.mtimeMs.toString(36) + '-' + size.toString(36) + '"'
              const inm = req.headers['if-none-match']
              if (typeof inm === 'string' && inm.split(',').some((t) => {
                const v = t.trim()
                return v === etag || v === 'W/' + etag
              })) {
                res.writeHead(304, {
                  ETag: etag,
                  'Cache-Control': 'public, max-age=300',
                  'Accept-Ranges': 'bytes',
                })
                res.end()
                return
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
                'ETag': etag,
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
