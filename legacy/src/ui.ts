/**
 * dsh-wallpaper-bg — Web UI 侧背景层（Client）
 *
 * 职责：
 *  1. 在页面最底层注入背景层 <div id="dsh-wallpaper-bg"> 与半透明遮罩
 *     <div id="dsh-wallpaper-overlay">（均 position:fixed 全屏、z-index:-1、
 *     pointer-events:none；遮罩后追加在 DOM 中，绘制在背景层之上、页面内容
 *     之下）；
 *  2. 三种壁纸类型的渲染器：
 *     - 静态图片：background-image（cover 居中）
 *     - 视频壁纸：<video muted autoplay loop playsinline> 解码，绘制到
 *       <canvas>，帧率上限 30 FPS（33ms 定时器步进）
 *     - 动态场景：<iframe> 嵌入 WE 本地预览页（帧率由 WE 预览页自控，
 *       无法从宿主侧限帧；无预览地址时回退为缩略图静态展示）
 *  3. 遮罩透明度 / 背景模糊 / 背景亮度的实时应用。
 *
 * 说明：DSH 动态插件 Client 闭包屏蔽了 fetch/setTimeout/setInterval，
 * 定时器一律使用 ctx.interval（timer 服务）；document / window /
 * localStorage / indexedDB 等浏览器全局可直接使用。
 */

export interface BackgroundLayerDeps {
  /** ctx.interval（timer 服务注入） */
  interval(callback: () => void, ms: number): () => void
}

export interface SceneItemLike {
  previewUrl?: string
  thumbnail?: string
}

export interface BackgroundLayer {
  /** 背景层元素 */
  bgEl: HTMLElement
  /** 遮罩元素 */
  overlayEl: HTMLElement
  /** 渲染静态图片 */
  applyImage(url: string): void
  /** 渲染视频壁纸（30 FPS 上限） */
  applyVideo(url: string): void
  /** 渲染动态场景（iframe 或缩略图回退） */
  applyScene(item: SceneItemLike): void
  /** 清空当前渲染 */
  clear(): void
  /** 设置遮罩透明度 0–100 */
  setOverlay(opacity: number): void
  /** 设置模糊(0–20px)与亮度(50–150%) */
  setFilter(blurPx: number, brightnessPct: number): void
  /** 设置安全放大 0–10%（scale 放大整个背景层，从四周裁掉自带黑边） */
  setZoom(zoomPct: number): void
  /** 移除注入的 DOM 与全部渲染副作用 */
  dispose(): void
}

/** 客户端 MIME 推断（与 Host 侧保持一致，用于代理 URL 参数） */
export function guessMime(pathOrUrl: string): string {
  const clean = String(pathOrUrl).split(/[?#]/)[0].toLowerCase()
  const ext = clean.includes('.') ? (clean.split('.').pop() ?? '') : ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4',
  }
  return map[ext] ?? 'application/octet-stream'
}

/**
 * 把资源路径转换为可加载 URL：
 * - http(s) 直接使用（内置壁纸 / WE API 直接给出的网络缩略图）
 * - 绝对本地路径（C:\...、/...）转换为 Harness 同源代理地址
 */
export function assetUrlOf(p: string | null | undefined): string {
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
    return (
      '/dsh-wallpaper-bg/asset?path=' +
      encodeURIComponent(p) +
      '&mime=' +
      encodeURIComponent(guessMime(p))
    )
  }
  return p
}

/** 视频壁纸帧率上限：30 FPS */
const VIDEO_FRAME_INTERVAL_MS = 33

