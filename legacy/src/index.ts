/**
 * dsh-wallpaper-bg — 插件主入口（Host 侧，运行在 Harness 进程）
 *
 * 职责：
 *  1. WE 本地 API 代理转发：以只读 GET 访问 http://127.0.0.1:8088，
 *     列表缓存 5 分钟；出站 HTTP 走 ctx.subprocess + curl.exe（DSH 动态
 *     插件沙箱没有 fetch / node:http），全部调用只读、不修改 WE 状态；
 *  2. 本地资源代理：注册 /dsh-wallpaper-bg 前缀路由，把 WE 壁纸的本地
 *     文件路径（图片 / 视频 / 缩略图）以同源 HTTP 提供给浏览器，跨域问题
 *     由 Harness 进程代理解决（浏览器不直连 WE）；
 *  3. 通过 harness.handle('we:api', ...) 向 Client 暴露 JSON RPC。
 *
 * 注意：本文件是运行时插件代码的源码镜像。DSH 动态插件以纯 JavaScript
 * 函数体部署（无 import / TS 类型），本文件仅供阅读、类型检查与版本管理。
 */

// ---------------------------------------------------------------------------
// 纯逻辑（与 src/we-bridge.ts 一致的运行时内联版本）
// ---------------------------------------------------------------------------

const CACHE_TTL_LIST = 5 * 60 * 1000
const CACHE_TTL_CURRENT = 10 * 1000

function jsonText(out: string): unknown {
  const t = String(out).replace(/^\uFEFF/, '').trim()
  if (!t) throw new Error('WE API 返回空响应')
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.indexOf('[')
    const start = a === -1 ? b : b === -1 ? a : Math.min(a, b)
    if (start === -1) throw new Error('WE API 返回非 JSON 内容: ' + t.slice(0, 200))
    return JSON.parse(t.slice(start))
  }
}

function pickList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    for (const k of ['wallpapers', 'items', 'list', 'data', 'result', 'results']) {
      const v = r[k]
      if (Array.isArray(v)) return v
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>
        for (const k2 of ['wallpapers', 'items', 'list', 'data']) {
          if (Array.isArray(inner[k2])) return inner[k2]
        }
      }
    }
  }
  return null
}

