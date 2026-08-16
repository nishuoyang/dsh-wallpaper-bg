/**
 * dsh-wallpaper-bg v0.2.1 — 浏览器半（单文件 client bundle）
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
      blur: 0,
      brightness: 100,
      safeZoom: 0,
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
      '.wbg-error{font-size:12px;color:var(--dsw-alias-state-error-primary);}'

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
      var VIDEO_FRAME_MS = 33 // 30 FPS 上限

      var bgEl = document.createElement('div')
      bgEl.id = 'dsh-wallpaper-bg'
      var overlayEl = document.createElement('div')
      overlayEl.id = 'dsh-wallpaper-overlay'
      document.body.appendChild(bgEl)
      document.body.appendChild(overlayEl)

      var activeKind = 'none'
      var activeDispose = null
      var lastObjectUrl = null

      function clearActive() {
        if (activeDispose) {
          try { activeDispose() } catch (e) { /* 忽略 */ }
          activeDispose = null
        }
        activeKind = 'none'
        bgEl.replaceChildren()
        bgEl.style.backgroundImage = ''
        if (lastObjectUrl) {
          try { URL.revokeObjectURL(lastObjectUrl) } catch (e) { /* 忽略 */ }
          lastObjectUrl = null
        }
      }

      function applyImage(url) {
        clearActive()
        if (!url) return
        activeKind = 'image'
        bgEl.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")'
      }

      function applyVideo(url) {
        clearActive()
        if (!url) return
        activeKind = 'video'
        var video = document.createElement('video')
        video.muted = true
        video.autoplay = true
        video.loop = true
        video.setAttribute('playsinline', '')
        video.setAttribute('preload', 'auto')
        video.src = url
        var canvas = document.createElement('canvas')
        Object.assign(canvas.style, {
          position: 'absolute', top: '0', left: '0',
          width: '100%', height: '100%', display: 'block',
        })
        bgEl.appendChild(canvas)
        var cx = canvas.getContext('2d')
        var stopIv = null
        var drawing = false
        var draw = function () {
          if (!cx || drawing || !video.videoWidth || !video.videoHeight) return
          drawing = true
          try {
            var dpr = window.devicePixelRatio || 1
            var bw = Math.max(1, Math.round(window.innerWidth * dpr))
            var bh = Math.max(1, Math.round(window.innerHeight * dpr))
            if (canvas.width !== bw) canvas.width = bw
            if (canvas.height !== bh) canvas.height = bh
            // cover 裁剪：画布位图与视口像素一一对应 —— 无黑边、无变形
            var vw = video.videoWidth
            var vh = video.videoHeight
            var scale = Math.max(bw / vw, bh / vh)
            var sw = bw / scale
            var sh = bh / scale
            var sx = (vw - sw) / 2
            var sy = (vh - sh) / 2
            cx.drawImage(video, sx, sy, sw, sh, 0, 0, bw, bh)
          } finally {
            drawing = false
          }
        }
        var onReady = function () {
          if (activeKind !== 'video') return
          if (stopIv) window.clearInterval(stopIv)
          stopIv = window.setInterval(draw, VIDEO_FRAME_MS)
          video.play().catch(function () { /* muted 自动播放通常可放行 */ })
        }
        var onResize = function () { if (activeKind === 'video') draw() }
        video.addEventListener('loadeddata', onReady)
        window.addEventListener('resize', onResize)
        activeDispose = function () {
          if (stopIv) {
            window.clearInterval(stopIv)
            stopIv = null
          }
          video.removeEventListener('loadeddata', onReady)
          window.removeEventListener('resize', onResize)
          try { video.pause() } catch (e) { /* 忽略 */ }
          try { video.removeAttribute('src'); video.load() } catch (e) { /* 忽略 */ }
        }
      }

      function applyScene(item) {
        clearActive()
        var previewUrl = item && item.previewUrl
        if (previewUrl) {
          activeKind = 'scene'
          var iframe = document.createElement('iframe')
          iframe.setAttribute('src', previewUrl)
          iframe.setAttribute('scrolling', 'no')
          iframe.setAttribute('title', 'Wallpaper Engine 场景预览')
          Object.assign(iframe.style, {
            position: 'absolute', top: '0', left: '0',
            width: '100%', height: '100%', border: '0',
          })
          bgEl.appendChild(iframe)
          // 场景帧率由预览页自控（宿主无法限帧）；背景层 pointer-events:none 不拦截交互
          activeDispose = function () {
            try { iframe.setAttribute('src', 'about:blank') } catch (e) { /* 忽略 */ }
          }
          return
        }
        // 无预览地址：回退为缩略图静态展示（GIF 预览会保持动画）
        var thumb = item && item.thumbnail
        if (thumb) {
          applyImage(assetUrlOf(thumb))
          activeKind = 'scene-static'
        }
      }

      function setOverlay(v) {
        var o = Math.min(100, Math.max(0, Number(v) || 0))
        overlayEl.style.background = 'rgba(0,0,0,' + o / 100 + ')'
      }
      function setFilter(blurPx, brightnessPct) {
        var blur = Math.min(20, Math.max(0, Number(blurPx) || 0))
        var brightness = Math.min(150, Math.max(50, Number(brightnessPct) || 100))
        bgEl.style.filter = 'blur(' + blur + 'px) brightness(' + brightness + '%)'
      }
      function setZoom(v) {
        var z = Math.min(10, Math.max(0, Number(v) || 0))
        bgEl.style.transform = z > 0 ? 'scale(' + (1 + z / 100) + ')' : ''
      }
      function disposeLayer() {
        clearActive()
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

      // ---------- 背景应用（解析来源 → 驱动渲染层） ----------
      var weCache = { list: null }
      var applyToken = 0
      async function applyNow() {
        var token = ++applyToken
        setOverlay(state.overlayOpacity)
        setFilter(state.blur, state.brightness)
        setZoom(state.safeZoom)
        if (state.source === 'builtin') {
          var w = BUILTIN_ITEMS.find(function (x) { return x.id === state.wallpaperId }) || FALLBACK_ITEM
          if (token === applyToken) applyImage(w.url)
          return
        }
        if (state.source === 'custom') {
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
          if (rec.mime && rec.mime.indexOf('video/') === 0) {
            applyVideo(objUrl)
            lastObjectUrl = objUrl
          } else {
            applyImage(objUrl)
            lastObjectUrl = objUrl
          }
          return
        }
        // WE 壁纸库
        var item = null
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
        if (!item) {
          applyImage(FALLBACK_ITEM.url)
          return
        }
        if (item.kind === 'video') {
          var u = assetUrlOf(item.filepath)
          if (u) applyVideo(u)
          else applyImage(assetUrlOf(item.thumbnail))
          return
        }
        if (item.kind === 'scene') {
          applyScene({ previewUrl: item.previewUrl, thumbnail: item.thumbnail })
          return
        }
        var u2 = assetUrlOf(item.filepath || item.thumbnail)
        if (u2) applyImage(u2)
        else applyImage(FALLBACK_ITEM.url)
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
        var weRatingFilterState = React.useState('all')
        var weRatingFilter = weRatingFilterState[0]
        var setWeRatingFilter = weRatingFilterState[1]

        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])

        React.useEffect(function () {
          if (snap.source !== 'custom') return
          var alive = true
          idbList().then(function (rows) { if (alive) setUploads(rows) }).catch(function () { if (alive) setUploads([]) })
          return function () { alive = false }
        }, [snap.source, uploadsVersion])

        React.useEffect(function () {
          if (snap.source !== 'we') return
          var alive = true
          loadWe(snap.weBase, false).catch(function () {})
          return function () { alive = false }
        }, [snap.source, snap.weBase])

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
          setState({ source: source, wallpaperId: id, syncDesktop: false })
        }

        // ---------- WE 筛选（类型 + 分级） ----------
        function weTypeOf(item) {
          var k = item.kind
          if (k === 'video' || k === 'scene' || k === 'image') return k
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

        function onDeleteUpload(id) {
          var url = objUrlCache.get(id)
          if (url) {
            try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
            objUrlCache.delete(id)
          }
          idbRemove(id).then(function () {
            setUploadsVersion(function (v) { return v + 1 })
            if (state.source === 'custom' && state.wallpaperId === id) setState({ wallpaperId: null })
          }).catch(function () {})
        }

        function resetAll() {
          setWeBaseDraft(DEFAULTS.weBase)
          setState(Object.assign({}, DEFAULTS))
        }

        function sourceButton(value, label) {
          return React.createElement('button', {
            type: 'button',
            className: 'wbg-seg-btn' + (snap.source === value ? ' wbg-active' : ''),
            onClick: function () { setState({ source: value }) },
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
          return React.createElement('div', {
            key: cfg.key,
            className: 'wbg-tile' + (cfg.selected ? ' wbg-selected' : ''),
            onClick: cfg.onSelect,
          }, children)
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
              thumb: thumbOfUpload(u),
              badge: u.mime && u.mime.indexOf('video/') === 0 ? '视频' : undefined,
              selected: snap.wallpaperId === u.id,
              onSelect: function () { selectWallpaper('custom', u.id) },
              onDelete: function () { onDeleteUpload(u.id) },
            })
          })
          if (!items.length) {
            return React.createElement('div', { className: 'wbg-hint' }, '还没有自定义壁纸，点击上方「上传自定义壁纸」添加图片或视频。')
          }
          return React.createElement('div', { className: 'wbg-grid' }, items)
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
                badge: item.kind === 'video' ? '视频' : item.kind === 'scene' ? '场景' : item.kind === 'image' ? '图片' : undefined,
                badge2: weIsMature(item) ? '18+' : undefined,
                selected: !snap.syncDesktop && String(snap.wallpaperId) === String(item.id),
                onSelect: function () { selectWallpaper('we', String(item.id)) },
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

          snap.source === 'custom'
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

          snap.source === 'we'
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
                    onChange: function (e) { setState({ syncDesktop: e.target.checked }) },
                  }),
                  '同步桌面壁纸',
                ),
                React.createElement('span', { className: 'wbg-hint' }, '只读获取 WE 当前壁纸，不修改桌面'),
              )
            : null,

          snap.source === 'we'
            ? React.createElement('div', { className: 'wbg-filters' },
                React.createElement('div', { className: 'wbg-filter-row' },
                  React.createElement('span', { className: 'wbg-filter-label' }, '类型'),
                  weChip(weTypeFilter === 'all', '全部', function () { setWeTypeFilter('all') }),
                  weChip(weTypeFilter === 'video', '视频', function () { setWeTypeFilter('video') }),
                  weChip(weTypeFilter === 'scene', '场景', function () { setWeTypeFilter('scene') }),
                  weChip(weTypeFilter === 'image', '图片', function () { setWeTypeFilter('image') }),
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

          snap.source === 'builtin' ? builtinGrid() : null,
          snap.source === 'custom' ? customGrid() : null,
          snap.source === 'we' ? weGrid() : null,

          sliderRow({ label: '遮罩透明度', value: snap.overlayOpacity, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ overlayOpacity: n }) } }),
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
