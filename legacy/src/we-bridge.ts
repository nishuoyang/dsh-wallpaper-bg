/**
 * dsh-wallpaper-bg — Wallpaper Engine 本地 API 桥接层（Host 侧）
 *
 * 职责：
 *  1. 以「只读 GET」方式访问 WE 本地 HTTP API（默认 http://127.0.0.1:8088），
 *     读取已安装壁纸列表与当前桌面壁纸信息；
 *  2. 归一化各社区 WE API 的多种响应形状（数组根 / {wallpapers} / {data} …）；
 *  3. 列表结果缓存 5 分钟（当前壁纸 10 秒），避免每次打开设置面板都请求；
 *  4. 绝不调用 WE 的"设置壁纸 / 播放壁纸"类接口，桌面壁纸保持不变。
 *
 * 关于 WE 本地 API：Wallpaper Engine 官方默认并不开放 HTTP 端口，本桥接层
 * 面向规范约定的 127.0.0.1:8088 只读接口，并自动适配多种常见端点路径与
 * 响应结构（见 WE_ENDPOINT_CANDIDATES）。若你使用的 WE API 服务路径不同，
 * 可在设置面板中修改基地址，或按下方结构自建兼容端点。
 *
 * 传输层：DSH 动态插件沙箱没有 fetch / node:http，出站 HTTP 通过
 * ctx.subprocess + curl.exe（或 powershell 回退）完成，由调用方注入
 * `transport(url: string): Promise<string>`。
 */

export interface WeTransport {
  (url: string): Promise<string>
}

export interface WeBridgeOptions {
  /** WE API 基地址 */
  base: string
  /** 出站 HTTP 文本传输（注入） */
  transport: WeTransport
  /** 列表缓存 TTL（毫秒） */
  listTtlMs?: number
  /** 当前壁纸缓存 TTL（毫秒） */
  currentTtlMs?: number
}

/** 各端点的候选路径（按顺序尝试，首个成功即返回） */
const WE_ENDPOINT_CANDIDATES = {
  wallpapers: [
    '/api/wallpapers',
    '/wallpapers',
    '/api/wallpapers/list',
    '/api/list',
    '/list',
  ],
  current: [
    '/api/current',
    '/current',
    '/api/wallpapers/current',
    '/wallpapers/current',
    '/api/state',
  ],
  ping: ['/', '/health', '/api/health'],
} as const

export type WeEndpoint = keyof typeof WE_ENDPOINT_CANDIDATES

const DEFAULT_LIST_TTL = 5 * 60 * 1000
const DEFAULT_CURRENT_TTL = 10 * 1000

/** 从一段 HTTP 文本中提取 JSON（容忍 BOM / 前缀噪声） */
export function parseJsonText(out: string): unknown {
  const text = String(out).replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('WE API 返回空响应')
  try {
    return JSON.parse(text)
  } catch {
    const a = text.indexOf('{')
    const b = text.indexOf('[')
    const start = a === -1 ? b : b === -1 ? a : Math.min(a, b)
    if (start === -1) throw new Error(`WE API 返回非 JSON 内容: ${text.slice(0, 200)}`)
    return JSON.parse(text.slice(start))
  }
}

/** 从任意响应形状中挑出壁纸数组 */
export function pickWallpaperList(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    for (const key of ['wallpapers', 'items', 'list', 'data', 'result', 'results']) {
      const v = r[key]
      if (Array.isArray(v)) return v
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>
        for (const k of ['wallpapers', 'items', 'list', 'data']) {
          if (Array.isArray(inner[k])) return inner[k]
        }
      }
    }
  }
  return null
}

