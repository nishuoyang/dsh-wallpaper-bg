/**
 * dsh-wallpaper-bg — 类型定义
 *
 * 说明：本工程是 DSH 动态 Cordis 插件 `dsh-wallpaper-bg` 的源码镜像。
 * 实际运行时插件通过 DSH 的 cordis_define 以纯 JavaScript 部署（DSH 动态
 * 插件不支持 TypeScript/JSX/import），本目录下的 .ts 文件与运行时代码保持
 * 一一对应，仅增加类型标注，可在 Node ≥ 22.6 下用
 * `node --experimental-strip-types` 直接运行（不依赖打包器）。
 */

/** 壁纸来源模式 */
export type WallpaperSource = 'builtin' | 'custom' | 'we'

/** 壁纸类型 */
export type WallpaperKind = 'image' | 'video' | 'scene' | 'unknown'

/** 一条统一的壁纸条目（三种来源共用） */
export interface WallpaperItem {
  /** 壁纸 ID（内置: builtin-N；自定义: up-<ts>-<rand>；WE: API 返回的 id） */
  id: string
  /** 壁纸标题 */
  title: string
  /** 壁纸类型 */
  kind: WallpaperKind
  /** 完整渲染资源 URL（内置为 https；自定义为 blob:；WE 为经 Harness 代理的 /dsh-wallpaper-bg/asset） */
  url: string
  /** 网格缩略图 URL（可为空） */
  thumbnail?: string
  /** WE 壁纸原始文件路径（仅 WE 来源，用于代理服务端读取） */
  filepath?: string
  /** WE 场景预览页 URL（仅 WE 来源的场景壁纸，用于 iframe 嵌入） */
  previewUrl?: string
  /** 自定义上传元数据 */
  upload?: {
    name: string
    mime: string
    createdAt: number
  }
}

/** 用户设置（持久化到 localStorage） */
export interface WallpaperSettings {
  /** 壁纸来源 */
  source: WallpaperSource
  /** 当前选中的壁纸 ID */
  wallpaperId: string | null
  /** Wallpaper Engine 本地 API 基地址 */
  weBase: string
  /** 同步桌面壁纸（仅 WE 来源可用） */
  syncDesktop: boolean
  /** 遮罩透明度 0–100 */
  overlayOpacity: number
  /** 背景模糊度 0–20 px */
  blur: number
  /** 背景亮度 50–150 % */
  brightness: number
  /** 安全放大 0–10 %（从四周裁掉视频/图片自带的边缘黑边） */
  safeZoom: number
}

/** 壁纸设置默认值 */
export const DEFAULT_SETTINGS: WallpaperSettings = {
  source: 'builtin',
  wallpaperId: 'builtin-1',
  weBase: 'http://127.0.0.1:8088',
  syncDesktop: false,
  overlayOpacity: 40,
  blur: 0,
  brightness: 100,
  safeZoom: 0,
}

/** WE 壁纸库原始条目（API 返回的任意形状，经 we-bridge 归一化前的输入） */
export interface WeRawWallpaper {
  id?: unknown
  publishedfileid?: unknown
  workshopId?: unknown
  wid?: unknown
  title?: unknown
  name?: unknown
  projectname?: unknown
  thumbnail?: unknown
  thumb?: unknown
  preview?: unknown
  previewUrl?: unknown
  preview_url?: unknown
  type?: unknown
  filetype?: unknown
  kind?: unknown
  wallpaperType?: unknown
  filepath?: unknown
  path?: unknown
  file?: unknown
  filePath?: unknown
  resourcePath?: unknown
  [key: string]: unknown
}

/** WE API 调用的统一返回 */
export interface WeApiResult {
  ok: boolean
  wallpapers?: WallpaperItem[]
  current?: WallpaperItem | null
  reachable?: boolean
  fromCache?: boolean
  error?: string
}

/** Host RPC 方法清单 */
export const HOST_RPC = {
  /** 只读调用 WE 本地 API（列表 / 当前壁纸 / 连通性探测），带 5 分钟缓存 */
  weApi: 'we:api',
} as const

/** 代理路由（Host 通过 webServer 注册，浏览器同源访问 WE 本地资源） */
export const PROXY_ROUTE = {
  prefix: '/dsh-wallpaper-bg',
  asset: '/dsh-wallpaper-bg/asset',
  health: '/dsh-wallpaper-bg/health',
} as const

/** localStorage 设置键 */
export const SETTINGS_KEY = 'dsh-wallpaper-bg:settings:v1'

/** IndexedDB 数据库 / 对象仓库名 */
export const IDB_NAME = 'dsh-wallpaper-bg'
export const IDB_STORE = 'uploads'

/** WE 壁纸库列表缓存有效期（5 分钟，Host 侧内存缓存） */
export const WE_LIST_CACHE_TTL_MS = 5 * 60 * 1000

/** WE 当前壁纸缓存有效期（10 秒，保证"同步桌面"足够新鲜） */
export const WE_CURRENT_CACHE_TTL_MS = 10 * 1000

/** 视频壁纸渲染帧率上限（30 FPS → 33ms 间隔） */
export const VIDEO_FPS_INTERVAL_MS = 33

/** 动态场景壁纸帧率上限（15 FPS → 66ms 间隔；仅作用于可自行渲染的场景，iframe 由 WE 预览页自控） */
export const SCENE_FPS_INTERVAL_MS = 66

/** 桌面壁纸同步轮询间隔（30 秒） */
export const SYNC_POLL_INTERVAL_MS = 30 * 1000