function guessMime(pathOrUrl: string): string {
  const clean = String(pathOrUrl).split(/[?#]/)[0].toLowerCase()
  const ext = clean.includes('.') ? (clean.split('.').pop() ?? '') : ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
    svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4', ogg: 'video/ogg',
  }
  return map[ext] ?? 'application/octet-stream'
}

function inferKind(item: Record<string, unknown>, filepath: string): string {
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

interface WeItem {
  id: string
  title: string
  thumbnail: string
  kind: string
  filepath: string
  previewUrl: string
}

function normalizeItem(item: unknown): WeItem | null {
  if (!item || typeof item !== 'object') return null
  const it = item as Record<string, unknown>
  const id = String(it.id ?? it.publishedfileid ?? it.workshopId ?? it.wid ?? '').trim()
  if (!id) return null
  const filepath = String(it.filepath ?? it.path ?? it.file ?? it.filePath ?? it.resourcePath ?? '').trim()
  const previewUrl = String(it.previewUrl ?? it.preview_url ?? it.sceneUrl ?? '').trim()
  return {
    id,
    title: String(it.title ?? it.name ?? it.projectname ?? '壁纸 ' + id).trim(),
    thumbnail: String(it.thumbnail ?? it.thumb ?? it.preview ?? it.thumbUrl ?? '').trim(),
    kind: inferKind(it, filepath),
    filepath,
    previewUrl,
  }
}

const ENDPOINTS: Record<string, string[]> = {
  wallpapers: ['/api/wallpapers', '/wallpapers', '/api/wallpapers/list', '/api/list', '/list'],
  current: ['/api/current', '/current', '/api/wallpapers/current', '/wallpapers/current', '/api/state'],
  ping: ['/', '/health', '/api/health'],
}

// ---------------------------------------------------------------------------
// 插件定义（Host 半边）
// ---------------------------------------------------------------------------

/**
 * 插件的 Host 半边 apply（运行时以 `return { name, apply(ctx) { ... } }`
 * 形式部署为纯 JavaScript 闭包，此处为源码镜像）。
 * 所有副作用都挂在该 fiber 上：apply 返回的清理函数会注销 RPC 与路由。
 */
export function apply(ctx: DshHostContext): () => void {
  const webServer = ctx.get('webServer')
  const fs = ctx.get('fs')
  const subprocess = ctx.get('subprocess')
  if (!webServer || !fs || !subprocess) return () => {}

  const sandboxPolicy = ctx.get('sandboxPolicy')
  const cwd =
    sandboxPolicy && typeof (sandboxPolicy as { workspaceRoot?: unknown }).workspaceRoot === 'string'
      ? (sandboxPolicy as { workspaceRoot: string }).workspaceRoot
      : 'C:\\'

  const cache = new Map<string, { time: number; payload: unknown }>()

  /** 出站 HTTP（文本）：curl.exe 优先，powershell 回退；全部为只读 GET */
  async function httpGetText(url: string): Promise<string> {
    let argv: string[]
    try {
      await subprocess.resolveExecutable('curl.exe')
      argv = ['curl.exe', '-sS', '--max-time', '8', '--connect-timeout', '3', url]
    } catch {
      await subprocess.resolveExecutable('powershell.exe') // 抛错即无可用工具
      const safeUrl = url.replace(/'/g, "''")
      argv = [
        'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
        "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri '" + safeUrl + "').Content } catch { exit 1 }",
      ]
    }
    const handle = subprocess.spawn({
      argv,
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 8 * 1024 * 1024 },
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: 3000,
    })
    const outcome = await handle.done
    const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
    const err = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
    if (outcome.exitCode !== 0) {
      throw new Error('WE 请求失败 (exit ' + outcome.exitCode + ')' + (err ? ': ' + err.slice(0, 300) : ''))
    }
    return out
  }

  async function weGet(base: string, endpoint: string): Promise<unknown> {
    const cleanBase = String(base).replace(/\/+$/, '')
    const candidates = ENDPOINTS[endpoint] ?? ['/']
    let lastError: Error | null = null
    for (const ep of candidates) {
      try {
        return jsonText(await httpGetText(cleanBase + ep))
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    throw lastError ?? new Error('WE API 不可达')
  }

  /** RPC: we:api { endpoint: wallpapers|current|ping, base?, refresh? } */
  async function weApi(args: Record<string, unknown> | null | undefined): Promise<Record<string, unknown>> {
    const a = args && typeof args === 'object' ? args : {}
    const base = typeof a.base === 'string' && a.base ? a.base : 'http://127.0.0.1:8088'
    const endpoint = typeof a.endpoint === 'string' ? a.endpoint : 'wallpapers'
    const refresh = a.refresh === true
    const key = base + '|' + endpoint
    const ttl = endpoint === 'current' ? CACHE_TTL_CURRENT : CACHE_TTL_LIST
    const hit = cache.get(key)
    if (!refresh && hit && Date.now() - hit.time < ttl) {
      return { ok: true, ...(hit.payload as Record<string, unknown>), fromCache: true }
    }
    const raw = await weGet(base, endpoint)
    let payload: Record<string, unknown>
    if (endpoint === 'ping') {
      payload = { reachable: true }
    } else if (endpoint === 'current') {
      let item: WeItem | null = null
      if (Array.isArray(raw)) item = normalizeItem(raw[0])
      else if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>
        item = normalizeItem(r.current ?? r.currentWallpaper ?? r.wallpaper ?? r.data ?? r.result ?? r)
      }
      payload = { current: item }
    } else {
      const list = pickList(raw)
      if (!list) throw new Error('无法识别的壁纸列表结构')
      payload = { wallpapers: list.map(normalizeItem).filter(Boolean) }
    }
    cache.set(key, { time: Date.now(), payload })
    return { ok: true, ...payload, fromCache: false }
  }

  const disposeRpc = harness.handle('we:api', async (args) => {
    try {
      return await weApi(args)
    } catch (error) {
      return { ok: false, error: String((error as Error)?.message ?? error) }
    }
  })

  // -------------------------------------------------------------------------
  // 本地资源代理路由：/dsh-wallpaper-bg/asset?path=<本地文件路径>&mime=...
  // 支持 Range 单区间请求，视频可拖动进度；fs 读操作在所有沙箱模式下放行。
  // -------------------------------------------------------------------------

  const disposeRoute = webServer.register({
    kind: 'prefix',
    path: '/dsh-wallpaper-bg',
    handler: async (req, res) => {
      try {
        const q = req.url.indexOf('?')
        const pathname = q === -1 ? req.url : req.url.slice(0, q)
        const query: Record<string, string> = {}
        if (q !== -1) {
          for (const part of req.url.slice(q + 1).split('&')) {
            const i = part.indexOf('=')
            if (i === -1) continue
            query[decodeURIComponent(part.slice(0, i))] = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '))
          }
        }

        if (pathname === '/dsh-wallpaper-bg/health') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: true, plugin: 'dsh-wallpaper-bg' }))
          return
        }

        if (pathname === '/dsh-wallpaper-bg/asset') {
          const p = query.path
          if (!p) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, error: '缺少 path 参数' }))
            return
          }
          const mime = query.mime || guessMime(p)
          const cap = /^video\//.test(mime) ? 512 * 1024 * 1024 : 64 * 1024 * 1024

          let target: unknown
          try {
            target = await fs.resolve(p)
          } catch {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, error: '文件不存在: ' + p }))
            return
          }
          const bytes = (await fs.readBytes(target, undefined, cap)) as Uint8Array

          // 简单的单区间 Range 支持
          const rangeHeader = req.headers.range
          if (typeof rangeHeader === 'string' && /^bytes=/.test(rangeHeader)) {
            const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
            if (m) {
              let start = m[1] ? parseInt(m[1], 10) : 0
              let end = m[2] ? parseInt(m[2], 10) : bytes.byteLength - 1
              if (Number.isNaN(start)) start = 0
              if (Number.isNaN(end)) end = bytes.byteLength - 1
              if (start > end || start >= bytes.byteLength) {
                res.writeHead(416, { 'Content-Range': 'bytes */' + bytes.byteLength })
                res.end()
                return
              }
              end = Math.min(end, bytes.byteLength - 1)
              const slice = bytes.subarray(start, end + 1)
              res.writeHead(206, {
                'Content-Type': mime,
                'Content-Length': String(slice.byteLength),
                'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.byteLength,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=300',
              })
              res.end(slice)
              return
            }
          }

          res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': String(bytes.byteLength),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=300',
          })
          res.end(bytes)
          return
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: '未知路由: ' + pathname }))
      } catch (error) {
        try {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: false, error: String((error as Error)?.message ?? error) }))
        } catch {
          /* 响应头已发出，无法补救 */
        }
      }
    },
  })

  return () => {
    try {
      disposeRpc()
    } catch {
      /* 忽略 */
    }
    try {
      disposeRoute()
    } catch {
      /* 忽略 */
    }
  }
}