/** 根据扩展名推断 MIME（用于代理路由与类型推断） */
export function guessMime(pathOrUrl: string): string {
  const clean = String(pathOrUrl).split(/[?#]/)[0].toLowerCase()
  const ext = clean.includes('.') ? clean.split('.').pop() ?? '' : ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    avif: 'image/avif',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    ogg: 'video/ogg',
  }
  return map[ext] ?? 'application/octet-stream'
}

/** 从文件路径推断壁纸类型 */
export function inferKind(item: Record<string, unknown>, filepath: string): 'image' | 'video' | 'scene' | 'unknown' {
  const rawType = String(
    item.type ?? item.filetype ?? item.kind ?? item.wallpaperType ?? '',
  ).toLowerCase()
  if (/scene|application|web|html/.test(rawType)) return 'scene'
  if (/video|movie/.test(rawType)) return 'video'
  if (/image|picture|photo/.test(rawType)) return 'image'
  const lower = filepath.toLowerCase()
  if (/(\.mp4|\.webm|\.mkv|\.avi|\.mov|\.m4v)([?#]|$)/.test(lower)) return 'video'
  if (/(\.jpe?g|\.png|\.webp|\.gif|\.bmp|\.avif)([?#]|$)/.test(lower)) return 'image'
  if (lower.includes('scene')) return 'scene'
  return 'unknown'
}

/** 归一化一条 WE 壁纸条目 */
export function normalizeItem(item: unknown): WeRawNormalized | null {
  if (!item || typeof item !== 'object') return null
  const it = item as Record<string, unknown>
  const id = String(it.id ?? it.publishedfileid ?? it.workshopId ?? it.wid ?? '').trim()
  if (!id) return null
  const filepath = String(it.filepath ?? it.path ?? it.file ?? it.filePath ?? it.resourcePath ?? '').trim()
  const previewUrl = String(it.previewUrl ?? it.preview_url ?? it.sceneUrl ?? '').trim()
  return {
    id,
    title: String(it.title ?? it.name ?? it.projectname ?? `壁纸 ${id}`).trim(),
    thumbnail: String(it.thumbnail ?? it.thumb ?? it.preview ?? it.thumbUrl ?? '').trim(),
    kind: inferKind(it, filepath),
    filepath,
    previewUrl,
  }
}

export interface WeRawNormalized {
  id: string
  title: string
  thumbnail: string
  kind: 'image' | 'video' | 'scene' | 'unknown'
  filepath: string
  previewUrl: string
}

/** WE 壁纸库桥接器（只读） */
export function createWeBridge(options: WeBridgeOptions) {
  const listTtl = options.listTtlMs ?? DEFAULT_LIST_TTL
  const currentTtl = options.currentTtlMs ?? DEFAULT_CURRENT_TTL
  const cache = new Map<string, { time: number; payload: unknown }>()

  async function getOne(base: string, endpoint: WeEndpoint): Promise<unknown> {
    const cleanBase = base.replace(/\/+$/, '')
    let lastError: Error | null = null
    for (const ep of WE_ENDPOINT_CANDIDATES[endpoint]) {
      try {
        return parseJsonText(await options.transport(cleanBase + ep))
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }
    throw lastError ?? new Error('WE API 不可达')
  }

  /** 读取壁纸库（带 5 分钟缓存；refresh 强制刷新） */
  async function wallpapers(opts?: { refresh?: boolean; base?: string }): Promise<WeApiOutcome> {
    const base = opts?.base ?? options.base
    const key = `list|${base}`
    const hit = cache.get(key)
    if (!opts?.refresh && hit && Date.now() - hit.time < listTtl) {
      return { ok: true, wallpapers: hit.payload as WeRawNormalized[], fromCache: true }
    }
    const raw = await getOne(base, 'wallpapers')
    const list = pickWallpaperList(raw)
    if (!list) throw new Error('无法识别的壁纸列表结构')
    const wallpapers = list.map(normalizeItem).filter(Boolean) as WeRawNormalized[]
    cache.set(key, { time: Date.now(), payload: wallpapers })
    return { ok: true, wallpapers, fromCache: false }
  }

  /** 读取当前桌面壁纸（带 10 秒缓存） */
  async function current(opts?: { refresh?: boolean; base?: string }): Promise<WeApiOutcome> {
    const base = opts?.base ?? options.base
    const key = `current|${base}`
    const hit = cache.get(key)
    if (!opts?.refresh && hit && Date.now() - hit.time < currentTtl) {
      return { ok: true, current: hit.payload as WeRawNormalized | null, fromCache: true }
    }
    const raw = await getOne(base, 'current')
    let item: WeRawNormalized | null = null
    if (Array.isArray(raw)) item = normalizeItem(raw[0])
    else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>
      const candidate = r.current ?? r.currentWallpaper ?? r.wallpaper ?? r.data ?? r.result ?? r
      item = normalizeItem(candidate)
    }
    cache.set(key, { time: Date.now(), payload: item })
    return { ok: true, current: item, fromCache: false }
  }

  /** 连通性探测 */
  async function ping(opts?: { base?: string }): Promise<WeApiOutcome> {
    const base = opts?.base ?? options.base
    await getOne(base, 'ping')
    return { ok: true, reachable: true }
  }

  return { wallpapers, current, ping }
}

export interface WeApiOutcome {
  ok: boolean
  wallpapers?: WeRawNormalized[]
  current?: WeRawNormalized | null
  reachable?: boolean
  fromCache?: boolean
  error?: string
}

export type WeBridge = ReturnType<typeof createWeBridge>