export function createBackgroundLayer(deps: BackgroundLayerDeps): BackgroundLayer {
  const doc = document
  const win = window

  const bgEl = doc.createElement('div')
  bgEl.id = 'dsh-wallpaper-bg'
  const overlayEl = doc.createElement('div')
  overlayEl.id = 'dsh-wallpaper-overlay'
  // 遮罩追加在背景层之后：同属根层叠上下文的负 z-index 元素按树序绘制，
  // 遮罩位于背景层之上、页面内容之下。
  doc.body.appendChild(bgEl)
  doc.body.appendChild(overlayEl)

  interface ActiveRender {
    kind: 'none' | 'image' | 'video' | 'scene' | 'scene-static'
    dispose: (() => void) | null
  }
  const active: ActiveRender = { kind: 'none', dispose: null }
  let lastObjectUrl: string | null = null

  function clearActive() {
    if (active.dispose) {
      try {
        active.dispose()
      } catch {
        /* 忽略 */
      }
      active.dispose = null
    }
    active.kind = 'none'
    bgEl.replaceChildren()
    bgEl.style.backgroundImage = ''
    if (lastObjectUrl) {
      try {
        URL.revokeObjectURL(lastObjectUrl)
      } catch {
        /* 忽略 */
      }
      lastObjectUrl = null
    }
  }

  function applyImage(url: string) {
    clearActive()
    if (!url) return
    active.kind = 'image'
    bgEl.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")'
  }

  function applyVideo(url: string) {
    clearActive()
    if (!url) return
    active.kind = 'video'
    const video = doc.createElement('video')
    video.muted = true
    video.autoplay = true
    video.loop = true
    video.setAttribute('playsinline', '')
    video.setAttribute('preload', 'auto')
    video.src = url
    const canvas = doc.createElement('canvas')
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    })
    bgEl.appendChild(canvas)
    const cx = canvas.getContext('2d')
    let stop: (() => void) | null = null
    let drawing = false
    const draw = () => {
      if (!cx || drawing || !video.videoWidth || !video.videoHeight) return
      drawing = true
      try {
        const dpr = win.devicePixelRatio || 1
        const bw = Math.max(1, Math.round(win.innerWidth * dpr))
        const bh = Math.max(1, Math.round(win.innerHeight * dpr))
        if (canvas.width !== bw) canvas.width = bw
        if (canvas.height !== bh) canvas.height = bh
        // cover 裁剪：从视频源中裁出与画布同比例的区域，恰好填满画布，
        // 画布位图与视口像素一一对应 —— 无黑边、无拉伸变形
        const vw = video.videoWidth
        const vh = video.videoHeight
        const scale = Math.max(bw / vw, bh / vh)
        const sw = bw / scale
        const sh = bh / scale
        const sx = (vw - sw) / 2
        const sy = (vh - sh) / 2
        cx.drawImage(video, sx, sy, sw, sh, 0, 0, bw, bh)
      } finally {
        drawing = false
      }
    }
    const onReady = () => {
      if (active.kind !== 'video') return
      stop = deps.interval(draw, VIDEO_FRAME_INTERVAL_MS)
      video.play().catch(() => {
        /* 浏览器自动播放策略失败时保持静默（muted 通常可放行） */
      })
    }
    const onResize = () => {
      if (active.kind === 'video') draw()
    }
    video.addEventListener('loadeddata', onReady)
    win.addEventListener('resize', onResize)
    active.dispose = () => {
      if (stop) stop()
      video.removeEventListener('loadeddata', onReady)
      win.removeEventListener('resize', onResize)
      try {
        video.pause()
      } catch {
        /* 忽略 */
      }
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        /* 忽略 */
      }
    }
  }

  function applyScene(item: SceneItemLike) {
    clearActive()
    const previewUrl = item && (item.previewUrl || '')
    if (previewUrl) {
      active.kind = 'scene'
      const iframe = doc.createElement('iframe')
      iframe.setAttribute('src', previewUrl)
      iframe.setAttribute('scrolling', 'no')
      iframe.setAttribute('title', 'Wallpaper Engine 场景预览')
      Object.assign(iframe.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        border: '0',
      })
      bgEl.appendChild(iframe)
      // 场景渲染帧率由 WE 预览页自身控制（宿主无法限制 iframe 内部帧率）；
      // 背景层整体 pointer-events:none，不会拦截 DSH 交互。
      active.dispose = () => {
        try {
          iframe.setAttribute('src', 'about:blank')
        } catch {
          /* 忽略 */
        }
      }
      return
    }
    // 无预览地址：回退为缩略图静态展示
    const thumb = item && (item.thumbnail || '')
    if (thumb) {
      applyImage(assetUrlOf(thumb))
      active.kind = 'scene-static'
    }
  }

  return {
    bgEl,
    overlayEl,
    applyImage,
    applyVideo,
    applyScene,
    clear: clearActive,
    setOverlay(opacity) {
      const o = Math.min(100, Math.max(0, Number(opacity) || 0))
      overlayEl.style.background = 'rgba(0,0,0,' + o / 100 + ')'
    },
    setFilter(blurPx, brightnessPct) {
      const blur = Math.min(20, Math.max(0, Number(blurPx) || 0))
      const brightness = Math.min(150, Math.max(50, Number(brightnessPct) || 100))
      bgEl.style.filter = 'blur(' + blur + 'px) brightness(' + brightness + '%)'
    },
    setZoom(zoomPct) {
      const z = Math.min(10, Math.max(0, Number(zoomPct) || 0))
      bgEl.style.transform = z > 0 ? 'scale(' + (1 + z / 100) + ')' : ''
    },
    dispose() {
      clearActive()
      overlayEl.remove()
      bgEl.remove()
    },
  }
}
