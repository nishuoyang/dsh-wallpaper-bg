/**
 * dsh-wallpaper-bg v0.3.7 — 浏览器半（单文件 client bundle）
 * =========================================================
 * 以 DSH 客户端模块系统的工厂形式注册：window.__ModuleLoader__.load({id, factory})。
 * 仅 require 平台种子 'react'；宿主交互全部走同源路由 /dsh-wallpaper-bg/*。
 */
window.__ModuleLoader__.load({
  id: 'dsh-wallpaper-bg',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    // ---------- 常量与内置壁纸 ----------
    var SETTINGS_KEY = 'dsh-wallpaper-bg:settings:v1'
    var DEFAULTS = {
      source: 'builtin',
      wallpaperId: 'builtin-1',
      weBase: 'http://127.0.0.1:8088',
      syncDesktop: false,
      overlayOpacity: 40,
      lightFog: 55,
      blur: 0,
      brightness: 100,
      safeZoom: 0,
      customQueue: [],       // 播放队列：已上传图片壁纸的 id 列表（顺序即播放顺序）
      queueEnabled: false,   // 队列循环播放开关
      queueIndex: 0,         // 队列当前播放到的下标
      queueDurationMin: 5,   // 每张壁纸播放时长（分钟，1–10，自定义与 WE 两个队列共用）
      weQueue: [],           // WE 壁纸库播放队列：壁纸 id 列表
      weQueueEnabled: false, // WE 队列循环播放开关
      weQueueIndex: 0,       // WE 队列当前播放到的下标
    }
    var BUILTIN = [
      { id: 'builtin-1', title: '山峦日落', photo: 'photo-1506905925346-21bda4d32df4' },
      { id: 'builtin-2', title: '晨雾山丘', photo: 'photo-1470071459604-3b5ec3a7fe05' },
      { id: 'builtin-3', title: '林间阳光', photo: 'photo-1441974231531-c6227db76b6e' },
      { id: 'builtin-4', title: '湖畔暮色', photo: 'photo-1501785888041-af3ef285b470' },
      { id: 'builtin-5', title: '星空雪山', photo: 'photo-1519681393784-d120267933ba' },
      { id: 'builtin-6', title: '原野日出', photo: 'photo-1472214103451-9374bd1c798e' },
      { id: 'builtin-7', title: '山谷光束', photo: 'photo-1469474968028-56623f02e42e' },
      { id: 'builtin-8', title: '彩丘', photo: 'photo-1493246507139-91e8fad9978e' },
      { id: 'builtin-9', title: '深空星云', photo: 'photo-1462331940025-496dfbfc7564' },
      { id: 'builtin-10', title: '极光', photo: 'photo-1519904981063-b0cf448d479e' },
    ]
    function unsplashUrl(photo, w, q) {
      return 'https://images.unsplash.com/' + photo + '?auto=format&fit=crop&w=' + w + '&q=' + (q || 80)
    }
    var BUILTIN_ITEMS = BUILTIN.map(function (w) {
      return {
        id: w.id,
        title: w.title,
        kind: 'image',
        url: unsplashUrl(w.photo, 1920, 80),
        thumbnail: unsplashUrl(w.photo, 400, 60),
      }
    })
    var FALLBACK_ITEM = BUILTIN_ITEMS[0]

    var CSS_TEXT =
      '#dsh-wallpaper-bg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;overflow:hidden;pointer-events:none;background-position:center center;background-size:cover;background-repeat:no-repeat;transition:transform .2s ease;}' +
      // 切换壁纸用「双层交叉淡入淡出」：新壁纸先离屏解码 / 起播，再与旧壁纸叠化，避免中途空窗闪黑
      // 视频层内是 <video object-fit:cover>（由合成器缩放，避免 canvas 每帧重绘在 4K 下拖慢帧率）
      '#dsh-wallpaper-bg>.wbg-layer{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity .42s ease;background-color:#0b0d12;background-position:center center;background-size:cover;background-repeat:no-repeat;}' +
      '#dsh-wallpaper-bg>.wbg-layer>video{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;}' +
      '#dsh-wallpaper-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;background:rgba(0,0,0,0.4);transition:background .2s ease;}' +
      '.wbg-panel{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;}' +
      '.wbg-seg{display:flex;gap:8px;}' +
      '.wbg-seg-btn{flex:1;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:8px;cursor:pointer;font-size:13px;}' +
      '.wbg-seg-btn.wbg-active{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted);border-color:transparent;}' +
      '.wbg-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}' +
      '.wbg-tile{position:relative;aspect-ratio:16/10;border-radius:10px;overflow:hidden;border:2px solid var(--dsw-alias-border-l1);cursor:pointer;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-tile img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.wbg-tile.wbg-selected{border-color:var(--dsw-alias-brand-primary);}' +
      '.wbg-tile-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-tile-name{position:absolute;left:0;right:0;bottom:0;padding:16px 6px 4px;font-size:11px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.wbg-tile-badge{position:absolute;top:6px;right:6px;padding:2px 6px;border-radius:6px;font-size:10px;color:#fff;background:rgba(0,0,0,.55);}' +
      '.wbg-tile-badge2{position:absolute;top:6px;left:6px;padding:2px 6px;border-radius:6px;font-size:10px;color:#fff;background:rgba(224,64,64,.85);}' +
      '.wbg-tile-del{position:absolute;top:4px;left:4px;width:20px;height:20px;line-height:16px;border:none;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font-size:14px;cursor:pointer;}' +
      '.wbg-row{display:flex;align-items:center;gap:12px;}' +
      '.wbg-row label{width:88px;font-size:13px;color:var(--dsw-alias-label-secondary);flex:none;}' +
      '.wbg-row input[type=range]{flex:1;accent-color:var(--dsw-alias-brand-primary);}' +
      '.wbg-val{width:52px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '.wbg-filters{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}' +
      '.wbg-filter-label{flex:none;width:34px;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-chip{padding:4px 10px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;cursor:pointer;font-size:12px;}' +
      '.wbg-chip:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);}' +
      '.wbg-chip.wbg-active{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted);border-color:transparent;}' +
      '.wbg-filter-count{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-btn{padding:8px 14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;cursor:pointer;font-size:13px;}' +
      '.wbg-btn:hover{border-color:var(--dsw-alias-brand-primary);}' +
      '.wbg-btn:disabled{opacity:.55;cursor:default;}' +
      '.wbg-upload{cursor:pointer;}' +
      '.wbg-input{flex:1;min-width:160px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;font-size:12px;}' +
      '.wbg-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-primary);}' +
      '.wbg-switch input{accent-color:var(--dsw-alias-brand-primary);}' +
      '.wbg-hint{font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-error{font-size:12px;color:var(--dsw-alias-state-error-primary);}' +
      '.wbg-queue{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-queue.wbg-q-over{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);}' +
      '.wbg-queue-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}' +
      '.wbg-queue-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}' +
      '.wbg-queue-strip{display:flex;gap:8px;overflow-x:auto;padding:2px;}' +
      '.wbg-qitem{position:relative;flex:none;width:84px;aspect-ratio:16/10;border-radius:8px;overflow:hidden;border:2px solid var(--dsw-alias-border-l1);cursor:pointer;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-qitem img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.wbg-qitem.wbg-q-cur{border-color:var(--dsw-alias-brand-primary);}' +
      '.wbg-qitem-idx{position:absolute;bottom:4px;right:4px;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:8px;font-size:10px;color:#fff;background:rgba(0,0,0,.6);}' +
      '.wbg-qitem-del{position:absolute;top:3px;left:3px;width:18px;height:18px;line-height:15px;border:none;border-radius:5px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;cursor:pointer;}' +
      '.wbg-q-gap{flex:none;width:8px;border-radius:4px;background:var(--dsw-alias-brand-primary);opacity:.75;align-self:stretch;}' +
      // 播放队列（自定义上传 / WE 壁纸库）：粘在面板顶部，浏览长网格时始终可见、随时可拖入（毛玻璃背景避免压住网格内容）
      '.wbg-queue.wbg-q-sticky{position:sticky;top:0;z-index:6;backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(0,0,0,.15);}'

    function guessMimeClient(p) {
      var clean = String(p).split(/[?#]/)[0].toLowerCase()
      var ext = clean.includes('.') ? (clean.split('.').pop() || '') : ''
      var map = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
        gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
        mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
        avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4',
      }
      return map[ext] || 'application/octet-stream'
    }

    /** 自定义上传是否为视频：mime 前缀判断优先，再按扩展名兜底（部分浏览器 file.type 为空，直接按图片渲染会黑屏） */
    function isVideoUpload(rec) {
      var m = String((rec && rec.mime) || '')
      if (m.indexOf('video/') === 0) return true
      return guessMimeClient((rec && rec.name) || '').indexOf('video/') === 0
    }

    function assetUrlOf(p) {
      if (!p) return ''
      if (/^https?:\/\//i.test(p)) return p
      if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
        return '/dsh-wallpaper-bg/asset?path=' + encodeURIComponent(p) +
          '&mime=' + encodeURIComponent(guessMimeClient(p))
      }
      return p
    }

    var inject = ['slots', 'theme']

    function apply(ctx) {
      var slots = ctx.slots
      var theme = ctx.theme

      // ---------- 样式注入（fiber 卸载时移除） ----------
      var styleTag = document.createElement('style')
      styleTag.dataset.plugin = 'dsh-wallpaper-bg'
      styleTag.textContent = CSS_TEXT
      document.head.appendChild(styleTag)

      // ---------- 主题表面半透明化（overrideTokens 卸载由 theme 服务管理） ----------
      if (theme && typeof theme.overrideTokens === 'function') {
        theme.overrideTokens('dsh-wallpaper-bg', {
          '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
          '--dsw-alias-bg-layer-1': { light: 'rgba(255,255,255,0.55)', dark: 'rgba(16,20,28,0.55)' },
          '--dsw-alias-bg-layer-2': { light: 'rgba(255,255,255,0.62)', dark: 'rgba(22,27,36,0.62)' },
          '--dsw-specific-sidebar-fill': { light: 'rgba(255,255,255,0.5)', dark: 'rgba(10,13,19,0.5)' },
        })
      }

      // ---------- 背景层 ----------

      var bgEl = document.createElement('div')
      bgEl.id = 'dsh-wallpaper-bg'
      var overlayEl = document.createElement('div')
      overlayEl.id = 'dsh-wallpaper-overlay'
      document.body.appendChild(bgEl)
      document.body.appendChild(overlayEl)

      // ---------- 主题跟随：浅色雾层 / 深色遮罩自动切换 ----------
      var themeObserver = null
      if (document.body) {
        themeObserver = new MutationObserver(function () { applyOverlay() })
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }

      var activeKind = 'none'
      var lastObjectUrl = null

      // ---------- 交叉淡入淡出（切换壁纸不闪黑的关键） ----------
      // 旧壁纸留在原位，新壁纸在自己的图层里「先就绪、后显示」：
      //   图片 → 预加载 + decode 完成；视频 → loadeddata 且首帧可显示（<video> 直接铺满）；
      //   场景 / 网页 → iframe load 后等 180ms 让首帧落定。
      // 就绪后两层叠化，旧层淡出结束才移除，因此全程没有任何一帧是空背景。
      var FADE_MS = 420
      var layers = new Map()      // layer -> 清理函数（仅用于卸载时兜底释放）
      var activeLayer = null
      var applySeq = 0            // 每次应用自增：晚到的旧壁纸不会再抢镜
      var fadeTimers = new Set()

      // ---------- 下一张预热（让叠化几乎立刻开始） ----------
      // 队列停留期间就把下一张拉好：图片提前取到并解码、视频提前把数据取进缓存、
      // 自定义上传提前读 IndexedDB 并建好 objectURL（切换时直接复用，不重新读库）。
      // 预热窗口取「下一张切换前 30 秒」，既给网络留足时间，又不让解码结果过期。
      var PRELOAD_AHEAD_MS = 30000
      var preloadSeq = 0
      var preloadCache = new Map()   // key -> { url, objectUrl }（objectUrl=需要由插件释放）
      var preloadPending = new Map() // key -> Promise
      var videoSkipAt = new Map()    // 视频 url -> 跳过白场片头的起始秒数
      var activeVideoEl = null       // 当前正在显示的 <video>（首屏探测出白场时用来直接跳过）
      var warmAheadTimer = null      // 停留期开头的「拉取」预热
      var warmDecodeTimer = null     // 切换前 30 秒的「解码 / 复用」预热

      function clearWarmTimers() {
        if (warmAheadTimer) { window.clearTimeout(warmAheadTimer); warmAheadTimer = null }
        if (warmDecodeTimer) { window.clearTimeout(warmDecodeTimer); warmDecodeTimer = null }
      }

      function clearPreload() {
        clearWarmTimers()
        preloadSeq += 1
        preloadPending.clear()
        preloadCache.forEach(function (entry) { disposePreloadEntry(entry) })
        preloadCache.clear()
      }

      /** 预取一张壁纸：ready 回调给出立即可用的 url（自定义上传为 objectURL），失败返回 null */
      function preloadWallpaper(source, id, ready) {
        if (!id) return Promise.resolve(null)
        var key = source + ':' + id
        var hit = preloadCache.get(key)
        if (hit) { if (ready) ready(hit); return Promise.resolve(hit) }
        var waiting = preloadPending.get(key)
        if (waiting) {
          if (ready) waiting.then(function (entry) { if (entry) ready(entry) }, function () { /* 忽略 */ })
          return waiting
        }
        preloadCache.forEach(function (entry, k) {
          if (k !== key) disposePreloadEntry(entry)
        })
        preloadCache.clear()
        var seq = preloadSeq
        var p
        if (source === 'builtin') {
          var w = BUILTIN_ITEMS.find(function (x) { return x.id === id })
          if (!w) return Promise.resolve(null)
          p = loadImage(w.url).then(function () { return { url: w.url, objectUrl: false } })
        } else if (source === 'custom') {
          p = idbGet(id).then(function (rec) {
            if (!rec) return null
            var url = URL.createObjectURL(rec.blob)
            var vid = isVideoUpload(rec)
            var entry = { url: url, objectUrl: true, isVideo: vid }
            // 视频：用真实的 <video> 元素预热（浏览器会缓冲数据），切换时连元素一起复用
            if (vid) return warmVideoElement(url).then(function (el) { entry.videoEl = el; return entry })
            return loadImage(url).then(function () { return entry })
          })
        } else {
          var list = weCache.list || []
          var item = list.find(function (x) { return String(x.id) === String(id) })
          if (!item) return Promise.resolve(null)   // 列表未就绪：留给切换时的正常路径
          if (item.kind === 'video') {
            var vu = assetUrlOf(item.filepath)
            p = vu
              ? warmVideoElement(vu).then(function (el) { return { url: vu, objectUrl: false, videoEl: el } })
              : Promise.resolve(null)
          } else if (item.kind === 'image') {
            var iu = assetUrlOf(item.filepath || item.thumbnail)
            p = iu ? loadImage(iu).then(function () { return { url: iu, objectUrl: false } }) : Promise.resolve(null)
          } else {
            p = Promise.resolve(null)   // 场景 / 网页由 iframe 自己加载
          }
        }
        p = p.then(function (entry) {
          if (seq !== preloadSeq) {
            disposePreloadEntry(entry)
            return null
          }
          if (entry) preloadCache.set(key, entry)
          return entry
        }, function () { return null })
        preloadPending.set(key, p)
        p.then(function () { if (preloadPending.get(key) === p) preloadPending.delete(key) })
        if (ready) p.then(function (entry) { if (entry) ready(entry) }, function () { /* 忽略 */ })
        return p
      }

      /** 建一个离屏 <video> 把数据缓冲好（真实元素预热；fetch 无法命中 <video> 的媒体缓存） */
      function warmVideoElement(url) {
        return new Promise(function (resolve) {
          var el = document.createElement('video')
          el.muted = true
          el.loop = true
          el.setAttribute('playsinline', '')
          el.setAttribute('preload', 'auto')
          var settled = false
          var done = function () {
            if (settled) return
            settled = true
            el.removeEventListener('loadeddata', done)
            el.removeEventListener('error', done)
            // 部分壁纸视频开头是纯白片头（例如《明日方舟》喧闹法则前 2 秒、MIKU 开头 1 秒亮白），
            // 顺手探一下正片起点，切换时直接从正片开始播，避免看到一大片白。
            if (el.videoWidth) {
              probeVideoContentStart(el).then(function (skip) {
                if (skip > 0) {
                  videoSkipAt.set(url, skip)
                  // 首屏没有预热阶段，可能已经在播白场片头了：直接跳到正片，用户只看到画面切一下
                  if (el === activeVideoEl && !el.__wbgSkipDone) {
                    el.__wbgSkipDone = true
                    try { el.currentTime = skip } catch (e) { /* 忽略 */ }
                  }
                }
                resolve(el)
              }, function () { resolve(el) })
              return
            }
            resolve(el)   // 加载失败也返回元素，切换时走正常加载路径
          }
          el.addEventListener('loadeddata', done)
          el.addEventListener('error', done)
          later(done, 60000)   // 超大文件兜底
          el.src = url
          try { el.load() } catch (e) { /* 忽略 */ }
        })
      }

      /** 判断一帧是不是「以纯白为主」：白像素占比 ≥70% 即认为还在白场里。
       *  用占比而不是平均亮度，避免误伤「亮但画面有内容」的壁纸（例如 MIKU 开头是亮天幕）。 */
      function frameLooksWhite(ctx, w, h) {
        try {
          var sw = Math.min(w, 64)
          var sh = Math.min(h, 36)
          if (sw < 2 || sh < 2) return false
          var d = ctx.getImageData(0, 0, sw, sh).data
          var n = 0
          var white = 0
          for (var i = 0; i < d.length; i += 4) {
            n++
            if (d[i] > 246 && d[i + 1] > 246 && d[i + 2] > 246) white++
          }
          return n > 0 && white / n >= 0.7
        } catch (e) {
          return false
        }
      }

      /** 探出视频里「第一帧不是纯白」的时间点；开头不是白场就直接返回 0（不做无谓 seek） */
      function probeVideoContentStart(el) {
        var c = document.createElement('canvas')
        var cx = c.getContext('2d', { willReadFrequently: true })
        if (!cx) return Promise.resolve(0)
        var seekTo = function (t) {
          return new Promise(function (resolve) {
            var ok = false
            var fin = function () {
              if (ok) return
              ok = true
              el.removeEventListener('seeked', fin)
              el.removeEventListener('error', fin)
              resolve()
            }
            el.addEventListener('seeked', fin)
            el.addEventListener('error', fin)
            later(fin, 3000)
            try { el.currentTime = t } catch (e) { fin() }
          })
        }
        var sample = function (t) {
          var w = el.videoWidth
          var h = el.videoHeight
          if (!w || !h) return false
          c.width = Math.min(w, 64)
          c.height = Math.min(h, 36)
          try { cx.drawImage(el, 0, 0, c.width, c.height) } catch (e) { return false }
          return frameLooksWhite(cx, c.width, c.height)
        }
        return seekTo(0).then(function () {
          if (!sample(0)) return 0
          var probes = [0.6, 1.2, 1.8, 2.4, 3.0, 3.8, 4.6]
          var i = 0
          var step = function () {
            if (i >= probes.length) return Promise.resolve(0)
            var t = probes[i++]
            return seekTo(t).then(function () {
              if (!sample(t)) return t
              return step()
            })
          }
          return step().then(function (skip) {
            return seekTo(0).then(function () { return skip })   // 复位，播放时从头开始
          })
        })
      }

      /** 跳过白场片头：seek 到正片起点，seek 完成后 resolve（调用方据此恢复播放） */
      function applyVideoSkip(el, url) {
        var skip = videoSkipAt.get(url) || 0
        if (skip <= 0) return Promise.resolve()
        return new Promise(function (resolve) {
          var ok = false
          var fin = function () {
            if (ok) return
            ok = true
            el.removeEventListener('seeked', fin)
            resolve()
          }
          el.addEventListener('seeked', fin)
          try { el.currentTime = skip } catch (e) { fin() }
          later(fin, 1200)   // 兜底：seek 失败也要恢复播放
        })
      }

      /** 丢弃一条预取结果（含预热用的 <video> 元素）；正在使用的 objectURL 不释放 */
      function disposePreloadEntry(entry) {
        if (!entry) return
        if (entry.objectUrl && entry.url !== lastObjectUrl) {
          try { URL.revokeObjectURL(entry.url) } catch (e) { /* 忽略 */ }
        }
        releaseVideo(entry.videoEl)
      }

      /** 取已预热的条目（自定义上传的 objectURL / 预热好的 <video> 可直接复用）；未命中则丢弃其它预取 */
      function takePreload(source, id) {
        var key = source + ':' + id
        var entry = preloadCache.get(key)
        if (!entry) {
          // 不是这次要显示的那张：预取结果作废，避免长期占着内存 / 带宽
          preloadCache.forEach(function (e) { disposePreloadEntry(e) })
          preloadCache.clear()
          return { url: null, objectUrl: false }
        }
        preloadCache.delete(key)
        return entry
      }

      function later(fn, ms) {
        var id = window.setTimeout(function () { fadeTimers.delete(id); fn() }, ms)
        fadeTimers.add(id)
        return id
      }

      /** 彻底释放一个视频：暂停 + 断开媒体资源（仅 pause() 不释放解码器，会拖慢后续播放） */
      function releaseVideo(el) {
        if (!el) return
        try { el.pause() } catch (e) { /* 忽略 */ }
        try { el.srcObject = null } catch (e) { /* 忽略 */ }
        try { el.removeAttribute('src'); el.load() } catch (e) { /* 忽略 */ }
      }

      /** 移除图层时兜底释放其中的视频（任何漏调的 dispose 都不会再留下后台解码） */
      function purgeVideosIn(node) {
        if (!node || !node.querySelectorAll) return
        var vs = node.querySelectorAll('video')
        for (var i = 0; i < vs.length; i++) releaseVideo(vs[i])
      }

      /** 旧图层淡出后移除；未接入 DOM 的图层直接丢弃 */
      function fadeOutLayer(layer) {
        if (!layer) return
        // 关键：先把该层的 dispose 摘出来并执行（停掉抽帧定时器、暂停并断开视频）。
        // 这些 <video> 从不进入 DOM，被分离后浏览器仍会继续解码：只要漏掉一次 dispose，
        // 每切一张就多留一路后台解码 + 一个 30fps 定时器，实测 6 次切换后帧率 59.7 → 12.2。
        var cleanup = layers.get(layer) || null
        if (layers.has(layer)) layers.delete(layer)
        if (cleanup) { try { cleanup() } catch (e) { /* 忽略 */ } }
        purgeVideosIn(layer)
        if (!layer.parentNode) return
        layer.style.opacity = '0'
        var gone = false
        var onEnd = function (e) {
          if (e.target !== layer || e.propertyName !== 'opacity') return
          layer.removeEventListener('transitionend', onEnd)
          drop()
        }
        var drop = function () {
          if (gone) return
          gone = true
          purgeVideosIn(layer)
          if (layer.parentNode) layer.parentNode.removeChild(layer)
        }
        layer.addEventListener('transitionend', onEnd)
        later(drop, FADE_MS + 200)
      }

      function clearActive() {
        activeKind = 'none'
        fadeTimers.forEach(function (id) { window.clearTimeout(id) })
        fadeTimers.clear()
        var all = []
        layers.forEach(function (fn, layer) { all.push({ fn: fn, layer: layer }) })
        layers.clear()
        all.forEach(function (x) {
          if (x.fn) { try { x.fn() } catch (e) { /* 忽略 */ } }
          if (x.layer.parentNode) x.layer.parentNode.removeChild(x.layer)
        })
        if (activeLayer) {
          if (activeLayer.parentNode) activeLayer.parentNode.removeChild(activeLayer)
          activeLayer = null
        }
        if (lastObjectUrl) {
          // 若这个 URL 正躺在预热缓存里等待复用，就留给 clearPreload 统一释放，避免提前失效
          var stillWanted = false
          preloadCache.forEach(function (entry) { if (entry && entry.url === lastObjectUrl) stillWanted = true })
          if (!stillWanted) {
            try { URL.revokeObjectURL(lastObjectUrl) } catch (e) { /* 忽略 */ }
          }
          lastObjectUrl = null
        }
        clearPreload()
      }

      /** 新图层入栈：先透明就位，下一帧再淡入，同时把旧图层淡出。
       *  注意：这里绝不能写 layers.set(layer, null)——视频路径是「先注册清理函数、再调 crossfade」，
       *  覆盖成 null 会让旧层的 dispose 永远丢失（旧视频继续后台解码，越切越卡）。 */
      function crossfade(layer, kind) {
        var previous = activeLayer
        if (!layers.has(layer)) layers.set(layer, null)
        bgEl.appendChild(layer)
        activeLayer = layer
        activeKind = kind
        window.requestAnimationFrame(function () {
          if (activeLayer !== layer) return
          layer.style.opacity = '1'
          if (previous && previous !== layer) fadeOutLayer(previous)
        })
      }

      /** 预解码图片：缓存命中时几乎立即 resolve，未缓存时等真正解码完成，杜绝「换 url 到画出像素」的空窗 */
      function loadImage(url) {
        return new Promise(function (resolve, reject) {
          var img = new Image()
          img.onload = function () {
            if (img.decode) img.decode().then(resolve, resolve)
            else resolve()
          }
          img.onerror = function () { reject(new Error('图片加载失败: ' + url)) }
          img.src = url
        })
      }

      function applyImage(url, preloaded) {
        if (!url) { clearActive(); return }
        var seq = ++applySeq
        return loadImage(url).then(function () {
          if (seq !== applySeq) return
          var layer = document.createElement('div')
          layer.className = 'wbg-layer'
          layer.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")'
          crossfade(layer, 'image')
          if (!preloaded) warmNextInQueue()
        })
      }

      /** 一次性探测正在播放的视频首帧是否白场（仅在「首次加载、没有预热结果」时调用一次）。
       *  注意：从 4K 视频取一帧的 drawImage 约 28ms，因此**绝不能每帧做**，只在首帧判断一次；
       *  只有首帧确实是白场才继续找正片起点（≤8 次 seek + 采样）。 */
      function probeStartupWhite(el, url) {
        var c = document.createElement('canvas')
        var cx = c.getContext('2d', { willReadFrequently: true })
        if (!cx || !el.videoWidth) return
        var w = Math.min(el.videoWidth, 64)
        var h = Math.min(el.videoHeight, 36)
        c.width = w
        c.height = h
        var sample = function () {
          try { cx.drawImage(el, 0, 0, w, h) } catch (e) { return false }
          return frameLooksWhite(cx, w, h)
        }
        if (!sample()) return   // 首帧有内容：无需探测，零后续开销
        probeVideoContentStart(el).then(function (skip) {
          if (skip > 0) {
            videoSkipAt.set(url, skip)
            try { el.currentTime = skip } catch (e) { /* 忽略 */ }
          }
          // 探测过程反复 seek 会暂停播放，务必恢复（否则画面停在首帧不动）
          try { el.play() } catch (e) { /* 忽略 */ }
        }, function () { try { el.play() } catch (e) { /* 忽略 */ } })
      }

      function applyVideo(url, preloaded, warmVideo) {
        if (!url) { clearActive(); return }
        var seq = ++applySeq
        // 队列预热时已经建好的 <video> 直接复用：它已经缓冲好数据，切换几乎立刻出画面
        var video = warmVideo || document.createElement('video')
        video.muted = true
        video.autoplay = true
        video.loop = true
        video.setAttribute('playsinline', '')
        video.setAttribute('preload', 'auto')
        // 用 <video> + object-fit: cover 直接铺满，把缩放 / 裁剪交给合成器（GPU）：
        // 之前用 canvas 每帧 drawImage 缩放，1080p 尚可（约 2ms/帧），但 4K 视频单帧要 20–40ms，
        // 帧率被压到 24–28fps；改由合成器处理后，4K 也能跑满 50–60fps。
        video.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;'
        var live = false
        var layer = null
        var layerInDom = false
        var dispose = function () {
          live = false
          if (activeVideoEl === video) activeVideoEl = null
          releaseVideo(video)
        }
        return new Promise(function (resolve, reject) {
          var onReady = function () {
            video.removeEventListener('loadeddata', onReady)
            video.removeEventListener('error', onFail)
            if (seq !== applySeq) { dispose(); return }
            activeVideoEl = video
            layer = document.createElement('div')
            layer.className = 'wbg-layer'
            layer.appendChild(video)
            layers.set(layer, dispose)
            // 白场片头已探明时先从正片起点开始；seek 会暂停播放，因此 seek 结束后统一起播。
            // 预热用的 <video> 一直是暂停的（预热只缓冲数据、不起播），这里必须显式 play()，
            // 否则复用预热元素时画面会停在首帧不动。
            var kick = function () { try { video.play() } catch (e) { /* 忽略 */ } }
            applyVideoSkip(video, url).then(function () { if (seq === applySeq) kick() })
            if (preloaded) {
              // 预热阶段已探明白场片头：直接叠化，无任何每帧开销
              crossfade(layer, 'video')
            } else {
              // 首次加载：先透明入 DOM 并起播（解码继续推进），首帧落定后再叠化，避免露白底
              bgEl.appendChild(layer)
              layerInDom = true
              kick()
              var finish = function () {
                if (seq !== applySeq) return
                probeStartupWhite(video, url)
                crossfade(layer, 'video')
                warmNextInQueue()
              }
              if (video.readyState >= 3) later(finish, 60)
              else video.addEventListener('canplay', function () { later(finish, 60) }, { once: true })
              later(finish, 1500)   // 兜底：解码慢也不能让旧壁纸一直挂着
            }
            live = true
            resolve()
          }
          var onFail = function () {
            video.removeEventListener('loadeddata', onReady)
            video.removeEventListener('error', onFail)
            if (layerInDom && layer && layer.parentNode) layer.parentNode.removeChild(layer)
            dispose()
            reject(new Error('视频加载失败: ' + url))
          }
          if (video.readyState >= 2) {
            onReady()
            return
          }
          video.addEventListener('loadeddata', onReady)
          video.addEventListener('error', onFail)
          if (!warmVideo) video.src = url
        })
      }

      function applyScene(item) {
        var previewUrl = item && item.previewUrl
        if (previewUrl) return applyFrame(previewUrl, 'Wallpaper Engine 场景预览', 'scene')
        // 无预览地址：回退为缩略图静态展示（GIF 预览会保持动画）
        var thumb = item && item.thumbnail
        if (thumb) return applyImage(assetUrlOf(thumb))
        clearActive()
      }

      function applyWeb(item) {
        if (!item) { clearActive(); return }
        var entry = String(item.entry || '')
        if (!entry) {
          var fp = String(item.filepath || '')
          var idx = Math.max(fp.lastIndexOf('\\'), fp.lastIndexOf('/'))
          entry = idx >= 0 ? fp.slice(idx + 1) : ''
        }
        if (!entry) return applyImage(assetUrlOf(item.thumbnail))
        var rel = entry.split(/[\\/]/).filter(Boolean).map(function (s) { return encodeURIComponent(s) }).join('/')
        var base = String(state.weBase || DEFAULTS.weBase).replace(/\/+$/, '')
        return applyFrame(
          base + '/files/' + item.id + '/' + rel,
          'Wallpaper Engine 网页壁纸 ' + (item.title || item.id),
          'web',
        )
      }

      /** iframe 类壁纸（场景 / 网页）：等 load 事件 + 一小段渲染时间，再叠化入场 */
      function applyFrame(url, title, kind) {
        var seq = ++applySeq
        var iframe = document.createElement('iframe')
        iframe.setAttribute('scrolling', 'no')
        iframe.setAttribute('title', title)
        Object.assign(iframe.style, {
          position: 'absolute', top: '0', left: '0',
          width: '100%', height: '100%', border: '0',
        })
        return new Promise(function (resolve) {
          var done = false
          var finish = function () {
            if (done) return
            done = true
            if (seq !== applySeq) { iframe.setAttribute('src', 'about:blank'); return }
            var layer = document.createElement('div')
            layer.className = 'wbg-layer'
            layer.appendChild(iframe)
            layers.set(layer, function () {
              try { iframe.setAttribute('src', 'about:blank') } catch (e) { /* 忽略 */ }
            })
            crossfade(layer, kind)
            resolve()
            warmNextInQueue()   // 叠化已开始，顺手把下一张也预热好
          }
          // load 之后给页面留一帧多一点的渲染时间，避免叠化时看到白底 / 空帧
          iframe.addEventListener('load', function () { later(finish, 180) })
          iframe.setAttribute('src', url)
          later(finish, 4000)   // 加载超时兜底：不能让旧壁纸一直挂着
          // 场景帧率由预览页自控（宿主无法限帧）；背景层 pointer-events:none 不拦截交互
        })
      }

      function isDarkTheme() {
        return !!(document.body && document.body.hasAttribute('data-ds-dark-theme'))
      }
      function applyOverlay() {
        // 深色外观 → 黑色压暗遮罩；浅色外观 → 半透明白色雾层（类侧边栏雾感，垫在背景与内容之间提升细字可读性）
        var dark = isDarkTheme()
        var v = Math.min(100, Math.max(0, Number(dark ? state.overlayOpacity : state.lightFog) || 0))
        overlayEl.style.background = dark
          ? 'rgba(0,0,0,' + v / 100 + ')'
          : 'rgba(255,255,255,' + v / 100 + ')'
      }
      function setFilter(blurPx, brightnessPct) {
        var blur = Math.min(20, Math.max(0, Number(blurPx) || 0))
        var brightness = Math.min(150, Math.max(50, Number(brightnessPct) || 100))
        // 关键：恒等滤镜（blur(0px) brightness(100%)）并不是「无操作」——它会让背景层无法走
        // GPU 合成，4K 视频实测从 60fps 掉到 22fps。只有真的需要模糊 / 调亮度时才挂 filter。
        bgEl.style.filter = (blur === 0 && brightness === 100)
          ? ''
          : 'blur(' + blur + 'px) brightness(' + brightness + '%)'
      }
      function setZoom(v) {
        var z = Math.min(10, Math.max(0, Number(v) || 0))
        bgEl.style.transform = z > 0 ? 'scale(' + (1 + z / 100) + ')' : ''
      }
      function disposeLayer() {
        clearActive()
        clearPreload()
        overlayEl.remove()
        bgEl.remove()
      }

      // ---------- 状态（localStorage 持久化） ----------
      var state = loadState()
      var listeners = new Set()
      function loadState() {
        try {
          var raw = localStorage.getItem(SETTINGS_KEY)
          var parsed = raw ? JSON.parse(raw) : {}
          var merged = Object.assign({}, DEFAULTS, parsed)
          // 迁移：旧默认端口 8080（被 Jenkins 占用）→ 新默认 8088
          if (merged.weBase === 'http://127.0.0.1:8080') merged.weBase = DEFAULTS.weBase
          return merged
        } catch (e) {
          return Object.assign({}, DEFAULTS)
        }
      }
      function saveState() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state)) } catch (e) { /* 忽略 */ }
      }
      function emit() { listeners.forEach(function (fn) { fn() }) }
      function subscribe(fn) {
        listeners.add(fn)
        return function () { listeners.delete(fn) }
      }
      function setState(patch) {
        state = Object.assign({}, state, patch)
        saveState()
        emit()
        applyNow().catch(function () { /* 保持当前背景 */ })
      }

      // ---------- 宿主代理调用（同源 fetch） ----------
      function weApiCall(args) {
        var q = new URLSearchParams()
        q.set('action', args.endpoint === 'current' ? 'current' : 'wallpapers')
        if (args.base) q.set('base', args.base)
        if (args.refresh) q.set('refresh', '1')
        return fetch('/dsh-wallpaper-bg/we?' + q.toString()).then(function (r) { return r.json() })
      }

      // ---------- IndexedDB（自定义上传持久化） ----------
      var dbPromise = null
      function openDb() {
        if (dbPromise) return dbPromise
        dbPromise = new Promise(function (resolve, reject) {
          var req = indexedDB.open('dsh-wallpaper-bg', 1)
          req.onupgradeneeded = function () {
            var db = req.result
            if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', { keyPath: 'id' })
          }
          req.onsuccess = function () { resolve(req.result) }
          req.onerror = function () { reject(req.error || new Error('IndexedDB 打开失败')) }
        })
        return dbPromise
      }
      async function idbList() {
        var db = await openDb()
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('uploads', 'readonly')
          var rq = tx.objectStore('uploads').getAll()
          rq.onsuccess = function () { resolve((rq.result || []).sort(function (a, b) { return b.createdAt - a.createdAt })) }
          rq.onerror = function () { reject(rq.error) }
        })
      }
      async function idbGet(id) {
        var db = await openDb()
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('uploads', 'readonly')
          var rq = tx.objectStore('uploads').get(id)
          rq.onsuccess = function () { resolve(rq.result || null) }
          rq.onerror = function () { reject(rq.error) }
        })
      }
      async function idbPut(rec) {
        var db = await openDb()
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('uploads', 'readwrite')
          tx.objectStore('uploads').put(rec)
          tx.oncomplete = function () { resolve() }
          tx.onerror = function () { reject(tx.error) }
        })
      }
      async function idbRemove(id) {
        var db = await openDb()
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('uploads', 'readwrite')
          tx.objectStore('uploads').delete(id)
          tx.oncomplete = function () { resolve() }
          tx.onerror = function () { reject(tx.error) }
        })
      }

      // ---------- 播放队列：定时切到下一张（循环，自定义与 WE 两个队列共用） ----------
      var queueTimer = null
      function clearQueueTimer() {
        if (queueTimer) {
          window.clearTimeout(queueTimer)
          queueTimer = null
        }
      }
      /** 当前来源对应的队列快照（无队列则返回 null） */
      function queueStateFor(source) {
        if (source === 'custom') {
          return { enabled: !!state.queueEnabled, list: state.customQueue || [], index: Number(state.queueIndex) || 0, indexKey: 'queueIndex' }
        }
        if (source === 'we') {
          return { enabled: !!state.weQueueEnabled, list: state.weQueue || [], index: Number(state.weQueueIndex) || 0, indexKey: 'weQueueIndex' }
        }
        return null
      }
      function scheduleQueueNext() {
        clearQueueTimer()
        clearWarmTimers()
        var source = state.source
        var qs = queueStateFor(source)
        if (!qs || !qs.enabled || qs.list.length < 2) return
        var durMin = Math.min(10, Math.max(1, Number(state.queueDurationMin) || 5))
        var indexKey = qs.indexKey
        // 停留期一开始先「拉取」预热：网络大图 / 视频有几分钟时间慢慢下载
        warmQueueNext(source, qs)
        // 切换前 30 秒再预热一次：这次带着解码 / 复用，保证叠化几乎立刻开始
        var aheadIn = durMin * 60000 - PRELOAD_AHEAD_MS
        if (aheadIn > 1000) {
          warmDecodeTimer = window.setTimeout(function () {
            warmDecodeTimer = null
            if (state.source !== source) return
            var qs3 = queueStateFor(source)
            if (!qs3 || !qs3.enabled || qs3.list.length < 2) return
            warmQueueNext(source, qs3)
          }, aheadIn)
        }
        queueTimer = window.setTimeout(function () {
          queueTimer = null
          if (state.source !== source) return
          var qs2 = queueStateFor(source)
          if (!qs2 || !qs2.enabled || qs2.list.length < 2) return
          var patch = {}
          patch[indexKey] = (qs2.index + 1) % qs2.list.length
          setState(patch)
        }, durMin * 60000)
      }

      /** 预热当前队列的下一张（非队列场景调用无副作用） */
      function warmNextInQueue() {
        var source = state.source
        var qs = queueStateFor(source)
        if (!qs || !qs.enabled || qs.list.length < 2) return
        warmQueueNext(source, qs)
      }

      /** 把队列里「下一个」壁纸预取好；已在预热中 / 已预热则直接复用 */
      function warmQueueNext(source, qs) {
        var nextIdx = (qs.index + 1) % qs.list.length
        var nextId = qs.list[nextIdx]
        if (nextId === undefined || nextId === null || nextId === '') return
        preloadWallpaper(source, String(nextId))
      }

      // ---------- 背景应用（解析来源 → 驱动渲染层） ----------
      var weCache = { list: null }
      var applyToken = 0
      async function applyNow() {
        var token = ++applyToken
        clearQueueTimer()
        // 注意：这里不能清掉预热结果——队列推进常常先触发一次无关的 setState（同样会走到本函数），
        // 预热好的「下一张」必须留到真正被消费时才作废，否则每张都要重新下载 / 解码。
        applyOverlay()
        setFilter(state.blur, state.brightness)
        setZoom(state.safeZoom)
        if (state.source === 'builtin') {
          var w = BUILTIN_ITEMS.find(function (x) { return x.id === state.wallpaperId }) || FALLBACK_ITEM
          if (token === applyToken) applyImage(w.url)
          return
        }
        if (state.source === 'custom') {
          var q = state.customQueue || []
          if (state.queueEnabled && q.length) {
            var qIdx = Math.min(Math.max(0, Number(state.queueIndex) || 0), q.length - 1)
            var qid = q[qIdx]
            if (qid) {
              // 队列项：优先用停留期已经预热好的 objectURL（省掉读库 + 建 URL + 下载解码的等待）
              var preC = takePreload('custom', qid)
              var qUrl = preC.url
              if (!qUrl) {
                var qrec = await idbGet(qid).catch(function () { return null })
                if (token !== applyToken) return
                if (qrec) {
                  qUrl = URL.createObjectURL(qrec.blob)
                  if (isVideoUpload(qrec)) applyVideo(qUrl)
                  else applyImage(qUrl)
                  lastObjectUrl = qUrl
                  scheduleQueueNext()
                  return
                }
              } else {
                if (preC.objectUrl) lastObjectUrl = qUrl
                if (preC.isVideo) applyVideo(qUrl, true, preC.videoEl)
                else applyImage(qUrl, true)
                scheduleQueueNext()
                return
              }
              // 队列项已不存在（极端情况）：退回普通单选逻辑
            }
          }
          if (!state.wallpaperId) {
            if (token === applyToken) applyImage(FALLBACK_ITEM.url)
            return
          }
          var rec = await idbGet(state.wallpaperId).catch(function () { return null })
          if (token !== applyToken) return
          if (!rec) {
            applyImage(FALLBACK_ITEM.url)
            return
          }
          var objUrl = URL.createObjectURL(rec.blob)
          if (isVideoUpload(rec)) {
            applyVideo(objUrl)
            lastObjectUrl = objUrl
          } else {
            applyImage(objUrl)
            lastObjectUrl = objUrl
          }
          return
        }
        // WE 壁纸库：按 kind 分发渲染（队列 / 单张 / 桌面同步共用）
        function applyWeItem(item) {
          if (!item) {
            applyImage(FALLBACK_ITEM.url)
            return
          }
          if (item.kind === 'video') {
            var preV = takePreload('we', item.id)
            var u = preV.url || assetUrlOf(item.filepath)
            if (u) applyVideo(u, !!preV.url, preV.videoEl)
            else applyImage(assetUrlOf(item.thumbnail))
            return
          }
          if (item.kind === 'scene') {
            applyScene({ previewUrl: item.previewUrl, thumbnail: item.thumbnail })
            return
          }
          if (item.kind === 'web') {
            applyWeb(item)
            return
          }
          var preI = takePreload('we', item.id)
          var u2 = preI.url || assetUrlOf(item.filepath || item.thumbnail)
          if (u2) applyImage(u2, !!preI.url)
          else applyImage(FALLBACK_ITEM.url)
        }
        // WE 壁纸库
        var item = null
        var wq = state.weQueue || []
        if (state.weQueueEnabled && wq.length) {
          var wqIdx = Math.min(Math.max(0, Number(state.weQueueIndex) || 0), wq.length - 1)
          var wqId = String(wq[wqIdx])
          var listQ = weCache.list
          if (!listQ) {
            var resQ = await weApiCall({ endpoint: 'wallpapers', base: state.weBase })
            if (token !== applyToken) return
            if (resQ && resQ.ok) {
              listQ = resQ.wallpapers || []
              weCache.list = listQ
            }
          }
          item = (listQ || []).find(function (x) { return String(x.id) === wqId }) || null
          if (item) {
            if (token !== applyToken) return
            applyWeItem(item)
            scheduleQueueNext()
            return
          }
          // 队列项不在当前列表（极端情况）：退回单张 / 桌面同步逻辑
        }
        if (state.syncDesktop) {
          var res = await weApiCall({ endpoint: 'current', base: state.weBase })
          if (token !== applyToken) return
          if (res && res.ok && res.current) item = res.current
        } else if (state.wallpaperId) {
          var list = weCache.list
          if (!list) {
            var res2 = await weApiCall({ endpoint: 'wallpapers', base: state.weBase })
            if (token !== applyToken) return
            if (res2 && res2.ok) {
              list = res2.wallpapers || []
              weCache.list = list
            }
          }
          item = (list || []).find(function (x) { return String(x.id) === String(state.wallpaperId) }) || null
        }
        if (token !== applyToken) return
        applyWeItem(item)
      }

      // ---------- 桌面壁纸同步轮询（30 秒） ----------
      var syncIv = window.setInterval(function () {
        if (state.source !== 'we' || !state.syncDesktop) return
        weApiCall({ endpoint: 'current', base: state.weBase, refresh: true }).then(function (res) {
          if (!res || !res.ok || !res.current) return
          var id = String(res.current.id)
          if (String(state.wallpaperId) !== id) {
            state.wallpaperId = id
            saveState()
            emit()
            applyNow().catch(function () { /* 忽略 */ })
          }
        }).catch(function () { /* 忽略 */ })
      }, 30000)

      // ---------- 设置面板 ----------
      var objUrlCache = new Map()

      // ---------- 视频首帧缩略图（内存缓存，刷新后重新生成；并发受限，失败不重试） ----------
      var vidThumbCache = new Map()   // id -> objectURL
      var vidThumbQueue = []          // 待生成的记录
      var vidThumbFailed = new Set()  // 生成失败的 id
      var vidThumbRunning = 0
      var vidThumbNotify = null       // 当前面板挂载的重渲染回调（thumb 生成完成后调用）
      var VID_THUMB_MAX_RUNNING = 3
      function vidThumbUrlOf(u) {
        return u ? (vidThumbCache.get(u.id) || '') : ''
      }
      function ensureVideoThumbs(list, notify) {
        if (typeof notify === 'function') vidThumbNotify = notify
        ;(list || []).forEach(function (u) {
          if (!isVideoUpload(u) || vidThumbCache.has(u.id) || vidThumbFailed.has(u.id)) return
          if (vidThumbQueue.some(function (x) { return x.id === u.id })) return
          vidThumbQueue.push(u)
        })
        pumpVideoThumbs()
      }
      function pumpVideoThumbs() {
        while (vidThumbRunning < VID_THUMB_MAX_RUNNING && vidThumbQueue.length) {
          var u = vidThumbQueue.shift()
          vidThumbRunning++
          generateVideoThumb(u).finally(function () {
            vidThumbRunning--
            pumpVideoThumbs()
          })
        }
      }
      function generateVideoThumb(u) {
        return new Promise(function (resolve) {
          var url = URL.createObjectURL(u.blob)
          var video = document.createElement('video')
          video.muted = true
          video.setAttribute('playsinline', '')
          video.setAttribute('preload', 'auto')
          var done = function () {
            try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
            try { video.removeAttribute('src'); video.load() } catch (e) { /* 忽略 */ }
            resolve()
          }
          video.onloadeddata = function () {
            try {
              var w = video.videoWidth
              var h = video.videoHeight
              if (!w || !h) { done(); return }
              var scale = Math.min(1, 320 / Math.max(w, h))
              var c = document.createElement('canvas')
              c.width = Math.max(1, Math.round(w * scale))
              c.height = Math.max(1, Math.round(h * scale))
              c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
              c.toBlob(function (blob) {
                if (blob && blob.size > 0) {
                  vidThumbCache.set(u.id, URL.createObjectURL(blob))
                  if (vidThumbNotify) vidThumbNotify() // 生成完成 → 重渲染网格 / 队列
                }
                done()
              }, 'image/jpeg', 0.8)
            } catch (e) {
              vidThumbFailed.add(u.id)
              done()
            }
          }
          video.onerror = function () { vidThumbFailed.add(u.id); done() }
          video.src = url
        })
      }

      function WallpaperPanel(props) {
        var snapState = React.useState(state)
        var snap = snapState[0]
        var setSnap = snapState[1]
        var uploadsState = React.useState([])
        var uploads = uploadsState[0]
        var setUploads = uploadsState[1]
        var uploadsVersionState = React.useState(0)
        var uploadsVersion = uploadsVersionState[0]
        var setUploadsVersion = uploadsVersionState[1]
        var weListState = React.useState(null)
        var weList = weListState[0]
        var setWeList = weListState[1]
        var weErrorState = React.useState(null)
        var weError = weErrorState[0]
        var setWeError = weErrorState[1]
        var weLoadingState = React.useState(false)
        var weLoading = weLoadingState[0]
        var setWeLoading = weLoadingState[1]
        var weBaseDraftState = React.useState(state.weBase)
        var weBaseDraft = weBaseDraftState[0]
        var setWeBaseDraft = weBaseDraftState[1]
        var weTypeFilterState = React.useState('all')
        var weTypeFilter = weTypeFilterState[0]
        var setWeTypeFilter = weTypeFilterState[1]
        var weRatingFilterState = React.useState(state.source === 'we' ? 'safe' : 'all')
        var weRatingFilter = weRatingFilterState[0]
        var setWeRatingFilter = weRatingFilterState[1]
        var queueOverState = React.useState(false)
        var queueOver = queueOverState[0]
        var setQueueOver = queueOverState[1]
        var reorderFromState = React.useState(null)   // 正在拖拽排序的队列项下标（null = 非排序拖拽）
        var reorderFrom = reorderFromState[0]
        var setReorderFrom = reorderFromState[1]
        var reorderTargetState = React.useState(null) // 当前插入间隙下标（0..len，显示指示条）
        var reorderTarget = reorderTargetState[0]
        var setReorderTarget = reorderTargetState[1]
        // 面板当前查看的来源页签（与 state.source 解耦：切页签只换视图，不换背景）
        var panelSourceState = React.useState(state.source)
        var panelSource = panelSourceState[0]
        var setPanelSource = panelSourceState[1]

        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])

        React.useEffect(function () {
          if (panelSource !== 'custom') return
          var alive = true
          idbList().then(function (rows) {
            if (!alive) return
            setUploads(rows)
            // 异步生成视频首帧缩略图，生成完成回调触发重渲染
            ensureVideoThumbs(rows, function () { setUploadsVersion(function (v) { return v + 1 }) })
          }).catch(function () { if (alive) setUploads([]) })
          return function () { alive = false }
        }, [panelSource, uploadsVersion])

        React.useEffect(function () {
          if (panelSource !== 'we') return
          var alive = true
          loadWe(snap.weBase, false).catch(function () {})
          return function () { alive = false }
        }, [panelSource, snap.weBase])

        async function loadWe(base, force) {
          setWeLoading(true)
          setWeError(null)
          try {
            var res = await weApiCall({ endpoint: 'wallpapers', base: base, refresh: force === true })
            if (!res || !res.ok) {
              setWeError(String((res && res.error) || 'Wallpaper Engine API 不可达'))
              return
            }
            var list = res.wallpapers || []
            weCache.list = list
            setWeList(list)
          } catch (error) {
            setWeError(String((error && error.message) || error))
          } finally {
            setWeLoading(false)
          }
        }

        function selectWallpaper(source, id) {
          // 点击某张壁纸才应用背景：同步面板页签、退出两个队列的循环（队列只影响对应来源）
          setPanelSource(source)
          setState({ source: source, wallpaperId: id, syncDesktop: false, queueEnabled: false, weQueueEnabled: false })
        }

        // ---------- WE 筛选（类型 + 分级） ----------
        function weTypeOf(item) {
          var k = item.kind
          if (k === 'video' || k === 'scene' || k === 'image' || k === 'web') return k
          return 'other'
        }
        function weIsMature(item) {
          var r = String(item.rating || '').toLowerCase()
          return r === 'mature' || r === 'questionable'
        }
        function weMatchesFilters(item) {
          if (weTypeFilter !== 'all' && weTypeOf(item) !== weTypeFilter) return false
          if (weRatingFilter === 'mature' && !weIsMature(item)) return false
          if (weRatingFilter === 'safe' && weIsMature(item)) return false
          return true
        }
        function weChip(active, label, onClick, title) {
          return React.createElement('button', {
            type: 'button',
            className: 'wbg-chip' + (active ? ' wbg-active' : ''),
            title: title || undefined,
            onClick: onClick,
          }, label)
        }

        function onFiles(event) {
          var input = event.target
          var files = input.files
          if (!files || !files.length) return
          Array.from(files).forEach(function (file) {
            var rec = {
              id: 'up-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
              name: file.name,
              mime: file.type || 'application/octet-stream',
              blob: file,
              createdAt: Date.now(),
            }
            idbPut(rec).then(function () { setUploadsVersion(function (v) { return v + 1 }) }).catch(function () {})
          })
          input.value = ''
        }

        function thumbOfUpload(u) {
          if (!u.mime || u.mime.indexOf('image/') !== 0) return ''
          var cached = objUrlCache.get(u.id)
          if (!cached) {
            cached = URL.createObjectURL(u.blob)
            objUrlCache.set(u.id, cached)
          }
          return cached
        }

        // 从队列中移除一个 id，返回要合并进 state 的补丁（含下标修正 / 清空时自动关闭循环）；kind: 'custom' | 'we'
        function queuePatchRemove(kind, q, id, idx) {
          var pos = q.indexOf(id)
          if (pos < 0) return null
          var listKey = kind === 'we' ? 'weQueue' : 'customQueue'
          var idxKey = kind === 'we' ? 'weQueueIndex' : 'queueIndex'
          var enKey = kind === 'we' ? 'weQueueEnabled' : 'queueEnabled'
          var newQ = q.slice(0, pos).concat(q.slice(pos + 1))
          var patch = {}
          patch[listKey] = newQ
          if (!newQ.length) {
            patch[idxKey] = 0
            patch[enKey] = false
          } else {
            if (pos < idx) idx -= 1
            patch[idxKey] = Math.min(Math.max(0, idx), newQ.length - 1)
          }
          return patch
        }

        function onDeleteUpload(id) {
          var url = objUrlCache.get(id)
          if (url) {
            try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
            objUrlCache.delete(id)
          }
          var vurl = vidThumbCache.get(id)
          if (vurl) {
            try { URL.revokeObjectURL(vurl) } catch (e) { /* 忽略 */ }
            vidThumbCache.delete(id)
          }
          vidThumbFailed.delete(id)
          var qi = vidThumbQueue.findIndex(function (x) { return x.id === id })
          if (qi >= 0) vidThumbQueue.splice(qi, 1)
          idbRemove(id).then(function () {
            setUploadsVersion(function (v) { return v + 1 })
            var patch = {}
            if (state.source === 'custom' && state.wallpaperId === id) patch.wallpaperId = null
            var q = state.customQueue || []
            if (q.indexOf(id) >= 0) {
              var qp = queuePatchRemove('custom', q, id, Number(state.queueIndex) || 0)
              if (qp) patch = Object.assign(patch, qp)
            }
            if (Object.keys(patch).length) setState(patch)
          }).catch(function () {})
        }

        function resetAll() {
          setWeBaseDraft(DEFAULTS.weBase)
          setPanelSource(DEFAULTS.source)
          setState(Object.assign({}, DEFAULTS))
        }

        function sourceButton(value, label) {
          return React.createElement('button', {
            type: 'button',
            className: 'wbg-seg-btn' + (panelSource === value ? ' wbg-active' : ''),
            // 只切换面板视图（网格/筛选），不切换背景；点某张壁纸时才真正应用
            onClick: function () {
              setPanelSource(value)
              // 每次进入「WE 壁纸库」页签，分级筛选默认回到「非18+」
              if (value === 'we') setWeRatingFilter('safe')
            },
          }, label)
        }

        function tile(cfg) {
          var children = [
            cfg.thumb
              ? React.createElement('img', { src: cfg.thumb, alt: cfg.title, draggable: 'false', loading: 'lazy' })
              : React.createElement('div', { className: 'wbg-tile-ph' }, cfg.title.slice(0, 1)),
            React.createElement('div', { className: 'wbg-tile-name' }, cfg.title),
          ]
          if (cfg.badge) children.push(React.createElement('span', { className: 'wbg-tile-badge' }, cfg.badge))
          if (cfg.badge2) children.push(React.createElement('span', { className: 'wbg-tile-badge2' }, cfg.badge2))
          if (cfg.onDelete) {
            children.push(React.createElement('button', {
              type: 'button',
              className: 'wbg-tile-del',
              title: '删除',
              onClick: function (e) { e.stopPropagation(); cfg.onDelete() },
            }, '×'))
          }
          var tileProps = {
            key: cfg.key,
            className: 'wbg-tile' + (cfg.selected ? ' wbg-selected' : ''),
            onClick: cfg.onSelect,
          }
          if (cfg.draggable) tileProps.draggable = true
          if (cfg.onDragStart) tileProps.onDragStart = cfg.onDragStart
          return React.createElement('div', tileProps, children)
        }

        function sliderRow(opts) {
          return React.createElement('div', { className: 'wbg-row' },
            React.createElement('label', null, opts.label),
            React.createElement('input', {
              type: 'range',
              min: opts.min,
              max: opts.max,
              step: 1,
              value: opts.value,
              onChange: function (e) { opts.onChange(Number(e.target.value)) },
            }),
            React.createElement('span', { className: 'wbg-val' }, opts.value + opts.unit),
          )
        }

        function builtinGrid() {
          return React.createElement('div', { className: 'wbg-grid' },
            BUILTIN_ITEMS.map(function (w) {
              return tile({
                key: w.id,
                title: w.title,
                thumb: w.thumbnail || w.url,
                selected: snap.wallpaperId === w.id,
                onSelect: function () { selectWallpaper('builtin', w.id) },
              })
            }),
          )
        }

        function customGrid() {
          var items = uploads.map(function (u) {
            return tile({
              key: u.id,
              title: u.name,
              thumb: thumbOfUpload(u) || vidThumbUrlOf(u),
              badge: isVideoUpload(u) ? '视频' : undefined,
              selected: snap.wallpaperId === u.id,
              onSelect: function () { selectWallpaper('custom', u.id) },
              onDelete: function () { onDeleteUpload(u.id) },
              draggable: true,
              onDragStart: function (e) {
                e.dataTransfer.setData('text/plain', u.id)
                e.dataTransfer.effectAllowed = 'copy'
              },
            })
          })
          if (!items.length) {
            return React.createElement('div', { className: 'wbg-hint' }, '还没有自定义壁纸，点击上方「上传自定义壁纸」添加图片或视频。')
          }
          return React.createElement('div', { className: 'wbg-grid' }, items)
        }

        // ---------- 播放队列（自定义上传 / WE 壁纸库，kind: 'custom' | 'we'） ----------
        function queueList(kind) {
          return kind === 'we' ? (snap.weQueue || []) : (snap.customQueue || [])
        }
        function queueIndex(kind) {
          return kind === 'we' ? (Number(snap.weQueueIndex) || 0) : (Number(snap.queueIndex) || 0)
        }
        function queueEnabled(kind) {
          return kind === 'we' ? !!snap.weQueueEnabled : !!snap.queueEnabled
        }
        /** 当前面板页签对应的队列 kind（队列区块只在它自己的页签里渲染） */
        function activeQueueKind() {
          return panelSource === 'we' ? 'we' : 'custom'
        }
        function onQueueRemove(kind, id) {
          var p = queuePatchRemove(kind, queueList(kind), id, queueIndex(kind))
          if (p) setState(Object.assign({ source: kind }, p))
        }
        /** 根据鼠标落点算出插入间隙下标（0..len）；落在队列项左半 → 该项前，右半 → 该项后，空白 → 末尾 */
        function queueGapFromEvent(e, len) {
          var el = e.target && e.target.closest ? e.target.closest('.wbg-qitem') : null
          if (el && el.dataset) {
            var idx = Number(el.dataset.idx)
            if (!isNaN(idx) && idx >= 0 && idx < len) {
              var rect = el.getBoundingClientRect()
              return e.clientX < rect.left + rect.width / 2 ? idx : idx + 1
            }
          }
          return len
        }
        /** 提交排序：把 from 下标项移到 to 间隙，并保持当前播放项不跳变 */
        function commitReorder(kind, from, to) {
          var q = queueList(kind)
          if (from < 0 || from >= q.length) return
          var idxKey = kind === 'we' ? 'weQueueIndex' : 'queueIndex'
          var listKey = kind === 'we' ? 'weQueue' : 'customQueue'
          var curIdx = Math.min(Math.max(0, queueIndex(kind)), q.length - 1)
          var arr = q.slice()
          var moved = arr.splice(from, 1)[0]
          if (to > from) to -= 1
          to = Math.min(Math.max(0, to), arr.length)
          arr.splice(to, 0, moved)
          var patch = {}
          patch[listKey] = arr
          // 修正当前播放下标：当前播放的那一张尽量保持不动
          if (curIdx === from) patch[idxKey] = to
          else if (from > curIdx) patch[idxKey] = to <= curIdx ? curIdx + 1 : curIdx
          else patch[idxKey] = to <= curIdx - 1 ? curIdx : curIdx - 1
          patch[idxKey] = Math.min(Math.max(0, patch[idxKey]), arr.length - 1)
          setState(patch)
          setReorderFrom(null)
          setReorderTarget(null)
        }
        function onQueueItemDragStart(e, i) {
          e.stopPropagation()
          var kind = activeQueueKind()
          e.dataTransfer.setData('text/plain', queueList(kind)[i] || '')
          e.dataTransfer.setData('application/x-wbg-reorder', String(i))
          e.dataTransfer.effectAllowed = 'move'
          setReorderFrom(i)
          setReorderTarget(null)
        }
        function onQueueDragOver(e) {
          e.preventDefault()
          var kind = activeQueueKind()
          var reorder = reorderFrom !== null
          e.dataTransfer.dropEffect = reorder ? 'move' : 'copy'
          if (reorder) setReorderTarget(queueGapFromEvent(e, queueList(kind).length))
          if (!queueOver) setQueueOver(true)
        }
        function onQueueDragLeave(e) {
          if (!e.currentTarget.contains(e.relatedTarget)) setQueueOver(false)
        }
        function onQueueDragEnd() {
          setReorderFrom(null)
          setReorderTarget(null)
        }
        function onQueueDrop(e) {
          e.preventDefault()
          setQueueOver(false)
          var kind = activeQueueKind()
          var q = queueList(kind)
          if (reorderFrom !== null) { // 队列内排序
            commitReorder(kind, reorderFrom, queueGapFromEvent(e, q.length))
            return
          }
          var id = e.dataTransfer.getData('text/plain') // 从上方网格拖入
          if (!id) return
          if (q.indexOf(id) >= 0) return // 已在队列中，不重复添加
          var patch = { source: kind }
          if (kind === 'custom') {
            var up = uploads.find(function (u) { return u.id === id })
            if (!up) return
            patch.customQueue = q.concat([id])
          } else {
            patch.weQueue = q.concat([id])
            patch.syncDesktop = false // 队列优先于桌面同步
          }
          setState(patch) // 往队列里放壁纸是显式操作：来源切到该队列才会真正应用
        }

        function queueSection(kind) {
          var isWe = kind === 'we'
          var q = queueList(kind)
          var qIdx = q.length ? Math.min(Math.max(0, queueIndex(kind)), q.length - 1) : -1
          var listKey = isWe ? 'weQueue' : 'customQueue'
          var idxKey = isWe ? 'weQueueIndex' : 'queueIndex'
          var enKey = isWe ? 'weQueueEnabled' : 'queueEnabled'
          var stripChildren = []
          q.forEach(function (id, i) {
            if (reorderFrom !== null && reorderTarget === i) {
              stripChildren.push(React.createElement('div', { key: 'gap-' + i, className: 'wbg-q-gap' }))
            }
            var up = isWe
              ? (weList || []).find(function (x) { return String(x.id) === id })
              : uploads.find(function (u) { return u.id === id })
            var thumb = isWe ? assetUrlOf(up && up.thumbnail) : (up ? (thumbOfUpload(up) || vidThumbUrlOf(up)) : '')
            var isVid = isWe
              ? !!(up && up.kind === 'video')
              : !!isVideoUpload(up)
            var title = up ? (up.title || up.name || id) : '（已删除的壁纸）'
            stripChildren.push(React.createElement('div', {
              key: id,
              className: 'wbg-qitem' + (queueEnabled(kind) && i === qIdx ? ' wbg-q-cur' : ''),
              title: title,
              'data-idx': String(i),
              draggable: true,
              onClick: function () {
                var patch = {}
                patch.source = isWe ? 'we' : 'custom'
                if (isWe) patch.syncDesktop = false // 队列优先于桌面同步
                patch[idxKey] = i
                patch[enKey] = true
                setState(patch)
              },
              onDragStart: function (e) { onQueueItemDragStart(e, i) },
            },
              thumb
                ? React.createElement('img', { src: thumb, alt: title, draggable: 'false' })
                : React.createElement('div', { className: 'wbg-tile-ph' }, isVid ? '▶' : '?'),
              React.createElement('span', { className: 'wbg-qitem-idx' }, String(i + 1)),
              React.createElement('button', {
                type: 'button',
                className: 'wbg-qitem-del',
                title: '移出队列',
                onClick: function (e) { e.stopPropagation(); onQueueRemove(kind, id) },
              }, '×'),
            ))
          })
          if (reorderFrom !== null && reorderTarget === q.length) {
            stripChildren.push(React.createElement('div', { key: 'gap-end', className: 'wbg-q-gap' }))
          }
          return React.createElement('div', {
            className: 'wbg-queue wbg-q-sticky' + (queueOver ? ' wbg-q-over' : ''),
            onDragOver: onQueueDragOver,
            onDragLeave: onQueueDragLeave,
            onDragEnd: onQueueDragEnd,
            onDrop: onQueueDrop,
          },
            React.createElement('div', { className: 'wbg-queue-head' },
              React.createElement('span', { className: 'wbg-queue-title' }, '播放队列'),
              React.createElement('label', { className: 'wbg-switch' },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: !!queueEnabled(kind),
                  disabled: !q.length,
                  onChange: function (e) {
                    var patch = {}
                    patch.source = isWe ? 'we' : 'custom'
                    if (isWe) patch.syncDesktop = false // 队列优先于桌面同步
                    patch[enKey] = e.target.checked
                    setState(patch)
                  },
                }),
                '循环播放',
              ),
              React.createElement('button', {
                type: 'button',
                className: 'wbg-btn',
                disabled: !q.length,
                onClick: function () {
                  var patch = {}
                  patch.source = isWe ? 'we' : 'custom'
                  if (isWe) patch.syncDesktop = false // 队列优先于桌面同步
                  patch[listKey] = []
                  patch[idxKey] = 0
                  patch[enKey] = false
                  setState(patch)
                },
              }, '清空'),
            ),
            q.length
              ? React.createElement('div', { className: 'wbg-queue-strip' }, stripChildren)
              : React.createElement('div', { className: 'wbg-hint' }, isWe
                  ? '把下方 WE 壁纸库里的壁纸拖到这里，加入循环播放队列（视频 / 场景 / 网页 / 图片均可）；队列会一直停在顶部，随时可拖入。'
                  : '把下方已上传的图片 / 视频壁纸拖到这里，加入循环播放队列；队列会一直停在顶部，随时可拖入。'),
            sliderRow({ label: '每张时长', value: snap.queueDurationMin, min: 1, max: 10, unit: ' 分钟', onChange: function (n) { setState({ queueDurationMin: n }) } }),
            React.createElement('div', { className: 'wbg-hint' }, '开启「循环播放」后按顺序循环切换，每张停留上方设定时长（1–10 分钟）；拖拽队列项可调整播放顺序。'),
          )
        }

        function weGrid() {
          var list = weList
          if (weLoading && !list) return React.createElement('div', { className: 'wbg-hint' }, '正在从 Wallpaper Engine 读取壁纸库…')
          if (weError && !list) {
            return React.createElement('div', { className: 'wbg-error' },
              weError + '。请确认 WE 本地 API 正在运行（默认 http://127.0.0.1:8088），或修改基地址后点击「刷新」。')
          }
          if (!list || !list.length) return React.createElement('div', { className: 'wbg-hint' }, '壁纸库为空。')
          var shown = list.filter(weMatchesFilters)
          if (!shown.length) {
            return React.createElement('div', { className: 'wbg-hint' }, '当前筛选条件下没有壁纸，试试切换上方「类型 / 分级」筛选按钮。')
          }
          return React.createElement('div', { className: 'wbg-grid' },
            shown.map(function (item) {
              return tile({
                key: String(item.id),
                title: item.title,
                thumb: assetUrlOf(item.thumbnail),
                badge: item.kind === 'video' ? '视频' : item.kind === 'scene' ? '场景' : item.kind === 'image' ? '图片' : item.kind === 'web' ? '网页' : undefined,
                badge2: weIsMature(item) ? '18+' : undefined,
                selected: !snap.syncDesktop && !snap.weQueueEnabled && String(snap.wallpaperId) === String(item.id),
                onSelect: function () { selectWallpaper('we', String(item.id)) },
                draggable: true,
                onDragStart: function (e) {
                  e.dataTransfer.setData('text/plain', String(item.id))
                  e.dataTransfer.effectAllowed = 'copy'
                },
              })
            }),
          )
        }

        return React.createElement('div', { className: 'wbg-panel' },
          React.createElement('div', { className: 'wbg-seg' },
            sourceButton('builtin', '内置壁纸'),
            sourceButton('custom', '自定义上传'),
            sourceButton('we', 'WE 壁纸库'),
          ),

          panelSource === 'custom'
            ? React.createElement('div', { className: 'wbg-actions' },
                React.createElement('label', { className: 'wbg-btn wbg-upload' },
                  '上传自定义壁纸',
                  React.createElement('input', {
                    type: 'file',
                    accept: 'image/*,video/*',
                    multiple: true,
                    style: { display: 'none' },
                    onChange: onFiles,
                  }),
                ),
                React.createElement('span', { className: 'wbg-hint' }, '图片 / 视频存入 IndexedDB，刷新后保留'),
              )
            : null,

          panelSource === 'we'
            ? React.createElement('div', { className: 'wbg-actions' },
                React.createElement('input', {
                  className: 'wbg-input',
                  value: weBaseDraft,
                  placeholder: 'http://127.0.0.1:8088',
                  onChange: function (e) { setWeBaseDraft(e.target.value) },
                }),
                React.createElement('button', {
                  type: 'button',
                  className: 'wbg-btn',
                  onClick: function () { setState({ weBase: weBaseDraft || DEFAULTS.weBase }) },
                }, '应用地址'),
                React.createElement('button', {
                  type: 'button',
                  className: 'wbg-btn',
                  disabled: weLoading,
                  onClick: function () { loadWe(weBaseDraft || snap.weBase, true) },
                }, weLoading ? '刷新中…' : '刷新'),
                React.createElement('label', { className: 'wbg-switch' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: snap.syncDesktop,
                    // 开启同步属于「WE 壁纸库」的显式操作：来源切到 we、退出 WE 队列才会生效
                    onChange: function (e) { setState({ source: 'we', syncDesktop: e.target.checked, weQueueEnabled: false }) },
                  }),
                  '同步桌面壁纸',
                ),
                React.createElement('span', { className: 'wbg-hint' }, '只读获取 WE 当前壁纸，不修改桌面；网页类壁纸在浏览器原生渲染（仅视觉效果）'),
              )
            : null,

          panelSource === 'we'
            ? React.createElement('div', { className: 'wbg-filters' },
                React.createElement('div', { className: 'wbg-filter-row' },
                  React.createElement('span', { className: 'wbg-filter-label' }, '类型'),
                  weChip(weTypeFilter === 'all', '全部', function () { setWeTypeFilter('all') }),
                  weChip(weTypeFilter === 'video', '视频', function () { setWeTypeFilter('video') }),
                  weChip(weTypeFilter === 'scene', '场景', function () { setWeTypeFilter('scene') }),
                  weChip(weTypeFilter === 'web', '网页', function () { setWeTypeFilter('web') }),
                ),
                React.createElement('div', { className: 'wbg-filter-row' },
                  React.createElement('span', { className: 'wbg-filter-label' }, '分级'),
                  weChip(weRatingFilter === 'all', '全部', function () { setWeRatingFilter('all') }),
                  weChip(weRatingFilter === 'safe', '非18+', function () { setWeRatingFilter('safe') }, 'Everyone / 未标注分级'),
                  weChip(weRatingFilter === 'mature', '18+', function () { setWeRatingFilter('mature') }, 'Mature / Questionable'),
                  (function () {
                    var total = (weList || []).length
                    if (!total) return null
                    var count = (weList || []).filter(weMatchesFilters).length
                    return React.createElement('span', { className: 'wbg-filter-count' }, '共 ' + total + ' · 筛选出 ' + count)
                  })(),
                ),
              )
            : null,

          panelSource === 'builtin' ? builtinGrid() : null,
          panelSource === 'custom'
            ? React.createElement(React.Fragment, null, queueSection('custom'), customGrid())
            : null,
          panelSource === 'we'
            ? React.createElement(React.Fragment, null, queueSection('we'), weGrid())
            : null,

          sliderRow({ label: '浅色雾层', value: snap.lightFog, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ lightFog: n }) } }),
          sliderRow({ label: '深色遮罩', value: snap.overlayOpacity, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ overlayOpacity: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '浅色外观铺白色雾层、深色外观压深色遮罩，随主题自动切换；雾层位于背景与内容之间，提升细字可读性。'),
          sliderRow({ label: '背景模糊度', value: snap.blur, min: 0, max: 20, unit: 'px', onChange: function (n) { setState({ blur: n }) } }),
          sliderRow({ label: '背景亮度', value: snap.brightness, min: 50, max: 150, unit: '%', onChange: function (n) { setState({ brightness: n }) } }),
          sliderRow({ label: '安全放大', value: snap.safeZoom, min: 0, max: 10, unit: '%', onChange: function (n) { setState({ safeZoom: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '安全放大：在画面四周裁掉 1–10% 边缘，用于去除视频/图片自带的黑边。'),

          React.createElement('div', { className: 'wbg-actions' },
            React.createElement('button', { type: 'button', className: 'wbg-btn', onClick: resetAll }, '恢复默认'),
            React.createElement('span', { className: 'wbg-hint' }, '背景层独立于桌面 Wallpaper Engine，切换不会影响桌面壁纸'),
          ),
        )
      }

      // ---------- 注册设置选项卡 ----------
      slots.inject('settings.section', function () {
        return slots.register(
          { name: 'settings.section', id: 'wallpaper', order: 30, label: '壁纸' },
          function (props) {
            return React.createElement(WallpaperPanel, {
              close: props && props.close ? props.close : undefined,
            })
          },
        )
      })

      // ---------- 清理与启动 ----------
      ctx.effect(function () {
        return function () {
          window.clearInterval(syncIv)
          clearQueueTimer()
          if (themeObserver) themeObserver.disconnect()
          disposeLayer()
          if (styleTag && styleTag.parentNode) styleTag.remove()
        }
      })
      applyNow().catch(function () { /* 保持默认 */ })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
