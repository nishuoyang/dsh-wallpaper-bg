/**
 * dsh-wallpaper-bg v0.1.0 — 宿主半（Node 侧）
 * ===========================================
 * 静态 DSH 双半插件的主入口。随预设行挂载，只消费宿主服务、不发布服务。
 *
 * 提供的路由（同源，解决浏览器跨域问题）：
 *   GET /dsh-wallpaper-bg/health               健康检查
 *   GET /dsh-wallpaper-bg/we?action=list|current|ping&base=...&refresh=1
 *                                              Wallpaper Engine 只读 API 代理（带缓存）
 *   GET /dsh-wallpaper-bg/asset?path=...&mime=...&（支持 Range）
 *                                              本地资源流式代理（壁纸图片/视频文件）
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
  if (/scene|application|web|html/.test(rawType)) return 'scene'
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
  return {
    id,
    title: String(item.title ?? item.name ?? item.projectname ?? '壁纸 ' + id).trim(),
    thumbnail: String(item.thumbnail ?? item.thumb ?? item.preview ?? item.thumbUrl ?? '').trim(),
    kind: inferKind(item, filepath),
    filepath,
    previewUrl,
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
  // 注意：只注入 cordis 内置的 'config'（读取行配置）。
  // 不能对宿主服务（webServer）硬注入——预设行在 standing scope 下永远等不到它，
  // 挂载会被判为 "row did not activate"；宿主组合先于预设挂载完毕，apply 时
  // ctx.get('webServer') 必然可用。
  inject: ['config'],
  apply(ctx) {
    const webServer = ctx.get('webServer')
    if (!webServer || typeof webServer.register !== 'function') return
    const config = ctx.config || {}
    const defaultBase =
      typeof config.weBase === 'string' && config.weBase ? config.weBase : DEFAULT_WE_BASE

    const cache = new Map()

    /** 出站只读 GET：逐个候选端点尝试（WE API 各版本路径不同） */
    async function fetchWe(base, endpoint) {
      const cleanBase = String(base).replace(/\/+$/, '')
      const candidates = ENDPOINTS[endpoint] || ['/']
      let lastError = null
      for (const ep of candidates) {
        try {
          const res = await fetch(cleanBase + ep, { signal: AbortSignal.timeout(8000) })
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
      const key = base + '|' + endpoint
      const ttl = endpoint === 'current' ? CACHE_TTL_CURRENT : CACHE_TTL_LIST
      const hit = cache.get(key)
      if (!refresh && hit && Date.now() - hit.time < ttl) {
        return Object.assign({ ok: true, fromCache: true }, hit.payload)
      }
      const raw = await fetchWe(base, endpoint)
      let payload
      if (endpoint === 'ping') {
        payload = { reachable: true }
      } else if (endpoint === 'current') {
        let item = null
        if (Array.isArray(raw)) {
          item = normalizeItem(raw[0])
        } else if (raw && typeof raw === 'object') {
          item = normalizeItem(
            raw.current ?? raw.currentWallpaper ?? raw.wallpaper ?? raw.data ?? raw.result ?? raw,
          )
        }
        payload = { current: item }
      } else {
        const list = pickList(raw)
        if (!list) throw new Error('无法识别的壁纸列表结构')
        payload = { wallpapers: list.map(normalizeItem).filter(Boolean) }
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
            return sendJson(res, 200, { ok: true, plugin: 'dsh-wallpaper-bg', version: '0.1.0' })
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
  },
}