// ---------------------------------------------------------------------------
// 宽松的上下文类型（运行时以实际 Service 契约为准）
// ---------------------------------------------------------------------------

export interface DshHostContext {
  get(name: 'webServer'): WebServerLike | undefined
  get(name: 'fs'): FsLike | undefined
  get(name: 'subprocess'): SubprocessLike | undefined
  get(name: 'sandboxPolicy'): { workspaceRoot?: string } | undefined
  get(name: string): unknown
}

export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: NodeHttpRequest, res: NodeHttpResponse) => void | Promise<void>
  }): () => void
}

export interface FsLike {
  resolve(path: string): Promise<unknown>
  readBytes(target: unknown, signal: unknown, maxBytes: number): Promise<Uint8Array>
}

export interface SubprocessLike {
  resolveExecutable(command: string): Promise<string>
  spawn(spec: {
    argv: readonly string[]
    cwd: string
    stdio: {
      stdin: 'ignore' | 'pipe' | { data: string }
      stdout: 'pipe' | 'inherit' | { maxBytes: number }
      stderr: 'pipe' | 'inherit' | { maxBytes: number }
    }
    graceMs: number
  }): {
    done: Promise<{ exitCode: number | null }>
    collected: {
      stdout?: { readFrom(offset: number): { text: string } }
      stderr?: { readFrom(offset: number): { text: string } }
    }
  }
}

export interface NodeHttpRequest {
  url: string
  headers: Record<string, string | string[] | undefined>
}

export interface NodeHttpResponse {
  writeHead(code: number, headers: Record<string, string>): void
  end(body?: string | Uint8Array): void
}
