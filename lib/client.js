/**
 * dsh-wallpaper-bg v0.5.17 — 浏览器半（单文件 client bundle）
 * ==========================================================
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
      // 界面配色：'azureRose' = 蔚蓝 + 玫粉（本分支默认），'classic' = 跟随 DSH 原生黑/白主色
      palette: 'azureRose',
      source: 'builtin',
      wallpaperId: 'builtin-1',
      weBase: 'http://127.0.0.1:8088',
      syncDesktop: false,
      // 跟随哪台显示器：'auto' = 由 WE API 服务自动判定（多屏别盲取 Monitor0）；'MonitorN' = 显式指定
      syncMonitor: 'auto',
      overlayOpacity: 40,
      lightFog: 55,
      // 原生背景：临时清掉雾层 / 遮罩与页面表面覆盖，完整露出壁纸（输入框与弹窗仍保留可读底色）
      nativeBackground: false,
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
    var BUILTIN_THUMB_BASE = '/dsh-wallpaper-bg/builtin/'
    function builtinAssetFile(index, prefix) {
      var n = index + 1
      return BUILTIN_THUMB_BASE + prefix + '-' + (n < 10 ? '0' + n : String(n)) + '.webp'
    }
    function builtinThumbFile(index) { return builtinAssetFile(index, 'thumb') }
    function builtinFullFile(index) { return builtinAssetFile(index, 'full') }
    var BUILTIN_ITEMS = BUILTIN.map(function (w, index) {
      return {
        id: w.id,
        title: w.title,
        kind: 'image',
        // 完整 1920w 背景也随包内置；Unsplash 只在本地文件缺失时回退
        url: builtinFullFile(index),
        remoteUrl: unsplashUrl(w.photo, 1920, 80),
        // 网格缩略图走包内 WebP（宿主半同源静态路由），远程 URL 只作加载失败时的回退
        thumbnail: builtinThumbFile(index),
        remoteThumbnail: unsplashUrl(w.photo, 400, 60),
      }
    })
    var FALLBACK_ITEM = BUILTIN_ITEMS[0]

    // ---------- 蓝粉配色（azure × rose） ----------
    // 只覆盖 DSH 的 alias 层令牌：深浅外观切换、桌面端标题栏采样（preload 读
    // --dsw-specific-sidebar-fill）和网页端都走同一套 CSS 变量，因此两端天然一致。
    // 不碰 bg-layer-3/4（0.2.1 里它们被当作前景文字色 / hover 底色）与错误、成功、
    // 警告等语义色；文字色只做色相偏移，对比度不低于 DSH 原值。
    var AZURE_ROSE = {
      light: {
        // 主色 / 按钮 / 交互
        '--dsw-alias-brand-primary': '#3b5bdb',
        '--dsw-alias-brand-primary-new-colorprimary-new-color': '#3d6bff',
        '--dsw-alias-brand-text': '#2b4ac7',
        '--dsw-alias-button-primary-fill': '#3b5bdb',
        '--dsw-alias-button-primary-hover': '#3049b8',
        '--dsw-alias-button-primary-dimmed': '#e3e9ff',
        '--dsw-alias-button-info-fill': '#3d6bff',
        '--dsw-alias-button-info-hover': '#2f5ae6',
        '--dsw-alias-state-business-primary': '#2f5ce0',
        '--dsw-alias-link': '#c2255c',
        '--dsw-alias-interactive-bg-hover': '#3457d50f',
        '--dsw-alias-interactive-bg-active': '#3457d51f',
        '--dsw-alias-interactive-bg-hover-accent': '#3d6bff1a',
        // 表面（bg-layer-1/2 与侧栏在 applySurfaceMode 里按壁纸模式单独铺）
        '--dsw-alias-bg-document-preview': '#f2f6fd',
        '--dsw-alias-label-document-preview': '#3a4560',
        '--dsw-alias-bg-module-platform': '#f1f6fe',
        '--dsw-alias-bg-multi-select': '#f3f6ff',
        '--dsw-alias-bg-overlay': '#e8eefa',
        '--dsw-alias-bg-skeleton': '#3457d512',
        '--dsw-specific-bubble': '#fceff6',
        '--dsw-specific-bubble-highlight': '#f9dceb',
        '--dsw-specific-input-major': '#ffffff',
        '--dsw-specific-menu': '#f6f9ff94',
        '--dsw-specific-selector': '#f2f6ff',
        '--dsw-specific-sidebar-nav-item-active-accent': '#ffe1ee',
        '--dsw-specific-tip': '#f1f6ff',
        '--dsw-alias-menu-group-header-fill': '#f4f8fff0',
        '--dsw-alias-markdown-citation': '#fce7f1',
        // 文字 / 图标 / 边框 / 滚动条
        '--dsw-alias-label-primary': '#18213a',
        '--dsw-alias-label-primary-bluish': '#16336e',
        '--dsw-alias-label-primary-dimmed': '#0c1428',
        '--dsw-alias-label-secondary': '#4c5872',
        '--dsw-alias-label-tertiary': '#6a7690',
        '--dsw-alias-label-caption': '#78839b',
        '--dsw-alias-label-dimmed': '#d8e0ee',
        '--dsw-alias-menu-icon': '#2c3752',
        '--dsw-alias-border-l1': '#26428c1a',
        '--dsw-alias-border-l2': '#26428c29',
        '--dsw-alias-border-l3': '#26428c38',
        '--dsw-alias-border-l4': '#26428c47',
        '--dsw-alias-scrollbar-bg-l1': 'linear-gradient(180deg,var(--wbg-azure),var(--wbg-rose))',
        '--dsw-alias-scrollbar-bg-l2': 'linear-gradient(180deg,var(--wbg-azure),var(--wbg-rose))',
        '--dsw-alias-scrollbar-hover-l1': 'linear-gradient(180deg,var(--wbg-rose),var(--wbg-azure))',
        '--dsw-alias-scrollbar-hover-l2': 'linear-gradient(180deg,var(--wbg-rose),var(--wbg-azure))',
        '--dsw-alias-state-idle-primary': '#b7c4e0',
        '--dsw-alias-tooltip-bg': '#1d2742',
        '--dsw-alias-toast-bg': '#1d2742',
      },
      dark: {
        '--dsw-alias-brand-primary': '#9cc0ff',
        '--dsw-alias-brand-primary-new-colorprimary-new-color': '#6fa0ff',
        '--dsw-alias-brand-text': '#bbd4ff',
        '--dsw-alias-button-primary-fill': '#9cc0ff',
        '--dsw-alias-button-primary-hover': '#bcd5ff',
        '--dsw-alias-button-primary-dimmed': '#2a3550',
        '--dsw-alias-button-info-fill': '#6fa0ff',
        '--dsw-alias-button-info-hover': '#8fb8ff',
        '--dsw-alias-state-business-primary': '#7fa8ff',
        '--dsw-alias-link': '#ff8fbf',
        '--dsw-alias-interactive-bg-hover': '#9cc0ff1a',
        '--dsw-alias-interactive-bg-active': '#9cc0ff2e',
        '--dsw-alias-interactive-bg-hover-accent': '#7fa8ff29',
        '--dsw-alias-bg-document-preview': '#141a29',
        '--dsw-alias-label-document-preview': '#c3cee6',
        '--dsw-alias-bg-module-platform': '#242c40',
        '--dsw-alias-bg-multi-select': '#262e44',
        '--dsw-alias-bg-overlay': '#3a4763',
        '--dsw-alias-bg-skeleton': '#ffffff14',
        '--dsw-specific-bubble': '#33202c',
        '--dsw-specific-bubble-highlight': '#442a3a',
        '--dsw-specific-input-major': '#1c2436',
        '--dsw-specific-menu': '#2b3349a6',
        '--dsw-specific-selector': '#242c40',
        '--dsw-specific-sidebar-nav-item-active-accent': '#ff8fbf29',
        '--dsw-specific-tip': '#252e44',
        '--dsw-alias-menu-group-header-fill': '#2a3247f0',
        '--dsw-alias-markdown-citation': '#38222f',
        '--dsw-alias-label-primary': '#eef2ff',
        '--dsw-alias-label-primary-bluish': '#dee9ff',
        '--dsw-alias-label-primary-dimmed': '#f7f9ff',
        '--dsw-alias-label-secondary': '#b6c1d9',
        '--dsw-alias-label-tertiary': '#97a3bd',
        '--dsw-alias-label-caption': '#8792ac',
        '--dsw-alias-label-dimmed': '#3c4763',
        '--dsw-alias-menu-icon': '#cbd6f0',
        '--dsw-alias-border-l1': '#8caae624',
        '--dsw-alias-border-l2': '#8caae633',
        '--dsw-alias-border-l3': '#8caae642',
        '--dsw-alias-border-l4': '#8caae657',
        '--dsw-alias-scrollbar-bg-l1': 'linear-gradient(180deg,var(--wbg-azure),var(--wbg-rose))',
        '--dsw-alias-scrollbar-bg-l2': 'linear-gradient(180deg,var(--wbg-azure),var(--wbg-rose))',
        '--dsw-alias-scrollbar-hover-l1': 'linear-gradient(180deg,var(--wbg-rose),var(--wbg-azure))',
        '--dsw-alias-scrollbar-hover-l2': 'linear-gradient(180deg,var(--wbg-rose),var(--wbg-azure))',
        '--dsw-alias-state-idle-primary': '#4b5b7c',
        '--dsw-alias-tooltip-bg': '#232d46',
        '--dsw-alias-toast-bg': '#232d46',
      },
    }
    /** 把 AZURE_ROSE 展开成 overrideTokens 需要的 { light, dark } 结构 */
    function azureRoseTokens() {
      var out = {}
      Object.keys(AZURE_ROSE.light).forEach(function (name) {
        out[name] = { light: AZURE_ROSE.light[name], dark: AZURE_ROSE.dark[name] }
      })
      return out
    }

    var CSS_TEXT =
      '#dsh-wallpaper-bg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;overflow:hidden;pointer-events:none;background-color:#0b1020;background-position:center center;background-size:cover;background-repeat:no-repeat;transition:transform .2s ease;}' +
      // 切换壁纸用「双层交叉淡入淡出」：新壁纸先离屏解码 / 起播，再与旧壁纸叠化，避免中途空窗闪黑
      // 视频层内是 <video object-fit:cover>（由合成器缩放，避免 canvas 每帧重绘在 4K 下拖慢帧率）
      // 关键：近黑底色 #0b1020 挂在**容器**上，不能挂在图层上——图层带不透明底色时，
      // 只要它自己的内容还没画出来（视频首帧尤其慢），叠化期间露出的就是这块近黑，
      // 「两个视频之间切换」最明显。底色留在容器上，图层全透明，旧壁纸就能一直透在下面。
      '#dsh-wallpaper-bg>.wbg-layer{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity .42s ease;background-position:center center;background-size:cover;background-repeat:no-repeat;}' +
      '#dsh-wallpaper-bg>.wbg-layer>video{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;}' +
      '#dsh-wallpaper-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;background:rgba(0,0,0,0.4);transition:background .2s ease;}' +
      '.wbg-panel{display:flex;flex-direction:column;gap:14px;padding:4px 2px 24px;}' +
      // 蓝粉配色变量挂在 body 上：设置面板、主页面开关、队列取同一组值，网页端与桌面端表现一致。
      // 亮色 = 蔚蓝主色 + 玫粉高亮，深色 = 提亮后的同色相；--wbg-on-* 是对应底色上的可读文字色。
      'body{--wbg-azure:#2f5ce0;--wbg-rose:#c2255c;--wbg-on-accent:#ffffff;--wbg-on-rose:#ffffff;}' +
      'body[data-ds-dark-theme]{--wbg-azure:#7fa8ff;--wbg-rose:#ff8fbf;--wbg-on-accent:#151021;--wbg-on-rose:#2a1420;}' +
      // 经典配色：两色都退回 DSH 品牌主色，渐变自然变成纯色，观感与加配色之前的原版一致
      'body[data-dshw-palette="classic"]{--wbg-azure:var(--dsw-alias-brand-primary);--wbg-rose:var(--dsw-alias-brand-primary);--wbg-on-accent:var(--dsw-alias-label-primary-inverted);--wbg-on-rose:var(--dsw-alias-label-primary-inverted);}' +
      'body[data-dshw-palette="classic"] .wbg-panel::before{display:none;}' +
      '.wbg-panel::before{content:"";display:block;height:2px;border-radius:999px;background:linear-gradient(90deg,var(--wbg-azure),var(--wbg-rose));opacity:.9;margin:-2px 0 0;}' +
      // 通用设置 → 外观 之后的「主题配色」行：沿用 DSH 外观卡片的排版（标题 + 方块），
      // 这样它看起来就是外观设置的一部分，而不是壁纸插件的私有开关。
      '.wbg-theme-row{display:flex;flex-direction:column;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);}' +
      '.wbg-theme-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px;}' +
      '.wbg-theme-cubes{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;}' +
      '.wbg-theme-cube{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-xl,12px);font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;display:flex;flex-direction:column;flex:180px;justify-content:center;align-items:center;gap:6px;padding:20px 32px;font-size:14px;line-height:22px;}' +
      '.wbg-theme-cube:hover{background:var(--dsw-alias-interactive-bg-hover);}' +
      '.wbg-theme-cube.wbg-theme-cube-selected{background:var(--dsw-alias-bg-module-platform);border-color:var(--wbg-azure);}' +
      'body[data-dshw-palette="classic"] .wbg-theme-cube.wbg-theme-cube-selected{border-color:var(--dsw-static-neutral-bluish-400);}' +
      '.wbg-theme-swatch{display:block;width:28px;height:28px;border-radius:9px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);}' +
      '.wbg-theme-swatch-azure{background:linear-gradient(135deg,var(--wbg-azure),var(--wbg-rose));}' +
      '.wbg-theme-swatch-classic{background:linear-gradient(135deg,var(--dsw-alias-brand-primary),var(--dsw-alias-bg-layer-2));}' +
      // 侧栏 logo：鲸鱼 + deepseek 字标用蓝→粉渐变；HARNESS 徽标保持原来的反色底，
      // 只给 path 上渐变（徽标是 rect，HARNESS 字母是 inverted 填充，都不受影响）。
      '.wbg-brand-grad-mark path[fill="currentColor"]{fill:url(#wbg-brand-grad-mark);}' +
      '.wbg-brand-grad-name path[fill="currentColor"]{fill:url(#wbg-brand-grad-name);}' +
      '.wbg-brand-stop-a{stop-color:var(--wbg-azure);}' +
      '.wbg-brand-stop-b{stop-color:var(--wbg-rose);}' +
      // 滚动条滑块：--dsw-alias-scrollbar-bg-l1/l2 已换成竖直渐变；
      // DSH 原 hover 规则用的是 background-color（不吃渐变），这里改成 background-image。
      '::-webkit-scrollbar-thumb:hover{background-image:var(--dsh-scrollbar-thumb-hover);}' +
      '.wbg-seg{display:flex;gap:8px;}' +
      '.wbg-seg-btn{flex:1;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-radius:8px;cursor:pointer;font-size:13px;}' +
      '.wbg-seg-btn.wbg-active{background:linear-gradient(135deg,var(--wbg-azure),var(--wbg-rose));color:var(--wbg-on-accent);border-color:transparent;}' +
      '.wbg-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}' +
      '.wbg-tile{position:relative;aspect-ratio:16/10;border-radius:10px;overflow:hidden;border:2px solid var(--dsw-alias-border-l1);cursor:pointer;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-tile img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.wbg-tile.wbg-selected{border-color:var(--wbg-azure);}' +
      '.wbg-tile-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--dsw-alias-label-secondary);}' +
      // 内置壁纸：本地缩略图加载前先显示首字 + 微光骨架，图片到达后淡入（不再是一块空白卡片）
      '.wbg-tile-ph.wbg-ph-abs{position:absolute;inset:0;background:linear-gradient(100deg,var(--dsw-alias-bg-skeleton) 0%,transparent 45%,var(--dsw-alias-bg-skeleton) 70%);background-size:200% 100%;animation:wbg-shimmer 1.4s linear infinite;}' +
      '@keyframes wbg-shimmer{0%{background-position:100% 0;}100%{background-position:-100% 0;}}' +
      '@media (prefers-reduced-motion: reduce){.wbg-tile-ph.wbg-ph-abs{animation:none;}}' +
      '.wbg-tile img.wbg-fade-img{position:absolute;inset:0;opacity:0;transition:opacity .18s ease;}' +
      '.wbg-tile img.wbg-img-ready{opacity:1;}' +
      '.wbg-tile img.wbg-img-failed{display:none;}' +
      '.wbg-tile-name{position:absolute;left:0;right:0;bottom:0;padding:16px 6px 4px;font-size:11px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.72));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.wbg-tile-badge{position:absolute;top:6px;right:6px;padding:2px 6px;border-radius:6px;font-size:10px;color:#fff;background:rgba(0,0,0,.55);}' +
      '.wbg-tile-badge2{position:absolute;top:6px;left:6px;padding:2px 6px;border-radius:6px;font-size:10px;color:#fff;background:rgba(224,64,64,.85);}' +
      '.wbg-tile-del{position:absolute;top:4px;left:4px;width:20px;height:20px;line-height:16px;border:none;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font-size:14px;cursor:pointer;}' +
      '.wbg-row{display:flex;align-items:center;gap:12px;}' +
      '.wbg-row label{width:88px;font-size:13px;color:var(--dsw-alias-label-secondary);flex:none;}' +
      // 滑杆：整条已填充部分从蔚蓝渐变到玫粉（与面板顶部那条线一致），未填充部分保持中性。
      // 原生 accent-color 只能单色，这里改用自定义轨道；--wbg-range-p 由 sliderRow 按当前值算好。
      '.wbg-row input[type=range]{flex:1;width:100%;height:20px;margin:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer;}' +
      '.wbg-row input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(90deg,var(--wbg-azure) 0%,var(--wbg-rose) var(--wbg-range-p,50%),var(--dsw-alias-bg-overlay) var(--wbg-range-p,50%),var(--dsw-alias-bg-overlay) 100%);}' +
      '.wbg-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-5px;border-radius:50%;border:2px solid var(--wbg-rose);background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);transition:box-shadow .15s ease;}' +
      '.wbg-row input[type=range]:hover::-webkit-slider-thumb{box-shadow:0 0 0 4px color-mix(in srgb,var(--wbg-rose) 18%,transparent),0 1px 3px rgba(0,0,0,.28);}' +
      '.wbg-row input[type=range]:focus-visible{outline:2px solid var(--wbg-rose);outline-offset:3px;border-radius:999px;}' +
      '.wbg-row input[type=range]::-moz-range-track{height:6px;border-radius:999px;background:var(--dsw-alias-bg-overlay);}' +
      '.wbg-row input[type=range]::-moz-range-progress{height:6px;border-radius:999px;background:linear-gradient(90deg,var(--wbg-azure),var(--wbg-rose));}' +
      '.wbg-row input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;border:2px solid var(--wbg-rose);background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28);}' +
      '.wbg-val{width:52px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}' +
      '.wbg-filters{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}' +
      '.wbg-filter-label{flex:none;width:34px;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-chip{padding:4px 10px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;cursor:pointer;font-size:12px;}' +
      '.wbg-chip:hover{border-color:var(--wbg-azure);color:var(--dsw-alias-label-primary);}' +
      '.wbg-chip.wbg-active{background:var(--wbg-rose);color:var(--wbg-on-rose);border-color:transparent;}' +
      '.wbg-filter-count{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-btn{padding:8px 14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;cursor:pointer;font-size:13px;}' +
      '.wbg-btn:hover{border-color:var(--wbg-azure);}' +
      '.wbg-btn:disabled{opacity:.55;cursor:default;}' +
      '.wbg-upload{cursor:pointer;}' +
      '.wbg-input{flex:1;min-width:160px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;font-size:12px;}' +
      '.wbg-input:focus,.wbg-sync select:focus{border-color:var(--wbg-azure);outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--wbg-azure) 22%,transparent);}' +
      '.wbg-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--dsw-alias-label-primary);}' +
      '.wbg-switch input{accent-color:var(--wbg-rose);}' +
      // 主页面「原生背景」开关：DSH 主题令牌 + 完整胶囊圆角（corner-shape 是渐进增强，老内核忽略）
      // 注意：拇指颜色不能用 --dsw-alias-switch-thumb —— 本版 DSH 没有这个令牌（实测解析为空 → 拇指透明不可见），
      // 这里用内置静态色兜底：浅色/深色轨道上都用白拇指；蓝粉渐变轨道上白色始终可见。
      '.wbg-native-toggle{position:relative;display:inline-flex;align-items:center;width:44px;height:24px;flex:none;padding:0;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-state-idle-primary);cursor:pointer;transition:background .18s ease;}' +
      '.wbg-native-toggle[aria-checked="true"]{background:linear-gradient(90deg,var(--wbg-azure),var(--wbg-rose));}' +
      '.wbg-native-toggle:focus-visible{outline:2px solid var(--wbg-rose);outline-offset:3px;}' +
      '.wbg-native-toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;corner-shape:round;background:var(--dsw-static-neutral-00,#fff);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s ease,background .18s ease;}' +
      '.wbg-native-toggle[aria-checked="true"] .wbg-native-toggle-thumb{transform:translateX(20px);}' +
      'body[data-ds-dark-theme] .wbg-native-toggle[aria-checked="true"] .wbg-native-toggle-thumb{background:#fff;box-shadow:0 1px 3px rgba(10,16,32,.35);}' +
      '@media (prefers-reduced-motion:reduce){.wbg-native-toggle,.wbg-native-toggle-thumb{transition:none;}}' +
      // 原生背景模式下的表面：全局令牌转透明后，只给输入框座位与弹窗补回半透明底色，保证细字可读
      'body[data-dshw-native-bg="true"] [data-composer-seat],body[data-dshw-native-bg="true"] [role="dialog"],body[data-dshw-native-bg="true"] [role="alertdialog"]{--dsw-alias-bg-base:transparent;--dsw-alias-bg-layer-1:rgba(255,255,255,0.55);--dsw-alias-bg-layer-2:rgba(255,255,255,0.62);--dsw-specific-sidebar-fill:rgba(255,255,255,0.5);}' +
      'body[data-dshw-native-bg="true"][data-ds-dark-theme] [data-composer-seat],body[data-dshw-native-bg="true"][data-ds-dark-theme] [role="dialog"],body[data-dshw-native-bg="true"][data-ds-dark-theme] [role="alertdialog"]{--dsw-alias-bg-layer-1:rgba(16,20,28,0.55);--dsw-alias-bg-layer-2:rgba(22,27,36,0.62);--dsw-specific-sidebar-fill:rgba(10,13,19,0.5);}' +
      // 设置弹窗对比度：只命中包含壁纸面板的设置弹窗，其他 dialog / 菜单 / 第三方插件表面保持原样。
      // 半透明 layer-2 在「壁纸亮度与主题相反」时会把合成表面推向中灰；0.86 + 文字档是实测能覆盖
      // 浅色遇纯黑、深色遇纯白两种最坏情况的组合（secondary/tertiary/caption 均 ≥ 4.6）。
      // [data-wbg-settings] 是不支持 :has() 的浏览器（以及面板挂载时）的回退；两条规则不要合并成
      // 逗号选择器——否则不识别 :has 的浏览器会把整条规则一起丢掉。
      '[role="dialog"][data-wbg-settings]{--dsw-alias-bg-layer-2:rgba(255,249,253,0.86);--dsw-alias-label-tertiary:#4f5b73;--dsw-alias-label-caption:#525d75;}' +
      '[role="dialog"]:has(.wbg-panel){--dsw-alias-bg-layer-2:rgba(255,249,253,0.86);--dsw-alias-label-tertiary:#4f5b73;--dsw-alias-label-caption:#525d75;}' +
      'body[data-ds-dark-theme] [role="dialog"][data-wbg-settings]{--dsw-alias-bg-layer-2:rgba(30,22,38,0.86);--dsw-alias-label-tertiary:#a3aec7;--dsw-alias-label-caption:#b3bed6;}' +
      'body[data-ds-dark-theme] [role="dialog"]:has(.wbg-panel){--dsw-alias-bg-layer-2:rgba(30,22,38,0.86);--dsw-alias-label-tertiary:#a3aec7;--dsw-alias-label-caption:#b3bed6;}' +
      // 同步状态行里的「跟随显示器」：不能用 .wbg-row 里的 <label> 包（那条 CSS 把 label
      // 钉成 width:88px / flex:none，select 会溢出到「立即刷新」底下——0.5.1 初版就这么重叠了）。
      // 这里用 div.wbg-sync：整块可伸缩（flex:1 1 auto）且 min-width:0，select 也 min-width:0，
      // 位置不够时一起收缩而不是压住按钮；选项文案保持短（完整标题在上面的状态行里）。
      '.wbg-sync{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0;}' +
      '.wbg-sync>span{flex:none;}' +
      '.wbg-sync select{flex:1 1 auto;min-width:0;max-width:100%;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;font-size:12px;}' +
      '.wbg-sync select:disabled{opacity:.6;}' +
      '.wbg-hint{font-size:12px;color:var(--dsw-alias-label-secondary);}' +
      '.wbg-error{font-size:12px;color:var(--dsw-alias-state-error-primary);}' +
      // 服务「曾经连上过、后来断掉」（列表还在缓存里）时的横幅。旧行为只在 weError && !list
      // 时提示，于是这次断线在界面上完全看不出来，用户以为壁纸库还是好的——不能因为「有列表」
      // 就把错误吞掉。这里如实说明缓存可能过期，并给出最省事的一步。
      '.wbg-stale{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);}' +
      '.wbg-queue{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-queue.wbg-q-over{border-color:var(--wbg-azure);background:var(--dsw-alias-bg-layer-1);}' +
      '.wbg-queue-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}' +
      '.wbg-queue-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}' +
      '.wbg-queue-strip{display:flex;gap:8px;overflow-x:auto;padding:2px;}' +
      '.wbg-qitem{position:relative;flex:none;width:84px;aspect-ratio:16/10;border-radius:8px;overflow:hidden;border:2px solid var(--dsw-alias-border-l1);cursor:pointer;background:var(--dsw-alias-bg-layer-2);}' +
      '.wbg-qitem img{width:100%;height:100%;object-fit:cover;display:block;}' +
      '.wbg-qitem.wbg-q-cur{border-color:var(--wbg-rose);}' +
      '.wbg-qitem-idx{position:absolute;bottom:4px;right:4px;min-width:16px;height:16px;line-height:16px;text-align:center;border-radius:8px;font-size:10px;color:#fff;background:rgba(0,0,0,.6);}' +
      '.wbg-qitem-del{position:absolute;top:3px;left:3px;width:18px;height:18px;line-height:15px;border:none;border-radius:5px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;cursor:pointer;}' +
      '.wbg-q-gap{flex:none;width:8px;border-radius:4px;background:var(--wbg-rose);opacity:.75;align-self:stretch;}' +
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

      // ---------- 主题表面：常态半透明以透出壁纸，原生背景模式临时清掉表面覆盖 ----------
      // overrideTokens 同 source 重复调用 = 整层替换并重新置顶，所以开关 / 配色切换时直接再调一次即可。
      // 蓝粉配色只叠加 alias 令牌，表面仍保留原来的 alpha —— 壁纸可见度与色调补偿都不受影响。
      function applySurfaceMode() {
        var native = !!(state && state.nativeBackground)
        var azureRose = !!(state && state.palette === 'azureRose')
        if (document.body) {
          if (azureRose) document.body.setAttribute('data-dshw-palette', 'azureRose')
          else document.body.setAttribute('data-dshw-palette', 'classic')
          if (native) document.body.setAttribute('data-dshw-native-bg', 'true')
          else document.body.removeAttribute('data-dshw-native-bg')
        }
        if (!theme || typeof theme.overrideTokens !== 'function') return
        var tokens = {
          '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
          '--dsw-alias-bg-layer-1': {
            light: native ? 'transparent' : (azureRose ? 'rgba(244,248,255,0.55)' : 'rgba(255,255,255,0.55)'),
            dark: native ? 'transparent' : (azureRose ? 'rgba(17,23,40,0.55)' : 'rgba(16,20,28,0.55)'),
          },
          '--dsw-alias-bg-layer-2': {
            light: native ? 'transparent' : (azureRose ? 'rgba(255,249,253,0.62)' : 'rgba(255,255,255,0.62)'),
            dark: native ? 'transparent' : (azureRose ? 'rgba(30,22,38,0.62)' : 'rgba(22,27,36,0.62)'),
          },
          '--dsw-specific-sidebar-fill': {
            light: native ? 'transparent' : (azureRose ? 'rgba(238,245,255,0.5)' : 'rgba(255,255,255,0.5)'),
            dark: native ? 'transparent' : (azureRose ? 'rgba(12,17,30,0.5)' : 'rgba(10,13,19,0.5)'),
          },
        }
        if (azureRose) {
          var paletteTokens = azureRoseTokens()
          Object.keys(paletteTokens).forEach(function (name) { tokens[name] = paletteTokens[name] })
        }
        theme.overrideTokens('dsh-wallpaper-bg', tokens)
      }

      // ---------- 侧栏 logo 渐变 ----------
      // 侧栏 logo 是 DSH 自己渲染的两个内联 SVG（sidebar.brand.mark / .name）。
      // 用 slot 覆盖会丢掉原字标的字形，这里只往 SVG 里补一个 linearGradient，
      // 再把 path 的 currentColor 填充指过去；HARNESS 徽标（rect）与字母
      // （--dsw-alias-label-primary-inverted）保持原样，对比度不变。
      // React 在折叠/展开或重渲染时会换掉 SVG，所以用 MutationObserver + rAF 合并补一次。
      var SVG_NS = 'http://www.w3.org/2000/svg'
      var brandPaintRaf = 0
      function brandGradientTargets() {
        return [
          { sel: 'span[class*="brandMark"] svg', id: 'wbg-brand-grad-mark', cls: 'wbg-brand-grad-mark', x1: 0, x2: 23.16 },
          { sel: 'span[class*="brandName"] svg', id: 'wbg-brand-grad-name', cls: 'wbg-brand-grad-name', x1: 26, x2: 182 },
        ]
      }
      function ensureBrandGradient() {
        brandGradientTargets().forEach(function (t) {
          var svg = document.querySelector(t.sel)
          if (!svg) return
          if (!svg.classList.contains(t.cls)) svg.classList.add(t.cls)
          if (svg.querySelector('#' + t.id)) return
          var defs = document.createElementNS(SVG_NS, 'defs')
          var grad = document.createElementNS(SVG_NS, 'linearGradient')
          grad.setAttribute('id', t.id)
          grad.setAttribute('gradientUnits', 'userSpaceOnUse')
          grad.setAttribute('x1', String(t.x1))
          grad.setAttribute('y1', '0')
          grad.setAttribute('x2', String(t.x2))
          grad.setAttribute('y2', '0')
          var a = document.createElementNS(SVG_NS, 'stop')
          a.setAttribute('offset', '0%')
          a.setAttribute('class', 'wbg-brand-stop-a')
          var b = document.createElementNS(SVG_NS, 'stop')
          b.setAttribute('offset', '100%')
          b.setAttribute('class', 'wbg-brand-stop-b')
          grad.appendChild(a)
          grad.appendChild(b)
          defs.appendChild(grad)
          svg.insertBefore(defs, svg.firstChild)
        })
      }
      function scheduleBrandGradient() {
        if (brandPaintRaf) return
        brandPaintRaf = window.requestAnimationFrame(function () {
          brandPaintRaf = 0
          ensureBrandGradient()
        })
      }
      var brandObserver = null
      if (document.body) {
        brandObserver = new MutationObserver(scheduleBrandGradient)
        brandObserver.observe(document.body, { childList: true, subtree: true })
      }
      ensureBrandGradient()

      // ---------- 背景层 ----------

      var bgEl = document.createElement('div')
      bgEl.id = 'dsh-wallpaper-bg'
      var overlayEl = document.createElement('div')
      overlayEl.id = 'dsh-wallpaper-overlay'
      // 两个全屏层必须插在 #root **之前**，不能 append 到 body 末尾。
      // DSH 桌面端（macOS）的基础样式里有
      //   html[data-platform=darwin] body>:not(#root){-webkit-app-region:no-drag}
      // 于是这两个「body 的直接子元素、且不是 #root」各自成为一块覆盖整窗的 no-drag
      // 区域；而 Electron 合成窗口拖拽区域时是「有序矩形列表里靠后的覆盖靠前的」
      // （electron/shell/browser/ui/drag_util.cc），矩形列表按文档顺序收集。append 到
      // 末尾就排在所有 [data-window-drag] 标题行之后 —— 整窗拖拽区被抹掉，窗口拖不动、
      // 双击也不放大（双击缩放依赖同一套区域）。插到 #root 之前，靠后的标题行就能反向
      // 覆盖它们。注意：给这两个层声明 -webkit-app-region:none 实测**无效**，别用那条路。
      // 视觉与功能不变：两层仍是 position:fixed; z-index:-1，仍在所有 UI 之下。
      var anchor = document.getElementById('root') || document.body.firstChild
      document.body.insertBefore(bgEl, anchor)
      document.body.insertBefore(overlayEl, anchor)

      // ---------- 主题跟随：浅色雾层 / 深色遮罩自动切换 ----------
      var themeObserver = null
      if (document.body) {
        themeObserver = new MutationObserver(function () { applyOverlay() })
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }
      // 窗口尺寸变化 = 背景层的可见裁剪区变了 → 重算雾层 alpha，让界面色调保持恒定。
      // （用 rAF 合帧：一次拖动会触发几十次 resize，实际只算最后那几帧。）
      var onWindowResize = function () { scheduleTone() }
      window.addEventListener('resize', onWindowResize)

      var activeKind = 'none'
      var lastObjectUrl = null
      var shimHinted = false   // 旧版 WE API 服务的提示只打一次

      // ---------- 交叉淡入淡出（切换壁纸不闪黑的关键） ----------
      // 旧壁纸留在原位，新壁纸在自己的图层里「先就绪、后显示」：
      //   图片 → 预加载 + decode 完成；视频 → loadeddata 且首帧可显示（<video> 直接铺满）；
      //   网页 → iframe 画出内容（垫片 painted 上报）后立刻叠化；场景走工坊预览图（applyScene）。
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
          p = loadImage(w.url)
            .then(function () { return { url: w.url, objectUrl: false } })
            .catch(function () {
              // 本地 full 缺失（旧包）时回退 Unsplash；再失败就交给调用方忽略
              return loadImage(w.remoteUrl).then(function () { return { url: w.remoteUrl, objectUrl: false } })
            })
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
          } else if (item.kind === 'scene') {
            // 场景不本地渲染：手动选中显示 WE 自带的工坊预览图（preview.gif/jpg）
            var su = assetUrlOf(item.previewFile || item.thumbnail)
            p = su ? loadImage(su).then(function () { return { url: su, objectUrl: false } }) : Promise.resolve(null)
          } else {
            p = Promise.resolve(null)   // 网页由 iframe 自己加载
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

      /** 退场图层「只暂停、不断源」：暂停不会丢帧，也不再解码，最后一帧继续参与叠化。
       *  旧实现在叠化一开始就 dispose（releaseVideo：pause + 摘掉 src + load()），那一瞬间
       *  <video> 已经没有任何可画的帧，图层只剩自己的底色 —— 旧视频淡出期间画面直接塌成近黑。
       *  所以真正释放推迟到图层被移除之后（见 fadeOutLayer 的 drop）。 */
      function quiesceLayer(layer) {
        if (!layer || !layer.querySelectorAll) return
        var vs = layer.querySelectorAll('video')
        for (var i = 0; i < vs.length; i++) {
          // 旧层不再参与「白场片头探测」的即时 seek
          if (vs[i] === activeVideoEl) activeVideoEl = null
          try { vs[i].pause() } catch (e) { /* 忽略 */ }
        }
      }

      /** 旧图层淡出后移除；未接入 DOM 的图层直接丢弃 */
      function fadeOutLayer(layer) {
        if (!layer) return
        // 注意（历史坑）：这里把 dispose 摘出来单独释放，是为了避免「图层已移除但视频元素还在后台解码」。
        // 但释放时机必须是移除时，不能是淡出开始时：先释放会让旧画面在叠化途中变空。
        var cleanup = layers.get(layer) || null
        if (layers.has(layer)) layers.delete(layer)
        var release = function () {
          if (cleanup) { try { cleanup() } catch (e) { /* 忽略 */ } }
          purgeVideosIn(layer)
        }
        if (!layer.parentNode) {
          // 从未入 DOM：没有画面要保，直接释放（否则会留下后台解码）
          release()
          return
        }
        quiesceLayer(layer)   // 只暂停：保留最后一帧，且立刻停掉解码
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
          release()
          if (layer.parentNode) layer.parentNode.removeChild(layer)
        }
        layer.addEventListener('transitionend', onEnd)
        later(drop, FADE_MS + 200)
      }

      function clearActive() {
        // 让所有在途的 apply 立刻作废：视频入 DOM 后还要等「首帧已呈现」才进场（可能几百毫秒），
        // 等待期间若整个背景被清掉，那次 apply 不能再把图层挂回来。
        applySeq += 1
        activeKind = 'none'
        // 背景已清空：旧的亮度图不再代表屏幕上的画面，别拿它继续补偿
        toneMap = null
        toneSeq += 1
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
       *  两个要点：
       *  1. 这里绝不能写 layers.set(layer, null)——视频路径是「先注册清理函数、再调 crossfade」，
       *     覆盖成 null 会让旧层的 dispose 永远丢失。
       *  2. 改 opacity 之前必须先强制结算一次样式。否则 `appendChild` 与「opacity 改 1」会被浏览器
       *     并成同一帧：没有 before-change 样式，过渡根本不会产生 —— 新壁纸是「跳进来」的，
       *     叠化（以及它用来掩盖解码延迟的作用）全部失效；反过来，叠化真的跑起来以后，
       *     旧层又必须保住画面（见 fadeOutLayer），两件事要一起成立才不闪黑。 */
      function crossfade(layer, kind) {
        var previous = activeLayer
        if (!layers.has(layer)) layers.set(layer, null)
        // 视频 / 网页壁纸没有可用的亮度图（逐帧变化、跨域页面拿不到像素）：清掉旧的，
        // 让色调补偿退回「不介入」，避免拿上一张图片的亮度去调当前的雾层。
        if (kind !== 'image' && toneMap) {
          toneMap = null
          toneSeq += 1
          paintOverlay()
        }
        // 允许调用方先把图层挂进 DOM（网页 / 视频要在可见上下文里解码首帧）
        if (!layer.parentNode) bgEl.appendChild(layer)
        activeLayer = layer
        activeKind = kind
        if (!previous || previous === layer) {
          // 没有可叠化的旧层（首次进入 / 旧层刚被清理）：直接显示。
          // 这里若也走过渡，首屏就会凭空多出 0.42s 的「从容器底色淡入」，看着同样像闪黑。
          layer.style.transition = 'none'
          layer.style.opacity = '1'
          void layer.offsetWidth
          layer.style.transition = ''   // 恢复 .wbg-layer 的过渡，留给这张将来淡出用
          return
        }
        void layer.offsetWidth   // 强制样式 / 布局结算：让 opacity:0 成为过渡的起始样式
        window.requestAnimationFrame(function () {
          if (activeLayer !== layer) return
          layer.style.opacity = '1'
          fadeOutLayer(previous)
        })
      }

      /** 预解码图片：缓存命中时几乎立即 resolve，未缓存时等真正解码完成，杜绝「换 url 到画出像素」的空窗。
       *  resolve 时把已解码的 img 一并交出去（调用方可以用来建亮度图，见 buildToneMap）。 */
      function loadImage(url) {
        return new Promise(function (resolve, reject) {
          var img = new Image()
          img.onload = function () {
            if (img.decode) {
              img.decode().then(function () { resolve(img) }, function () { resolve(img) })
            } else resolve(img)
          }
          img.onerror = function () { reject(new Error('图片加载失败: ' + url)) }
          img.src = url
        })
      }

      function applyImage(url, preloaded) {
        if (!url) { clearActive(); return }
        var seq = ++applySeq
        return loadImage(url).then(function (img) {
          if (seq !== applySeq) return
          // 刷新色调补偿基准：这里拿到的就是背景层即将显示的那张图，共用同一份解码结果
          toneMap = buildToneMap(img)
          paintOverlay()
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
            // readyState 只说明「数据到了」，不代表合成器手里已经有一帧可以画：
            // 4K / 大文件从 attach + play() 到真正出画面可能要几百毫秒，这段时间露出的
            // 是图层底色（近黑）——这正是「切换时闪一会黑屏、两个视频之间最明显」的主因。
            // 这里等 requestVideoFrameCallback（真的呈现了一帧）再叠化；拿不到就退回计时兜底。
            var firstFrame = function () {
              return new Promise(function (done) {
                var ok = false
                var once = function () { if (ok) return; ok = true; done() }
                if (typeof video.requestVideoFrameCallback !== 'function') { later(once, 260); return }
                try { video.requestVideoFrameCallback(function () { once() }) } catch (e) { later(once, 260) }
                later(once, 1500)   // 兜底：迟迟没有呈现回调也不能让旧壁纸一直挂着
              })
            }
            var enter = function () {
              if (seq !== applySeq || !layers.has(layer)) {
                // 已经被更晚的一次切换（或 clearActive）顶掉：撤掉这个还没进场的图层，
                // 别留下不可见的解码负担，更不能把已清掉的背景重新挂回来
                if (layers.has(layer)) layers.delete(layer)
                if (layerInDom && layer && layer.parentNode) layer.parentNode.removeChild(layer)
                dispose()
                return
              }
              crossfade(layer, 'video')
              if (!preloaded) warmNextInQueue()
            }
            // 先以 opacity:0 入 DOM（视频必须在可见上下文里才会解码 / 呈现首帧），起播，等首帧呈现再进场。
            if (!layerInDom) { bgEl.appendChild(layer); layerInDom = true }
            kick()
            firstFrame().then(function () {
              // 首次加载（没有预热结果）时顺手探一下白场片头，探完再进场
              if (!preloaded && seq === applySeq) probeStartupWhite(video, url)
              enter()
            })
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

      /** 场景预览图地址：优先工坊预览图（preview.gif 会动），退回缩略图 */
      function scenePreviewUrlOf(item) {
        if (!item) return ''
        return assetUrlOf(item.previewFile || item.thumbnail)
      }

      /** 场景壁纸（手动选中 / 队列 / 桌面同步）：不做本地渲染，一律显示 WE 自带的工坊预览图
       *  （preview.gif 会动 / preview.jpg）。想要 100% 保真的动态场景：用 WE 的屏幕录制（或
       *  OBS）录成 MP4 再从「自定义上传」导入播放——不采样桌面、不产生任何缓存文件。 */
      function applyScene(item) {
        if (!item) { clearActive(); return }
        var preview = scenePreviewUrlOf(item)
        if (preview) applyImage(preview)
        else clearActive()
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
        // 网页壁纸的 iframe 必须用**实际**服务地址：配套插件在 8088 被占用时可能
        // 换到别的端口，宿主半会自动发现它并把实际 weBase 放进响应里。
        var base = String(weCache.baseUsed || state.weBase || DEFAULTS.weBase).replace(/\/+$/, '')
        return applyFrame(
          base + '/files/' + item.id + '/' + rel,
          'Wallpaper Engine 网页壁纸 ' + (item.title || item.id),
          'web',
        )
      }

      /** iframe 类壁纸（网页）：插入 DOM 后再设 src，等「已画出内容」的信号再叠化入场。
       *  两个要点：
       *  1. 未插入文档的 iframe 没有浏览上下文——设了 src 也不会加载、load 永不触发、
       *     contentDocument 为 null。旧实现先设 src、等 load 时才插入，于是只能靠 4 秒
       *     兜底定时器插入后才开始加载（网页壁纸因此要等 4 秒以上，且插入瞬间就叠化，
       *     第三方页面还没画出第一帧 → 黑屏）。现在先入 DOM 再设 src，加载零延迟；
       *     图层 opacity 仍为 0，所以提前入 DOM 不会提前露出内容。
       *  2. 网页壁纸的 WE 兼容垫片（由 WE API 的 /files 路由注入）在真正画出内容时
       *     postMessage 上报，此时立刻叠化最准；没有垫片时退化为 load + 500ms。 */
      function applyFrame(url, title, kind) {
        var seq = ++applySeq
        var origin = ''
        try { origin = new URL(url, location.href).origin } catch (e) { origin = '' }
        var iframe = document.createElement('iframe')
        iframe.setAttribute('scrolling', 'no')
        iframe.setAttribute('title', title)
        // 网页壁纸常自带 BGM / 音效，没有 autoplay 授权时 play() 被拒，部分壁纸会卡在初始化
        iframe.setAttribute('allow', 'autoplay; fullscreen')
        iframe.setAttribute('allowfullscreen', '')
        Object.assign(iframe.style, {
          position: 'absolute', top: '0', left: '0',
          width: '100%', height: '100%', border: '0',
        })
        var layer = document.createElement('div')
        layer.className = 'wbg-layer'
        layer.appendChild(iframe)
        var detach = null   // 移除垫片消息监听（图层被清理时也要摘掉，否则快速切换会累积监听器）
        layers.set(layer, function () {
          if (detach) detach()
          try { iframe.setAttribute('src', 'about:blank') } catch (e) { /* 忽略 */ }
        })
        return new Promise(function (resolve) {
          var done = false
          var onMessage = null
          var gotShim = false
          detach = function () {
            if (onMessage) { window.removeEventListener('message', onMessage); onMessage = null }
          }
          var finish = function () {
            if (done) return
            done = true
            detach()
            if (seq !== applySeq) {
              try { iframe.setAttribute('src', 'about:blank') } catch (e) { /* 忽略 */ }
              return
            }
            crossfade(layer, kind)
            resolve()
            warmNextInQueue()   // 叠化已开始，顺手把下一张也预热好
          }
          onMessage = function (ev) {
            if (origin && ev.origin !== origin) return
            var d = ev.data
            if (!d || d.__wbg !== 1) return
            gotShim = true
            if (d.type === 'painted') finish()
            else if (d.type === 'error' && d.payload) {
              // 壁纸自身脚本报错（跨域页面只能靠垫片转发），留在控制台便于排查黑屏
              try { console.warn('[dsh-wallpaper-bg] 网页壁纸 ' + title + ' 报错：' + d.payload.message) } catch (e) { /* 忽略 */ }
            }
          }
          window.addEventListener('message', onMessage)
          // 先入 DOM（此时图层透明）再设 src：iframe 立刻开始加载
          bgEl.appendChild(layer)
          // 没有垫片（旧版 WE API 服务 / 第三方页面）时的兜底：load 后再留一点渲染时间
          iframe.addEventListener('load', function () { later(finish, 500) })
          iframe.setAttribute('src', url)
          later(finish, 8000)   // 总兜底：绝不让旧壁纸一直挂着
          // 一条 __wbg 消息都收不到 → WE API 服务多半还是旧版（没有属性垫片与 ../ 路径兜底），
          // 这正是网页壁纸黑屏 / 只剩角色像竖屏壁纸的常见原因，提示一次便于用户自查
          later(function () {
            if (gotShim || shimHinted || !/\/files\/\d+\//.test(url)) return
            shimHinted = true
            try {
              console.info('[dsh-wallpaper-bg] 未收到网页壁纸兼容垫片上报：WE API 服务可能是旧版本，'
                + '网页壁纸可能黑屏或缺少背景。升级后双击 wallpaper-engine-api/重启服务(管理员).bat 即可。')
            } catch (e) { /* 忽略 */ }
          }, 2500)
          // 网页壁纸的帧率由页面自身控制（宿主无法限帧）；背景层 pointer-events:none 不拦截交互
        })
      }

      function isDarkTheme() {
        return !!(document.body && document.body.hasAttribute('data-ds-dark-theme'))
      }

      // ---------- 视口色调补偿（窗口缩放时界面颜色不跟着漂移） ----------
      // 背景层是 background-size:cover：窗口尺寸一变，可见裁剪区就换成另一块源图；
      // 而本插件把 DSH 的表面全改成了半透明（bg-base 全透明，layer-1/2 与侧栏 0.5–0.62），
      // 于是界面的实际颜色 = 表面色 × α + 壁纸可见区均值 × (1−α)，会跟着裁剪区的平均亮度
      // 一起漂移：窗口缩小时界面略微变暗、拉回原尺寸又精确复原（裁剪复原 → 颜色复原）。
      // 修法不是把界面糊成不透明，而是给壁纸算一张 32×32 的亮度图，按当前视口把「可见
      // 裁剪区」的均值积出来，反推雾层 / 遮罩的 alpha，使合成结果恒等于「整张壁纸都可见」
      // 时的色调。只改一个 background-color 的 alpha（合成器层面），不碰背景层的像素、
      // 不给它挂 filter，画质与视频帧率都不受影响。
      var TONE_GRID = 32
      var TONE_MAX_ADJUST = 0.22   // 雾层 alpha 最大补偿量；正常壁纸需要 < 0.15，超出就不追了
      var toneMap = null           // { w, h, lum: Float32Array, all: number }
      var toneRaf = 0
      var toneSeq = 0              // 异步补算的作废标记（换壁纸 / 清空背景时作废在途结果）

      /** 把已解码的图缩到 32×32 取亮度；画布被跨域图污染时抛 → 返回 null */
      function toneMapFrom(img) {
        try {
          var w = img.naturalWidth || img.width
          var h = img.naturalHeight || img.height
          if (!w || !h) return null
          var c = document.createElement('canvas')
          c.width = TONE_GRID
          c.height = TONE_GRID
          var cx = c.getContext('2d', { willReadFrequently: true })
          if (!cx) return null
          cx.drawImage(img, 0, 0, TONE_GRID, TONE_GRID)
          var data = cx.getImageData(0, 0, TONE_GRID, TONE_GRID).data
          var lum = new Float32Array(TONE_GRID * TONE_GRID)
          var sum = 0
          for (var i = 0, p = 0; i < lum.length; i++, p += 4) {
            // Rec.709 亮度：与半透明表面相混时，决定「看起来多亮」的就是这个量
            var v = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]
            lum[i] = v
            sum += v
          }
          return { w: w, h: h, lum: lum, all: sum / lum.length }
        } catch (e) {
          return null
        }
      }

      /** 壁纸解码后建一次亮度图。
       *  同源（/asset、blob、本地）一次就成；跨域的内置 Unsplash 图会把 canvas 标脏，
       *  这时再取一份带 CORS 的副本补算一次（同一 URL，命中 HTTP 缓存，不会真的多下一遍）。
       *  该源不支持 CORS 就放弃补偿，行为与旧版完全一致。 */
      function buildToneMap(img) {
        var tm = toneMapFrom(img)
        if (tm) return tm
        var url = (img && img.src) || ''
        if (!url) return null
        var seq = ++toneSeq
        var probe = new Image()
        probe.crossOrigin = 'anonymous'
        probe.onload = function () {
          if (seq !== toneSeq) return    // 已经换过壁纸 / 清空过背景
          var tm2 = toneMapFrom(probe)
          if (!tm2) return
          toneMap = tm2
          paintOverlay()
        }
        probe.onerror = function () { /* 该源没有 CORS 头：这条壁纸不补偿 */ }
        probe.src = url
        return null
      }

      /** 按 cover 的映射关系，积出「当前视口能看见的那块源图」的平均亮度 */
      function visibleMean(tm) {
        // clientWidth/Height 与 position:fixed 元素的包含块一致（都扣掉经典滚动条），
        // innerWidth 会把滚动条算进来，宽高比偏一点就会让补偿量算错。
        var de = document.documentElement
        var fw = (de && de.clientWidth) || window.innerWidth || 1   // 背景层自己的盒子 = 整个视口
        var fh = (de && de.clientHeight) || window.innerHeight || 1
        // cover 用「层的盒子」算缩放比；「安全放大」把整层 scale 了 (1+z)（origin 居中），
        // 可见区域同比缩小，所以可见源区域要按缩小后的尺寸积。
        var z = Math.min(10, Math.max(0, Number(state && state.safeZoom) || 0)) / 100
        var vw = fw / (1 + z)
        var vh = fh / (1 + z)
        var k = Math.max(fw / tm.w, fh / tm.h)   // cover 缩放比
        var sw = vw / k                          // 可见源区域（源图像素）
        var sh = vh / k
        var x0 = (tm.w - sw) / 2                 // background-position:center center
        var y0 = (tm.h - sh) / 2
        var cw = tm.w / TONE_GRID
        var ch = tm.h / TONE_GRID
        var sum = 0
        var weight = 0
        for (var gy = 0; gy < TONE_GRID; gy++) {
          var oy = Math.min(gy * ch + ch, y0 + sh) - Math.max(gy * ch, y0)
          if (oy <= 0) continue
          for (var gx = 0; gx < TONE_GRID; gx++) {
            var ox = Math.min(gx * cw + cw, x0 + sw) - Math.max(gx * cw, x0)
            if (ox <= 0) continue
            var wgt = ox * oy
            sum += tm.lum[gy * TONE_GRID + gx] * wgt
            weight += wgt
          }
        }
        return weight > 0 ? sum / weight : tm.all
      }

      /** 名义浓度（0–100）→ 实际用于合成的 alpha（0–1）；需要时按可见裁剪区补偿 */
      function overlayAlpha(base, dark) {
        var a = Math.min(1, Math.max(0, base / 100))
        // 原生背景模式（用户要的就是完整露出的壁纸）与无亮度图（视频 / 网页 / 跨域）不补偿
        if (!toneMap || (state && state.nativeBackground)) return a
        // 「背景亮度」是挂在背景层上的 brightness()，会等比缩放可见亮度；
        // 参考值与可见值一起乘，补偿量才不会被这个滑杆带偏（blur 不改变均值，不影响）。
        var b = Math.min(150, Math.max(50, Number(state && state.brightness) || 100)) / 100
        var m = visibleMean(toneMap) * b
        var all = toneMap.all * b
        var next
        if (dark) {
          // 深色：黑色遮罩压暗壁纸 → 合成亮度 = (1−a)·m
          if (m < 0.5) return a
          next = 1 - ((1 - a) * all) / m
        } else {
          // 浅色：白色雾层提亮壁纸 → 合成亮度 = a·255 + (1−a)·m
          var target = a * 255 + (1 - a) * all
          if (255 - m < 0.5) return a
          next = (target - m) / (255 - m)
        }
        if (!isFinite(next)) return a
        var out = Math.min(Math.min(1, a + TONE_MAX_ADJUST), Math.max(Math.max(0, a - TONE_MAX_ADJUST), next))
        // 收一下小数位：拖动窗口时每帧写一次 style，避免长尾浮点数白白触发样式失效
        return Math.round(out * 1000) / 1000
      }

      function paintOverlay() {
        if (!state) return
        var dark = isDarkTheme()
        var base = state.nativeBackground
          ? 0
          : Math.min(100, Math.max(0, Number(dark ? state.overlayOpacity : state.lightFog) || 0))
        overlayEl.style.background = (dark ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + overlayAlpha(base, dark) + ')'
      }

      /** 缩放 / 拖动窗口时按帧合并重算：一次只积 32×32 个格子，开销可忽略 */
      function scheduleTone() {
        if (!toneMap || toneRaf) return
        toneRaf = window.requestAnimationFrame(function () {
          toneRaf = 0
          paintOverlay()
        })
      }

      function applyOverlay() {
        // 深色外观 → 黑色压暗遮罩；浅色外观 → 半透明白色雾层（类侧边栏雾感，垫在背景与内容之间提升细字可读性）。
        // 实际 alpha 由 overlayAlpha 补偿：窗口缩放改变可见裁剪区时，界面的合成色调保持不变。
        paintOverlay()
      }
      function setFilter(blurPx, brightnessPct) {
        var blur = Math.min(20, Math.max(0, Number(blurPx) || 0))
        var brightness = Math.min(150, Math.max(50, Number(brightnessPct) || 100))
        // 关键：恒等滤镜（blur(0px) brightness(100%)）并不是「无操作」——它会让背景层无法走
        // GPU 合成，4K 视频实测从 60fps 掉到 22fps。只有真的需要模糊 / 调亮度时才挂 filter。
        bgEl.style.filter = (blur === 0 && brightness === 100)
          ? ''
          : 'blur(' + blur + 'px) brightness(' + brightness + '%)'
        // 亮度会等比缩放背景的可见亮度 → 补偿量要跟着重算（blur 不改均值，无需重算）
        paintOverlay()
      }
      function setZoom(v) {
        var z = Math.min(10, Math.max(0, Number(v) || 0))
        bgEl.style.transform = z > 0 ? 'scale(' + (1 + z / 100) + ')' : ''
        // 放大改变了可见裁剪区 → 顺便重算一次补偿
        paintOverlay()
      }
      function disposeLayer() {
        clearActive()
        clearPreload()
        overlayEl.remove()
        bgEl.remove()
      }

      // ---------- 状态（localStorage 持久化） ----------
      var state = loadState()
      applySurfaceMode()   // 首帧就按持久化的原生背景开关铺好表面覆盖
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
        var wasNativeBackground = !!state.nativeBackground
        var wasPalette = state.palette
        var patchKeys = Object.keys(patch)
        // 只动外观的控件直接改当前图层；applyNow 会重新加载壁纸并交叉淡入，拖滑杆时会闪。
        var appearanceOnlyKeys = ['palette', 'nativeBackground', 'overlayOpacity', 'lightFog', 'blur', 'brightness', 'safeZoom']
        var appearanceOnly = patchKeys.length > 0 && patchKeys.every(function (key) {
          return appearanceOnlyKeys.indexOf(key) >= 0
        })
        state = Object.assign({}, state, patch)
        if (wasNativeBackground !== !!state.nativeBackground || wasPalette !== state.palette) applySurfaceMode()
        saveState()
        emit()
        if (appearanceOnly) {
          if (patchKeys.some(function (key) {
            return key === 'nativeBackground' || key === 'overlayOpacity' || key === 'lightFog'
          })) applyOverlay()
          if (patchKeys.indexOf('blur') >= 0 || patchKeys.indexOf('brightness') >= 0) {
            setFilter(state.blur, state.brightness)
          }
          if (patchKeys.indexOf('safeZoom') >= 0) setZoom(state.safeZoom)
          return
        }
        applyNow().catch(function () { /* 保持当前背景 */ })
      }

      // ---------- 宿主代理调用（同源 fetch） ----------
      function weApiCall(args) {
        var q = new URLSearchParams()
        q.set('action', args.endpoint === 'current' ? 'current' : 'wallpapers')
        if (args.base) q.set('base', args.base)
        if (args.refresh) q.set('refresh', '1')
        // 跟随哪台显示器（设置面板的「跟随显示器」）：auto 就交给服务端判定，别把 auto 传下去
        if (args.monitor && String(args.monitor) !== 'auto') q.set('monitor', String(args.monitor))
        return fetch('/dsh-wallpaper-bg/we?' + q.toString()).then(function (r) { return r.json() })
      }

      /** 拉取一次当前桌面壁纸（只读），并记录到 weCache（供同步状态行 / 显示器下拉显示）
       *  服务端 0.5.1 起会返回 monitor / monitorSource / monitors[]（旧服务只有 current，此时
       *  monitors 为空数组 → 面板不显示显示器下拉，行为与旧版一致）。 */
      function syncCurrent(refresh) {
        return weApiCall({
          endpoint: 'current', base: state.weBase, refresh: refresh, monitor: state.syncMonitor,
        }).then(function (res) {
          if (res && res.ok) {
            if (typeof res.weBase === 'string' && res.weBase) weCache.baseUsed = res.weBase
            weCache.monitor = res.monitor || ''
            weCache.monitorSource = res.monitorSource || ''
            weCache.monitors = Array.isArray(res.monitors) ? res.monitors : []
            if (res.current) {
              weCache.current = res.current
              weCache.currentAt = Date.now()
            }
            emit()   // 状态行 / 显示器下拉随同步结果刷新（面板读的是 weCache）
          }
          return res && res.ok && res.current ? res.current : null
        })
      }

      // ---------- IndexedDB（自定义上传持久化） ----------
      var dbPromise = null
      function openDb() {
        if (dbPromise) return dbPromise
        dbPromise = new Promise(function (resolve, reject) {
          // v2：新增 thumbs 仓（视频首帧缩略图）。缩略图只影响面板网格的显示尺寸，
          // 存的是同一张 320px JPEG —— 落库只是省掉「每次刷新重新解码整个视频」的重复劳动。
          var req = indexedDB.open('dsh-wallpaper-bg', 2)
          req.onupgradeneeded = function () {
            var db = req.result
            if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', { keyPath: 'id' })
            if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' })
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

      // ---------- 缩略图持久化（thumbs 仓）：生成一次，之后刷新直接复用 ----------
      async function idbGetThumb(id) {
        try {
          var db = await openDb()
          return await new Promise(function (resolve, reject) {
            var tx = db.transaction('thumbs', 'readonly')
            var rq = tx.objectStore('thumbs').get(id)
            rq.onsuccess = function () {
              var rec = rq.result
              resolve(rec && rec.blob ? rec.blob : null)
            }
            rq.onerror = function () { reject(rq.error) }
          })
        } catch (e) {
          return null   // 读库失败按「没有缩略图」处理，退回重新生成
        }
      }
      async function idbPutThumb(id, blob) {
        try {
          var db = await openDb()
          await new Promise(function (resolve, reject) {
            var tx = db.transaction('thumbs', 'readwrite')
            tx.objectStore('thumbs').put({ id: id, blob: blob, createdAt: Date.now() })
            tx.oncomplete = function () { resolve() }
            tx.onerror = function () { reject(tx.error) }
          })
        } catch (e) { /* 落库失败不影响本次显示 */ }
      }
      async function idbRemoveThumb(id) {
        try {
          var db = await openDb()
          await new Promise(function (resolve, reject) {
            var tx = db.transaction('thumbs', 'readwrite')
            tx.objectStore('thumbs').delete(id)
            tx.oncomplete = function () { resolve() }
            tx.onerror = function () { reject(tx.error) }
          })
        } catch (e) { /* 忽略 */ }
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
      var weCache = { list: null, current: null, currentAt: 0, monitor: '', monitorSource: '', monitors: [], baseUsed: '', lastRequestedBase: '', discovered: false }
      // 宿主半能力（一次性探测）：/health 的 monitorForward = 宿主半会不会把 monitor 透传给
      // WE API 服务。宿主半随 dsh 启动加载，改完需要重启 dsh 才生效——探测到不支持时就如实提示，
      // 而不是让用户点了下拉却毫无反应。
      var hostCaps = { monitorForward: false, probed: false }
      function probeHostCaps() {
        if (hostCaps.probed) return
        hostCaps.probed = true
        fetch('/dsh-wallpaper-bg/health').then(function (r) { return r.json() }).then(function (res) {
          hostCaps.monitorForward = !!(res && res.monitorForward)
          emit()
        }).catch(function () { /* 探测失败按「不支持」处理（旧宿主半没有该路由） */ })
      }
      /** 吸收一次 WE 列表响应：缓存列表与实际基地址（宿主半可能经插件自动发现换了端口） */
      function noteWeList(res) {
        if (!res || !res.ok) return
        weCache.list = res.wallpapers || []
        weCache.discovered = res.discovered === true
        if (typeof res.weBase === 'string' && res.weBase) weCache.baseUsed = res.weBase
      }
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
          if (token === applyToken) {
            applyImage(w.url).catch(function () {
              // 本地 full 缺失（旧包 / 资源未发布）时回退 Unsplash
              if (token !== applyToken) return
              applyImage(w.remoteUrl).catch(function () { /* 保持当前背景 */ })
            })
          }
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
            applyScene(item)
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
              noteWeList(resQ)
              listQ = weCache.list
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
          // 桌面同步 = 只读跟随桌面当前壁纸，再走下面统一的「按类型渲染」：
          // 场景 → 工坊预览图（preview.gif / preview.jpg）、视频 → 视频、图片 → 图片、网页 → iframe。
          // 不采样桌面画面、不本地渲染、不产生任何缓存文件；取到的壁纸同时供同步状态行显示。
          var cur = await syncCurrent(false)
          if (token !== applyToken) return
          item = cur || null
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

      // ---------- 桌面壁纸同步轮询（30 秒；页面不可见时停表） ----------
      // 旧实现在后台 / 最小化时照样每 30 秒发一次请求（每个标签页每天约 2880 次），
      // 而且每次都 emit() 触发一次面板重渲染。hidden 时停表、visible 时立刻同步并重新起表：
      // 既省掉无用请求，又保住「切回页签立即跟随」这个既有行为（见下面的 onVisible）。
      var syncIv = null
      var SYNC_POLL_MS = 30000
      function stopSyncPolling() {
        if (syncIv) { window.clearInterval(syncIv); syncIv = null }
      }
      function startSyncPolling() {
        stopSyncPolling()
        if (document.visibilityState === 'hidden') return
        syncIv = window.setInterval(function () {
          if (state.source !== 'we' || !state.syncDesktop) return
          syncCurrent(true).then(function (item) {
            if (!item) return
            emit() // 同步状态行：标题 / 上次同步时间（即使壁纸没变也刷新时间戳）
            if (String(state.wallpaperId) !== String(item.id)) {
              state.wallpaperId = item.id
              saveState()
              applyNow().catch(function () { /* 忽略 */ })
            }
          }).catch(function () { /* 忽略 */ })
        }, SYNC_POLL_MS)
      }
      startSyncPolling()

      /** 立即检查一次桌面壁纸（手动「立即刷新」/ 页面重新可见时触发），变化则跟随 */
      function syncNow(refresh) {
        if (state.source !== 'we' || !state.syncDesktop) return Promise.resolve(null)
        return syncCurrent(!!refresh).then(function (item) {
          if (!item) return null
          var id = String(item.id)
          if (String(state.wallpaperId) !== id) {
            state.wallpaperId = id
            saveState()
            return applyNow().then(function () { return item }, function () { return item })
          }
          // 壁纸没变也刷新一次状态行（「立即刷新」要有即时反馈：上次同步时间 / 标题）
          emit()
          return item
        }).catch(function () { return null })
      }
      // 页面重新可见时立刻跟一次并重新起表；切到后台则停表（见 startSyncPolling 的注释）
      var onVisible = function () {
        if (document.visibilityState === 'visible') {
          startSyncPolling()
          syncNow(true)
        } else {
          stopSyncPolling()
        }
      }
      document.addEventListener('visibilitychange', onVisible)

      // ---------- 设置面板 ----------
      var objUrlCache = new Map()

      // ---------- 视频首帧缩略图（内存缓存，刷新后重新生成；并发受限，失败不重试） ----------
      var vidThumbCache = new Map()   // id -> objectURL（本次会话）
      var vidThumbQueue = []          // 待生成的记录
      var vidThumbFailed = new Set()  // 生成失败的 id
      var vidThumbLoading = new Set() // 正在读库 / 生成中的 id（去重，避免重复排队）
      var vidThumbRunning = 0
      var vidThumbNotify = null       // 当前面板挂载的重渲染回调（thumb 生成完成后调用）
      var VID_THUMB_MAX_RUNNING = 3
      function vidThumbUrlOf(u) {
        return u ? (vidThumbCache.get(u.id) || '') : ''
      }
      /** 缩略图三级取用：内存 → IndexedDB（刷新后直接复用）→ 都没有才重新解码视频生成。
       *  旧实现只有内存一级，于是每次刷新页面都要把每个视频重新读一遍 + 解码首帧（实测 2 s/个）。 */
      function ensureVideoThumbs(list, notify) {
        if (typeof notify === 'function') vidThumbNotify = notify
        ;(list || []).forEach(function (u) {
          if (!isVideoUpload(u) || vidThumbCache.has(u.id) || vidThumbFailed.has(u.id)) return
          if (vidThumbLoading.has(u.id)) return
          vidThumbLoading.add(u.id)
          enqueueVideoThumb(u, true)
        })
      }
      /** 先查库；库里有就直接建 objectURL 显示，省掉「读整个视频 + 解码首帧」的重复开销 */
      function enqueueVideoThumb(u, fromStore) {
        var start = function () {
          if (vidThumbQueue.some(function (x) { return x.id === u.id })) { pumpVideoThumbs(); return }
          vidThumbQueue.push(u)
          pumpVideoThumbs()
        }
        if (!fromStore) { start(); return }
        idbGetThumb(u.id).then(function (blob) {
          if (blob && blob.size > 0) {
            vidThumbCache.set(u.id, URL.createObjectURL(blob))
            if (vidThumbNotify) vidThumbNotify()
            return
          }
          start()
        }, function () { start() })   // 读库失败也照常生成
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
                  idbPutThumb(u.id, blob)   // 落库：下次刷新直接复用，不再解码整个视频
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

      // ---------- 主页面开关：原生背景（清雾层 / 遮罩 / 页面表面覆盖，完整露出壁纸） ----------
      function NativeBackgroundControl() {
        var snapshotState = React.useState(Object.assign({}, state))
        var snap = snapshotState[0]
        var setSnap = snapshotState[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var enabled = !!snap.nativeBackground
        return React.createElement('button', {
          type: 'button',
          className: 'wbg-native-toggle',
          role: 'switch',
          'aria-checked': enabled,
          'aria-label': '原生背景',
          title: enabled ? '原生背景：开（点击恢复雾层 / 遮罩）' : '原生背景：关（点击完整露出壁纸）',
          onClick: function () { setState({ nativeBackground: !enabled }) },
        }, React.createElement('span', { className: 'wbg-native-toggle-thumb' }))
      }

      // ---------- 通用设置 → 外观区：全局主题配色（蓝粉 / 经典） ----------
      // 与 浅色 / 深色 / 跟随系统 并列，而不是藏在壁纸面板里。配色与明暗是两条轴：
      // 明暗仍由 DSH 的外观决定，这里只决定「用哪套色相」。
      function PaletteRow() {
        var snapState = React.useState(state)
        var snap = snapState[0]
        var setSnap = snapState[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var current = snap.palette || DEFAULTS.palette
        function cube(value, label, swatchClass) {
          return React.createElement('button', {
            type: 'button',
            className: 'wbg-theme-cube' + (current === value ? ' wbg-theme-cube-selected' : ''),
            'aria-pressed': current === value,
            onClick: function () { setState({ palette: value }) },
          },
            React.createElement('span', { className: 'wbg-theme-swatch ' + swatchClass }),
            label,
          )
        }
        return React.createElement('div', { className: 'wbg-theme-row' },
          React.createElement('div', { className: 'wbg-theme-title' }, '主题配色'),
          React.createElement('div', { className: 'wbg-theme-cubes' },
            cube('azureRose', '蓝粉', 'wbg-theme-swatch-azure'),
            cube('classic', '经典', 'wbg-theme-swatch-classic'),
          ),
        )
      }

      function WallpaperPanel(props) {
        var snapState = React.useState(state)
        var snap = snapState[0]
        var setSnap = snapState[1]
        var uploadsState = React.useState([])
        var uploads = uploadsState[0]
        var setUploads = uploadsState[1]
        var uploadErrorState = React.useState('')
        var uploadError = uploadErrorState[0]
        var setUploadError = uploadErrorState[1]
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
        var panelRef = React.useRef(null)

        // ---------- 网格记忆化 ----------
        // setState 无条件 emit()，而面板订阅了它 —— 于是「拖动外观滑杆」（雾层 / 遮罩 / 模糊 /
        // 亮度 / 安全放大）每一次 onChange 都会让整个面板重渲染一次。不做记忆化的话，WE 页签下
        // 每一帧都会把网格里几百个 tile 全部重建（实测 314 张 = 10 ms/帧，且随壁纸库规模线性变差）。
        // 这里按「真正影响网格内容」的字段缓存节点：外观字段不进依赖，拖滑杆时节点引用不变，
        // React 直接跳过整棵子树的 diff，而滑杆本身的数值显示照常刷新。
        // 注意：依赖必须列全网格渲染真正读到的 snap 字段，漏一个就会显示陈旧的高亮态。
        var weGridNode = React.useMemo(function () {
          return weGrid()
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [weList, weLoading, weError, weTypeFilter, weRatingFilter, snap.wallpaperId, snap.syncDesktop, snap.weQueueEnabled, snap.weBase])
        var customGridNode = React.useMemo(function () {
          return customGrid()
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [uploads, uploadsVersion, snap.wallpaperId])
        var builtinGridNode = React.useMemo(function () {
          return builtinGrid()
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [snap.wallpaperId])

        React.useEffect(function () {
          probeHostCaps()   // 显示器下拉要不要可用，取决于宿主半版本（只探测一次）
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])

        // 设置弹窗对比度：标记包含壁纸面板的 dialog，供不支持 :has() 的浏览器回退使用。
        // 只影响这个弹窗；面板卸载（切到其他设置页）时移除标记，表面恢复原值。
        React.useEffect(function () {
          var node = panelRef.current
          var dlg = node && typeof node.closest === 'function' ? node.closest('[role="dialog"]') : null
          if (!dlg) return
          dlg.setAttribute('data-wbg-settings', '')
          return function () { dlg.removeAttribute('data-wbg-settings') }
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
          weCache.lastRequestedBase = String(base || '').replace(/\/+$/, '') || DEFAULTS.weBase
          weCache.discovered = false
          setWeLoading(true)
          setWeError(null)
          try {
            var res = await weApiCall({ endpoint: 'wallpapers', base: base, refresh: force === true })
            if (!res || !res.ok) {
              setWeError(String((res && res.error) || 'Wallpaper Engine API 不可达'))
              return
            }
            noteWeList(res)
            setWeList(weCache.list)
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

        /** 上传前先让浏览器真正解码一次：损坏 / 编码不受支持的文件在这里拦下，而不是存进去后黑屏 */
        function probeUpload(file, isVideo) {
          return new Promise(function (resolve) {
            var url = URL.createObjectURL(file)
            var el = null
            var settled = false
            var timer = setTimeout(function () { finish(false) }, isVideo ? 10000 : 8000)
            function finish(ok) {
              if (settled) return
              settled = true
              clearTimeout(timer)
              try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
              el = null
              resolve(ok)
            }
            if (isVideo) {
              el = document.createElement('video')
              el.preload = 'metadata'
              el.onloadedmetadata = function () { finish(el.videoWidth > 0 && el.videoHeight > 0) }
              el.onerror = function () { finish(false) }
            } else {
              el = new Image()
              el.onload = function () { finish(true) }
              el.onerror = function () { finish(false) }
            }
            el.src = url
          })
        }

        async function onFiles(event) {
          var input = event.target
          var files = input.files
          if (!files || !files.length) return
          var accepted = []
          var rejected = []
          Array.from(files).forEach(function (file) {
            var mime = String(file.type || '').toLowerCase()
            var name = String(file.name || '')
            var isImage = mime.indexOf('image/') === 0 || /\.(jpe?g|png|gif|webp|bmp|avif|ico)$/i.test(name)
            var isVideo = mime.indexOf('video/') === 0 || /\.(mp4|webm|mkv|mov|m4v|avi|ogv)$/i.test(name)
            if (!isImage && !isVideo) { rejected.push(name || '(未命名文件)'); return }
            if (!file.size) { rejected.push((name || '(未命名文件)') + '（空文件）'); return }
            accepted.push({ file: file, isVideo: isVideo })
          })
          for (var i = 0; i < accepted.length; i++) {
            var item = accepted[i]
            var ok = await probeUpload(item.file, item.isVideo)
            if (!ok) {
              rejected.push(item.file.name + '（无法解码，文件可能损坏或编码不受支持）')
              continue
            }
            try {
              await idbPut({
                id: 'up-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                name: item.file.name,
                mime: item.file.type || 'application/octet-stream',
                blob: item.file,
                createdAt: Date.now(),
              })
            } catch (e) {
              rejected.push(item.file.name + '（写入本地库失败）')
            }
          }
          setUploadError(rejected.length
            ? '已跳过这些文件：' + rejected.join('、') + '。只收浏览器能直接解码的图片 / 视频。'
            : '')
          setUploadsVersion(function (v) { return v + 1 })
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
          vidThumbLoading.delete(id)
          idbRemoveThumb(id)   // 落库的缩略图跟着一起删，避免留孤儿记录
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
          var children = []
          // 内置壁纸的占位层：本地缩略图到达前也有内容，不再是一块空白卡片
          if (cfg.placeholder) {
            children.push(React.createElement('div', { className: 'wbg-tile-ph wbg-ph-abs', 'aria-hidden': 'true' }, cfg.placeholder))
          }
          if (cfg.thumb) {
            var imgProps = {
              src: cfg.thumb,
              alt: cfg.title,
              draggable: 'false',
              loading: cfg.loading || 'lazy',
              decoding: 'async',
            }
            if (cfg.fade) {
              imgProps.className = 'wbg-fade-img'
              imgProps.onLoad = function (e) { e.currentTarget.classList.add('wbg-img-ready') }
              imgProps.onError = function (e) {
                var img = e.currentTarget
                // 本地缩略图缺失（旧包 / 资源未发布）时回退到 Unsplash；再失败就保留占位层
                if (!img.dataset.wbgFallback && cfg.thumbFallback) {
                  img.dataset.wbgFallback = '1'
                  img.src = cfg.thumbFallback
                  return
                }
                img.classList.add('wbg-img-failed')
              }
            }
            children.push(React.createElement('img', imgProps))
          } else {
            children.push(React.createElement('div', { className: 'wbg-tile-ph' }, cfg.title.slice(0, 1)))
          }
          children.push(React.createElement('div', { className: 'wbg-tile-name' }, cfg.title))
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
          // 已填充比例：驱动轨道的蓝→粉渐变在拇指处结束，右侧保持中性色
          var span = Number(opts.max) - Number(opts.min)
          var pct = span > 0 ? ((Number(opts.value) - Number(opts.min)) / span) * 100 : 0
          pct = Math.max(0, Math.min(100, pct))
          return React.createElement('div', { className: 'wbg-row' },
            React.createElement('label', null, opts.label),
            React.createElement('input', {
              type: 'range',
              min: opts.min,
              max: opts.max,
              step: 1,
              value: opts.value,
              'aria-label': opts.label,
              style: { '--wbg-range-p': pct.toFixed(2) + '%' },
              onChange: function (e) { opts.onChange(Number(e.target.value)) },
            }),
            React.createElement('span', { className: 'wbg-val' }, opts.value + opts.unit),
          )
        }

        function builtinGrid() {
          return React.createElement('div', { className: 'wbg-grid' },
            BUILTIN_ITEMS.map(function (w, index) {
              return tile({
                key: w.id,
                title: w.title,
                thumb: w.thumbnail || w.url,
                thumbFallback: w.remoteThumbnail,
                placeholder: w.title.slice(0, 1),
                fade: true,
                loading: index < 4 ? 'eager' : 'lazy',
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

        /** 服务连不上时的基准地址：优先显示本次实际请求的地址；与上次成功地址不同时一并说明 */
        function weBaseUrl() {
          var requested = weCache.lastRequestedBase || snap.weBase || DEFAULTS.weBase
          var used = weCache.baseUsed
          if (used && used !== requested) return requested + '，上次成功 ' + used
          return requested
        }

        function statusPathNode() {
          return React.createElement('code', null, '/dsh-wallpaper-engine-api/status')
        }

        /**
         * 服务曾经连上过、之后断掉，列表还在缓存里时的横幅。
         * 优先引导装插件（一条命令、随 DSH 启停），不再让人 clone / npm install / 配开机自启。
         */
        function weStaleBar() {
          if (!weError || !weList) return null
          return React.createElement('div', { className: 'wbg-stale' },
            React.createElement('span', null, '⚠'),
            React.createElement('span', null,
              '连不上 WE API 服务（' + weBaseUrl() + '）——下方列表是上次的缓存，可能已过期。'
              + '装过 dsh-wallpaper-engine-api 插件的话，先打开 ',
              statusPathNode(),
              ' 看 base / error，再点「刷新」；'
              + '还没装的话，在「设置 → 插件」里安装 dsh-wallpaper-engine-api（或命令行 '
              + 'dsh plugin --profile <你的 profile> add dsh-wallpaper-engine-api）后重启 DSH。'))
        }

        function weGrid() {
          var list = weList
          if (weLoading && !list) return React.createElement('div', { className: 'wbg-hint' }, '正在从 Wallpaper Engine 读取壁纸库…')
          if (weError && !list) {
            // 从没成功加载过 → 按「最常见到最少见」给三步，且默认只需要装一个插件：
            // ① 没装插件（最常见）② 装了但启动失败 / 没启用 ③ 仍连不上时的排查入口
            return React.createElement('div', { className: 'wbg-error' },
              weError + '。',
              React.createElement('br'),
              '① 没装（最常见）：打开「设置 → 插件」，安装 dsh-wallpaper-engine-api 后重启 DSH；'
              + '命令行等价于 dsh plugin --profile web add dsh-wallpaper-engine-api（桌面端用 --profile desktop）。'
              + '装好后不需要 clone 仓库、npm install、启动 .bat 或设置开机自启——服务随 DSH 启停。',
              React.createElement('br'),
              '② 装了但连不上：打开 ',
              statusPathNode(),
              ' 看 error；端口被无关程序占用时插件会自动换端口，主插件也会自动发现，一般只需点「刷新」。',
              React.createElement('br'),
              '③ 仍不行：确认该插件在当前 profile 已启用；或把上方基地址显式指向旧的手动服务（默认 http://127.0.0.1:8088）。'
              + '（不需要 WE 壁纸库可以忽略本提示：内置壁纸与自定义上传都不依赖它。）')
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

        /** 类型中文名（WE 的 type / 插件 kind 共用一份词表） */
        function kindLabelOf(kind) {
          var k = String(kind || '').toLowerCase()
          if (k === 'video') return '视频'
          if (k === 'scene') return '场景'
          if (k === 'web') return '网页'
          if (k === 'image') return '图片'
          return '未知'
        }

        /** 服务端 monitorSource → 为什么跟的是这台显示器（多屏时用户最需要看到的信息） */
        function monitorSourceLabel(source) {
          if (source === 'manual') return '手动指定'
          if (source === 'changed') return '自动：最近换过壁纸的那台'
          if (source === 'live') return '自动：正在被读取 / 播放的那台'
          if (source === 'first') return '自动：默认第一台'
          return ''
        }

        /** 同步状态行（「同步桌面壁纸」开启时在 WE 页签显示）：正在跟随的桌面壁纸 / 类型 /
         *  跟随的显示器与判定依据 / 上次同步时间；跟随到场景时说明页面显示的是工坊预览图 */
        function syncStatusLine() {
          var cur = weCache.current
          var parts = []
          if (cur) {
            parts.push('正在跟随桌面：' + (cur.title || cur.id) + '（' + kindLabelOf(cur.kind) + '）')
          } else {
            parts.push('尚未获取到当前桌面壁纸（WE 未运行或桌面未设置壁纸）')
          }
          if (weCache.monitor) {
            var src = monitorSourceLabel(weCache.monitorSource)
            parts.push('显示器 ' + weCache.monitor + (src ? '（' + src + '）' : ''))
          }
          if (weCache.currentAt) {
            var d = new Date(weCache.currentAt)
            parts.push('上次同步 ' + [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return n < 10 ? '0' + n : n }).join(':'))
          }
          var children = [
            React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } }, parts.join(' · ')),
          ]
          // 跟随到场景壁纸：如实说明页面显示的是工坊预览图（动态的只有 preview.gif），不是实时画面；
          // 预览图本身很小（常见 192×192）时点明实际像素，免得被当成「缓存里的旧图 / 没生效」
          if (cur && cur.kind === 'scene') {
            var ps = cur.previewSize
            var sizeNote = ps ? '实测 ' + ps.w + '×' + ps.h + ' 像素，全屏放大后必然发虚。' : ''
            children.push(React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
              '场景壁纸不做本地渲染：页面显示它的工坊预览图（preview.gif 会动 / preview.jpg）。' + sizeNote +
              '想要完整保真的动态画面，可用 WE 托盘菜单的屏幕录制（或 OBS）录成 MP4，再从「自定义上传」导入播放。'))
          }
          // 跟随显示器：服务端 0.5.1 起返回 monitors[]（多显示器用户可显式指定，避免跟到另一台屏的旧壁纸）
          if (weCache.monitors.length > 1) {
            var known = weCache.monitors.map(function (m) { return String(m.key) })
            var picked = String(snap.syncMonitor || 'auto')
            // 选项文案保持短（只放键 + 类型 + 是否正在播放）：完整标题在下方的状态行里，
            // 选项里塞长标题会把 <select> 撑宽、压住同一行的按钮
            var options = [React.createElement('option', { key: 'auto', value: 'auto' }, '自动（推荐）')]
            if (picked !== 'auto' && known.indexOf(picked) < 0) {
              options.push(React.createElement('option', { key: picked, value: picked }, picked + '（当前不可用）'))
            }
            weCache.monitors.forEach(function (m) {
              options.push(React.createElement('option', { key: String(m.key), value: String(m.key) },
                String(m.key) + '（' + kindLabelOf(m.type) + '）' + (m.live ? ' · 正在播放' : '')))
            })
            children.push(React.createElement('div', { className: 'wbg-sync' },
              React.createElement('span', { className: 'wbg-hint' }, '跟随显示器'),
              React.createElement('select', {
                value: picked,
                disabled: !hostCaps.monitorForward,
                title: '自动 = 按「最近换过壁纸的那台 / 正在播放的那台」判定；也可显式指定某台显示器',
                onChange: function (e) {
                  var v = e.target.value
                  setState({ syncMonitor: v })
                  syncNow(true)   // 立刻按新选择同步一次，不用等 30 秒轮询
                },
              }, options),
            ))
            // 宿主半（随 dsh 启动加载）还是旧版 → monitor 参数不会被透传，选择不生效，如实说明
            if (!hostCaps.monitorForward) {
              children.push(React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
                '（当前 dsh 里加载的宿主半是旧版：指定显示器需要重启 dsh 后才生效；在此之前一律按「自动」跟随）'))
            }
          }
          children.push(React.createElement('button', {
            type: 'button', className: 'wbg-btn', style: { flex: '0 0 auto' },
            onClick: function () { syncNow(true) },
          }, '立即刷新'))
          return React.createElement('div', { className: 'wbg-row', style: { flexWrap: 'wrap', gap: '8px' } }, children)
        }

        return React.createElement('div', { className: 'wbg-panel', ref: panelRef },
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

          panelSource === 'custom' && uploadError
            ? React.createElement('div', { className: 'wbg-error', style: { marginTop: '8px' } }, uploadError)
            : null,

          panelSource === 'we'
            ? React.createElement('div', { className: 'wbg-actions' },
                React.createElement('input', {
                  className: 'wbg-input',
                  value: weBaseDraft,
                  placeholder: 'http://127.0.0.1:8088（装 WE API 插件时保持默认）',
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
                weCache.discovered && weCache.baseUsed && weCache.baseUsed !== (weBaseDraft || snap.weBase || DEFAULTS.weBase)
                  ? React.createElement('span', { className: 'wbg-hint' }, '已自动发现实际服务：' + weCache.baseUsed)
                  : null,
                React.createElement('label', { className: 'wbg-switch' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: snap.syncDesktop,
                    // 开启同步属于「WE 壁纸库」的显式操作：来源切到 we、退出 WE 队列才会生效
                    onChange: function (e) { setState({ source: 'we', syncDesktop: e.target.checked, weQueueEnabled: false }) },
                  }),
                  '同步桌面壁纸',
                ),
                React.createElement('span', { className: 'wbg-hint' }, '开启后只读跟随 Wallpaper Engine 当前桌面壁纸：桌面换一张、页面对上（30 秒轮询，切回页签立即跟随）。场景显示它的工坊预览图，视频 / 图片 / 网页按各自方式渲染；不修改桌面，不产生缓存文件。多显示器会自动判定跟随哪台（最近换过壁纸 / 正在播放的那台），也可在下方状态行改成指定显示器'),
                snap.syncDesktop ? syncStatusLine() : null,
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

          panelSource === 'builtin' ? builtinGridNode : null,
          panelSource === 'custom'
            ? React.createElement(React.Fragment, null, queueSection('custom'), customGridNode)
            : null,
          panelSource === 'we'
            ? React.createElement(React.Fragment, null, queueSection('we'), weStaleBar(), weGridNode)
            : null,

          sliderRow({ label: '浅色雾层', value: snap.lightFog, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ lightFog: n }) } }),
          sliderRow({ label: '深色遮罩', value: snap.overlayOpacity, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ overlayOpacity: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '浅色外观铺白色雾层、深色外观压深色遮罩，随主题自动切换；雾层位于背景与内容之间，提升细字可读性。开启主页面「原生背景」时暂时忽略这些数值，关闭后恢复。'),
          sliderRow({ label: '背景模糊度', value: snap.blur, min: 0, max: 20, unit: 'px', onChange: function (n) { setState({ blur: n }) } }),
          sliderRow({ label: '背景亮度', value: snap.brightness, min: 50, max: 150, unit: '%', onChange: function (n) { setState({ brightness: n }) } }),
          sliderRow({ label: '安全放大', value: snap.safeZoom, min: 0, max: 10, unit: '%', onChange: function (n) { setState({ safeZoom: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '安全放大：在画面四周裁掉 1–10% 边缘，用于去除视频/图片自带的黑边。'),

          // ---------- 场景壁纸说明（不本地渲染、不采样桌面） ----------
          React.createElement('div', { className: 'wbg-row', style: { flexWrap: 'wrap', gap: '8px' } },
            React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
              '场景壁纸一律显示 WE 自带的工坊预览图（preview.gif 会动 / preview.jpg），不做本地渲染、不采样桌面画面、不产生任何缓存文件。' +
              '想要 100% 保真的动态场景：用 WE 托盘菜单的屏幕录制（或 OBS）录 30 秒左右导出 MP4，再从「自定义上传」传进来播放。'),
          ),

          React.createElement('div', { className: 'wbg-actions' },
            React.createElement('button', { type: 'button', className: 'wbg-btn', onClick: resetAll }, '恢复默认'),
            React.createElement('span', { className: 'wbg-hint' }, '背景层独立于桌面 Wallpaper Engine，切换不会影响桌面壁纸'),
          ),
        )
      }

      // ---------- 注册主页面开关（conversation.header.leading：根作用域，空白首页与会话页都可见） ----------
      slots.inject('conversation.header.leading', function () {
        return slots.register(
          { name: 'conversation.header.leading', priority: -1 },
          function () { return React.createElement(NativeBackgroundControl) },
        )
      })

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

      // ---------- 注册「通用设置 → 外观」之后的主题配色行 ----------
      // order 10.5：外观是 10、字体大小是 11，插在两者之间，视觉上属于外观区。
      slots.inject('settings.general.item', function () {
        return slots.register(
          { name: 'settings.general.item', id: 'wallpaper-palette', order: 10.5 },
          function () { return React.createElement(PaletteRow) },
        )
      })

      // ---------- 清理与启动 ----------
      ctx.effect(function () {
        return function () {
          stopSyncPolling()
          window.removeEventListener('resize', onWindowResize)
          if (toneRaf) { window.cancelAnimationFrame(toneRaf); toneRaf = 0 }
          document.removeEventListener('visibilitychange', onVisible)
          clearQueueTimer()
          if (themeObserver) themeObserver.disconnect()
          if (brandObserver) brandObserver.disconnect()
          if (brandPaintRaf) { window.cancelAnimationFrame(brandPaintRaf); brandPaintRaf = 0 }
          if (document.body) {
            document.body.removeAttribute('data-dshw-native-bg')
            document.body.removeAttribute('data-dshw-palette')
          }
          disposeLayer()
          // 面板侧的两个 objectURL 缓存必须显式释放：它们各自把一份 blob 钉在内存里，
          // 旧实现只在「删除单张壁纸」时 revoke，卸载 / 关面板时全部泄漏。
          // （正在当背景显示的那一个由 disposeLayer → clearActive 处理，这里只收面板网格的。）
          objUrlCache.forEach(function (url) { try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ } })
          objUrlCache.clear()
          vidThumbCache.forEach(function (url) { try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ } })
          vidThumbCache.clear()
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
