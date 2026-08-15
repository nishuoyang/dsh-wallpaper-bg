/**
 * dsh-wallpaper-bg — 内置壁纸库
 *
 * 10 张默认壁纸，来自 Unsplash 免费图片源（直接使用其公开 CDN URL，
 * 无需 API key；<img>/background-image 加载不受 CORS 限制）。
 */

/** 内置壁纸列表：id / 标题 / 原图 URL / 缩略图 URL */
export const BUILTIN_WALLPAPERS = [
  {
    id: 'builtin-1',
    title: '山峦日落',
    photo: 'photo-1506905925346-21bda4d32df4',
  },
  {
    id: 'builtin-2',
    title: '晨雾山丘',
    photo: 'photo-1470071459604-3b5ec3a7fe05',
  },
  {
    id: 'builtin-3',
    title: '林间阳光',
    photo: 'photo-1441974231531-c6227db76b6e',
  },
  {
    id: 'builtin-4',
    title: '湖畔暮色',
    photo: 'photo-1501785888041-af3ef285b470',
  },
  {
    id: 'builtin-5',
    title: '星空雪山',
    photo: 'photo-1519681393784-d120267933ba',
  },
  {
    id: 'builtin-6',
    title: '原野日出',
    photo: 'photo-1472214103451-9374bd1c798e',
  },
  {
    id: 'builtin-7',
    title: '山谷光束',
    photo: 'photo-1469474968028-56623f02e42e',
  },
  {
    id: 'builtin-8',
    title: '彩丘',
    photo: 'photo-1493246507139-91e8fad9978e',
  },
  {
    id: 'builtin-9',
    title: '深空星云',
    photo: 'photo-1462331940025-496dfbfc7564',
  },
  {
    id: 'builtin-10',
    title: '极光',
    photo: 'photo-1519904981063-b0cf448d479e',
  },
] as const

/** 由 photo id 生成 Unsplash CDN URL */
export function unsplashUrl(photo: string, width: number, quality = 80): string {
  return `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=${width}&q=${quality}`
}

/** 内置壁纸 → 统一 WallpaperItem 列表（缩略图用于设置面板网格） */
export function builtinItems() {
  return BUILTIN_WALLPAPERS.map((w) => ({
    id: w.id,
    title: w.title,
    kind: 'image',
    url: unsplashUrl(w.photo, 1920, 80),
    thumbnail: unsplashUrl(w.photo, 400, 60),
  }))
}

/** 根据 id 查找内置壁纸（找不到时回退到第一张） */
export function builtinById(id: string | null) {
  const list = builtinItems()
  return list.find((w) => w.id === id) ?? list[0]
}
