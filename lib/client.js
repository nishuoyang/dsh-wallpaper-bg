/**
 * dsh-wallpaper-bg v0.6.1 — 浏览器半（单文件 client bundle）
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
    // 「任务面板底色」层用的颜色 = DSH 菜单材质在深色主题下的实测值（--dsw-menu-surface-fill: #43454a73）。
    // 浅色主题下 DSH 那边是 #f8f9fa94（近白），但这一层的用途是「统一成有任务时那种偏暗的底色」，
    // 所以两个主题都用深色值 —— 需要更淡/更浓时改这一处即可。
    var TASK_TINT_RGBA = 'rgba(67,69,74,0.45)'
    var TASK_TINT_BLUR = 'blur(40px) saturate(150%)'
    var DEFAULTS = {
      source: 'builtin',
      wallpaperId: 'builtin-1',
      weBase: 'http://127.0.0.1:8088',
      syncDesktop: false,
      // 跟随哪台显示器：'auto' = 由 WE API 服务自动判定（多屏别盲取 Monitor0）；'MonitorN' = 显式指定
      syncMonitor: 'auto',
      // 场景壁纸实时渲染（0.6.0）：在页面里用 WebGL2 直接渲染工坊的 scene.pkg。
      // 关掉 / 宿主半不支持 / 渲染器加载失败 / 首帧超时 → 一律回退工坊预览图（preview.gif）。
      sceneLive: true,
      // 场景渲染帧率上限（10–60）：越高越流畅也越费电，笔记本默认 30
      sceneFps: 30,
      // 场景渲染质量档位（0.6.1）：high = 全默认（renderDpr 跟随设备 + 粒子/后处理 high，
      // autoQuality 的自动降档逻辑不变）；medium / low = 显式压 renderDpr + 粒子/后处理档位。
      // 依据：webwallgl 上游实测 4K 屏上画布与效果链 FBO 才是显存大头（随 DPR² 增长），
      // 纹理反而是其次（vendor/webwallgl/UPSTREAM-README.md「显存与清晰度」）。
      sceneQuality: 'high',
      overlayOpacity: 40,
      lightFog: 55,
      // 原生背景：临时清掉雾层 / 遮罩与页面表面覆盖，完整露出壁纸（输入框与弹窗仍保留可读底色）
      nativeBackground: false,
      // 清任务面板玻璃：把任务那一栏 / 工具卡片 / 分析卡片 / 菜单垫的深色磨砂底（--dsw-specific-menu
      // 与它引用的 --dsw-menu-surface-fill、外加 blur(40px) 的 backdrop-filter）清成透明，让壁纸直接透出来。
      // 这些表面是**浮在内容之上**的，清得太干净会压低细字可读性，所以默认关。
      clearPanelGlass: false,
      // 统一任务底色：默认关。开启后所有会话都铺一层「有任务时那种底色」——
      // 等价于把 DSH 菜单材质（深色下 #43454a73 + blur(40px) saturate(150%)）铺满整个背景。
      // 用独立的一层做，而不是改某个面板的 token：这样它只作用于背景（壁纸之上、所有界面之下），
      // 不会影响任何文字与控件的对比度；也不与「清任务面板玻璃」冲突（后者清的是各面板自己的底）。
      taskTint: false,
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
      '#dsh-wallpaper-bg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;overflow:hidden;pointer-events:none;background-color:#0b0d12;background-position:center center;background-size:cover;background-repeat:no-repeat;transition:transform .2s ease;}' +
      // 切换壁纸用「双层交叉淡入淡出」：新壁纸先离屏解码 / 起播，再与旧壁纸叠化，避免中途空窗闪黑
      // 视频层内是 <video object-fit:cover>（由合成器缩放，避免 canvas 每帧重绘在 4K 下拖慢帧率）
      // 关键：近黑底色 #0b0d12 挂在**容器**上，不能挂在图层上——图层带不透明底色时，
      // 只要它自己的内容还没画出来（视频首帧尤其慢），叠化期间露出的就是这块近黑，
      // 「两个视频之间切换」最明显。底色留在容器上，图层全透明，旧壁纸就能一直透在下面。
      '#dsh-wallpaper-bg>.wbg-layer{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transition:opacity .42s ease;background-position:center center;background-size:cover;background-repeat:no-repeat;}' +
      '#dsh-wallpaper-bg>.wbg-layer>video{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;}' +
      '#dsh-wallpaper-task-tint{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;}' +
      '#dsh-wallpaper-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;background:rgba(0,0,0,0.4);transition:background .2s ease;}' +
      // 「清任务面板玻璃」：任务那一栏（conversation.input.dock）、工具卡片、分析卡片、菜单与任务浮层
      // 垫的都是 DSH 的菜单材质 —— Windows 深色下 --dsw-menu-surface-fill = #43454a73（深色底、仅 45% 不透明）
      // 再叠 backdrop-filter: blur(40px) saturate(150%)。叠在「壁纸 × 深色遮罩」上就压成一片 ~44 的暗面。
      // 这些材质走的是 token，插件的表面覆盖（bg-base / bg-layer-*）管不到，所以这里单独清。
      // 注入的 <style> 在文档里晚于 DSH 自己的主题样式，body 前缀的同名声明按顺序取胜；
      // !important 只是防主题里带 !important 的规则翻盘（实测没有，但这是个廉价保险）。
      'body[data-dshw-clear-panel="true"]{--dsw-specific-menu:transparent !important;--dsw-menu-surface-fill:transparent !important;--dsw-menu-backdrop-filter:none !important;}' +
      'body[data-dshw-clear-panel="true"]{--dsw-alias-menu-group-header-fill:transparent !important;}' +
      // 「统一任务底色」层：铺在壁纸之上、所有界面之下（z-index:-1 的第三层，按 DOM 顺序盖在
      // 壁纸与遮罩之上）。背景色与模糊都对齐 DSH 菜单材质；backdrop-filter 把底下的壁纸糊掉，
      // 正好复现「有任务时」那种磨砂底，同时不动任何前景文字的对比度。
      'body[data-dshw-task-tint="true"] #dsh-wallpaper-task-tint{background:' + TASK_TINT_RGBA + ';backdrop-filter:' + TASK_TINT_BLUR + ';-webkit-backdrop-filter:' + TASK_TINT_BLUR + ';}' +
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
      // 主页面「原生背景」开关：DSH 主题令牌 + 完整胶囊圆角（corner-shape 是渐进增强，老内核忽略）
      // 注意：拇指颜色不能用 --dsw-alias-switch-thumb —— 本版 DSH 没有这个令牌（实测解析为空 → 拇指透明不可见），
      // 这里用内置静态色兜底：浅色/深色轨道上都用白拇指，深色主题「开启」时按 DSH 习惯换成深色拇指。
      '.wbg-native-toggle{position:relative;display:inline-flex;align-items:center;width:44px;height:24px;flex:none;padding:0;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-state-idle-primary);cursor:pointer;transition:background .18s ease;}' +
      '.wbg-native-toggle[aria-checked="true"]{background:var(--dsw-alias-brand-primary);}' +
      '.wbg-native-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;}' +
      '.wbg-native-toggle-thumb{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;corner-shape:round;background:var(--dsw-static-neutral-00,#fff);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s ease,background .18s ease;}' +
      '.wbg-native-toggle[aria-checked="true"] .wbg-native-toggle-thumb{transform:translateX(20px);}' +
      'body[data-ds-dark-theme] .wbg-native-toggle[aria-checked="true"] .wbg-native-toggle-thumb{background:var(--dsw-static-neutral-bluish-1000,#0f1115);}' +
      '@media (prefers-reduced-motion:reduce){.wbg-native-toggle,.wbg-native-toggle-thumb{transition:none;}}' +
      // 主页面「场景渲染」快捷开关（0.6.1）：与原生背景开关并列挂在 conversation.header.leading。
      // 该 slot 在 DSH 源码里是 kind:"single"（conversation.header 的 children 声明），只渲染第一个
      // entry —— 两个开关必须在同一次 register 里一起返回，不能各注册各的（后注册的会被 single
      // 语义悄悄忽略，界面上什么都不出现）。造型沿用原生背景开关的轨道 + 拇指，多一个文字标签
      // 消歧义（两个无标签开关并排用户分不清谁是谁）；仅影响场景类壁纸，当前不是场景时也保持
      // 可点（改的是持久偏好，与设置面板的那个复选框同一个 state.sceneLive，两边自动同步）。
      '.wbg-scene-toggle{display:inline-flex;align-items:center;gap:8px;flex:none;padding:0;border:0;background:none;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-secondary);transition:color .18s ease;}' +
      '.wbg-scene-toggle[aria-checked="true"]{color:var(--dsw-alias-label-primary);}' +
      '.wbg-scene-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px;border-radius:999px;}' +
      '.wbg-scene-track{position:relative;display:inline-flex;align-items:center;width:36px;height:20px;flex:none;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-state-idle-primary);transition:background .18s ease;}' +
      '.wbg-scene-toggle[aria-checked="true"] .wbg-scene-track{background:var(--dsw-alias-brand-primary);}' +
      '.wbg-scene-toggle-thumb{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;corner-shape:round;background:var(--dsw-static-neutral-00,#fff);box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .18s ease;}' +
      '.wbg-scene-toggle[aria-checked="true"] .wbg-scene-toggle-thumb{transform:translateX(16px);}' +
      'body[data-ds-dark-theme] .wbg-scene-toggle[aria-checked="true"] .wbg-scene-toggle-thumb{background:var(--dsw-static-neutral-bluish-1000,#0f1115);}' +
      '@media (prefers-reduced-motion:reduce){.wbg-scene-toggle,.wbg-scene-track,.wbg-scene-toggle-thumb{transition:none;}}' +
      // 原生背景模式下的表面：全局令牌转透明后，只给输入框座位与弹窗补回半透明底色，保证细字可读
      'body[data-dshw-native-bg="true"] [data-composer-seat],body[data-dshw-native-bg="true"] [role="dialog"],body[data-dshw-native-bg="true"] [role="alertdialog"]{--dsw-alias-bg-base:transparent;--dsw-alias-bg-layer-1:rgba(255,255,255,0.55);--dsw-alias-bg-layer-2:rgba(255,255,255,0.62);--dsw-specific-sidebar-fill:rgba(255,255,255,0.5);}' +
      'body[data-dshw-native-bg="true"][data-ds-dark-theme] [data-composer-seat],body[data-dshw-native-bg="true"][data-ds-dark-theme] [role="dialog"],body[data-dshw-native-bg="true"][data-ds-dark-theme] [role="alertdialog"]{--dsw-alias-bg-layer-1:rgba(16,20,28,0.55);--dsw-alias-bg-layer-2:rgba(22,27,36,0.62);--dsw-specific-sidebar-fill:rgba(10,13,19,0.5);}' +
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

      // ---------- 表面模式 ----------
      /** 清任务面板玻璃：只挂 body 属性，真正的清理由 CSS_TEXT 里那条规则做（含任务那一栏、
       *  工具卡片、分析卡片、菜单与任务浮层）。与原生背景开关彼此独立：原生背景清的是页面表面，
       *  这个清的是「浮在内容上的菜单材质」。 */
      function applyPanelGlass() {
        if (!document.body) return
        if (state && state.clearPanelGlass) document.body.setAttribute('data-dshw-clear-panel', 'true')
        else document.body.removeAttribute('data-dshw-clear-panel')
      }

      // ---------- 主题表面：常态半透明以透出壁纸，原生背景模式临时清掉表面覆盖 ----------
      // overrideTokens 同 source 重复调用 = 整层替换并重新置顶，所以开关切换时直接再调一次即可。
      function applySurfaceMode() {
        var native = !!(state && state.nativeBackground)
        if (document.body) {
          if (native) document.body.setAttribute('data-dshw-native-bg', 'true')
          else document.body.removeAttribute('data-dshw-native-bg')
        }
        applyPanelGlass()
        if (!theme || typeof theme.overrideTokens !== 'function') return
        theme.overrideTokens('dsh-wallpaper-bg', {
          '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
          '--dsw-alias-bg-layer-1': {
            light: native ? 'transparent' : 'rgba(255,255,255,0.55)',
            dark: native ? 'transparent' : 'rgba(16,20,28,0.55)',
          },
          '--dsw-alias-bg-layer-2': {
            light: native ? 'transparent' : 'rgba(255,255,255,0.62)',
            dark: native ? 'transparent' : 'rgba(22,27,36,0.62)',
          },
          '--dsw-specific-sidebar-fill': {
            light: native ? 'transparent' : 'rgba(255,255,255,0.5)',
            dark: native ? 'transparent' : 'rgba(10,13,19,0.5)',
          },
        })
      }

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
      // 「统一任务底色」层：同为 body 直接子元素、同为 z-index:-1，插在 overlay 之后 →
      // 画在壁纸与遮罩之上，这样它的模糊与底色叠的是「壁纸 × 遮罩」，与任务面板自身一致。
      var tintEl = document.createElement('div')
      tintEl.id = 'dsh-wallpaper-task-tint'
      document.body.insertBefore(tintEl, anchor)
      function applyTaskTint() {
        if (!document.body) return
        if (state && state.taskTint) document.body.setAttribute('data-dshw-task-tint', 'true')
        else document.body.removeAttribute('data-dshw-task-tint')
      }

      // ---------- 主题跟随：浅色雾层 / 深色遮罩自动切换 ----------
      var themeObserver = null
      if (document.body) {
        themeObserver = new MutationObserver(function () { applyOverlay() })
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      }

      var activeKind = 'none'
      var lastObjectUrl = null
      var shimHinted = false   // 旧版 WE API 服务的提示只打一次

      // ---------- 交叉淡入淡出（切换壁纸不闪黑的关键） ----------
      // 旧壁纸留在原位，新壁纸在自己的图层里「先就绪、后显示」：
      //   图片 → 预加载 + decode 完成；视频 → loadeddata 且首帧可显示（<video> 直接铺满）；
      //   网页 → iframe 画出内容（垫片 painted 上报）后立刻叠化；场景 → WebGL2 渲染出首帧后叠化
      //   （失败回退工坊预览图，applyScene 内部分流）。
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
          } else if (item.kind === 'scene') {
            // 场景：预热它的工坊预览图——这条预热在实时渲染失败时就是回退画面（scene.pkg 由
            // applySceneLive 自己按需拉取，预热它没有意义：一次 10MB+，且渲染器自带解码缓存）
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

      /** 场景预览图地址：优先工坊预览图（preview.gif 会动），退回缩略图。
       *  这是实时渲染失败时的兜底画面，也是「场景实时渲染」关闭时的唯一画面。 */
      function scenePreviewUrlOf(item) {
        if (!item) return ''
        return assetUrlOf(item.previewFile || item.thumbnail)
      }

      // ---------- 场景壁纸：页面内 WebGL2 实时渲染（0.6.0） ----------
      // WE 的 scene 类壁纸是 scene.pkg（对象树 / 纹理 / puppet 骨骼 / 粒子 / 效果链 / 场景脚本），
      // 0.4.0–0.5.x 只能显示工坊预览图；0.3.x 那套服务端 CPU 渲染器实测 9.3s/帧（p50），做不了实时。
      // 现在把 vendor 进来的 WebGL2 渲染器（webwallgl 2.1.0，MIT）跑在页面里：
      //   · 资源走 WE API 服务已有的只读 /files/<id>/…（scene.pkg + project.json + 散装 shaders/），
      //     画布由用户 GPU 实时绘制——零服务端渲染、不采样桌面、不落任何缓存文件；
      //   · 首帧真正画出来（mount 的 Promise 落地）之后才叠化入场，背景不会先空一块；
      //   · 渲染失败 / 超时 / 模块加载不到 → 立刻回退工坊预览图（回退原因在设置面板如实展示）；
      //   · 图层被换掉时 dispose() 释放 GPU 资源；页签不可见时 pause()，回来再 resume()。
      var SCENE_MOUNT_TIMEOUT_MS = 20000
      var sceneLibPromise = null      // { mount, httpSource, ... }：一次性动态 import
      var sceneLiveSupported = true   // 旧宿主半没有 /vendor 路由 → 首次失败后永久回退预览图
      var activeScene = null          // { inst, id }：当前活着的场景实例
      var sceneLiveNote = ''          // 最近一次回退原因（设置面板展示）

      /** 场景资源基址：WE API 服务的只读文件路由（与网页壁纸同一条 /files/<id>/… 契约） */
      function sceneAssetBaseOf(item) {
        var base = String(state.weBase || DEFAULTS.weBase).replace(/\/+$/, '')
        return base + '/files/' + item.id
      }

      /** 动态加载渲染器：走宿主半新增的 /vendor 路由（同源，避免跨域与路径暴露）。
       *  旧宿主半会 404 —— 视作「本机不支持实时渲染」，永久走预览图，不再反复尝试。 */
      function loadSceneLib() {
        if (sceneLibPromise) return sceneLibPromise
        var url = location.origin + '/dsh-wallpaper-bg/vendor/webwallgl.min.mjs'
        sceneLibPromise = import(/* webpackIgnore: true */ url).catch(function (err) {
          sceneLibPromise = null
          sceneLiveSupported = false
          throw err
        })
        return sceneLibPromise
      }

      function sceneFpsValue() {
        var n = Number(state.sceneFps)
        if (!isFinite(n) || n <= 0) n = 30
        return Math.max(10, Math.min(60, Math.round(n)))
      }

      // ---------- 场景渲染质量档位（0.6.1） ----------
      // webwallgl 的显存大头是画布 + 效果链 FBO（随 DPR² 增长），纹理反而是其次
      // （vendor/webwallgl/UPSTREAM-README.md「显存与清晰度」：低内存设备推荐
      // 「清晰度 0.8 + 质量 low」）。renderDpr 同时决定画布分辨率与贴图资源倍率。
      //   high   = 全默认：renderDpr 跟随设备、粒子/后处理 high，autoQuality 继续自动降档
      //   medium = renderDpr 0.85 + 粒子/后处理 medium：显存约打七折，观感几乎无损
      //   low    = renderDpr 0.7 + 粒子/后处理 low：显存约打四折，画面明显变柔
      // high 档一个键都不显式传——autoQuality「只填没显式指定的键」，传了 high
      // 反而会把它掉帧时自动降后处理的逻辑关掉。medium/low 是用户显式选择，
      // autoQuality 不覆盖，选了 low 就不会被帧率逻辑悄悄升回去。
      var SCENE_QUALITY_TIERS = {
        high: { renderDpr: 0, particles: '', postProcessing: '' },
        medium: { renderDpr: 0.85, particles: 'medium', postProcessing: 'medium' },
        low: { renderDpr: 0.7, particles: 'low', postProcessing: 'low' },
      }
      function sceneQualityOptions() {
        var tier = SCENE_QUALITY_TIERS[state.sceneQuality]
        return tier || SCENE_QUALITY_TIERS.high
      }
      function sceneQualityLabel() {
        return { high: '高', medium: '中', low: '低' }[state.sceneQuality] || '高'
      }

      /** 对节点内所有 canvas 显式丢失 WebGL 上下文（渲染器 dispose() 之外的兜底硬释放）。
       *  画布可能已被渲染器内部的 lose_context 丢失——那时 getContext 返回同一个已丢失的
       *  上下文、扩展取不到，全部 best-effort，失败静默。快速连续切换场景时，光靠渲染器
       *  dispose + GC「释放跟不上创建」（docs/scene-coverage.md 坑 2：连挂多张后半段每张报
       *  WEBGL2_UNAVAILABLE、显存累积拖慢后续每一张），这里补一刀让 GPU 进程立刻回收。 */
      function forceLoseGl(node) {
        try {
          var canvases = node && node.querySelectorAll ? node.querySelectorAll('canvas') : []
          for (var i = 0; i < canvases.length; i++) {
            var gl = null
            try { gl = canvases[i].getContext('webgl2') || canvases[i].getContext('webgl') } catch (e) { /* 忽略 */ }
            var lose = gl && gl.getExtension ? gl.getExtension('WEBGL_lose_context') : null
            if (lose) { try { lose.loseContext() } catch (e) { /* 忽略 */ } }
          }
        } catch (e) { /* 忽略 */ }
      }

      function pauseActiveScene() {
        if (!activeScene || !activeScene.inst || !activeScene.inst.pause) return
        try { activeScene.inst.pause() } catch (e) { /* 忽略 */ }
      }
      function resumeActiveScene() {
        if (!activeScene || !activeScene.inst || !activeScene.inst.resume) return
        try { activeScene.inst.resume() } catch (e) { /* 忽略 */ }
      }

      /** 兜底路径：显示 WE 自带的工坊预览图（preview.gif 会动 / preview.jpg） */
      function applyScenePreview(item) {
        if (!item) { clearActive(); return }
        var preview = scenePreviewUrlOf(item)
        if (preview) applyImage(preview)
        else clearActive()
      }

      /** 实时渲染一张场景壁纸。任何异常路径都必须收场：要么叠化入场，要么回退预览图。 */
      function applySceneLive(item) {
        var seq = ++applySeq
        var layer = document.createElement('div')
        layer.className = 'wbg-layer'
        // 必须先入 DOM：渲染器按容器尺寸建画布 + 对齐 backing store，未挂载的元素量不到尺寸
        bgEl.appendChild(layer)
        var released = false
        var inst = null
        var dispose = function () {
          if (released) return
          released = true
          if (activeScene && activeScene.inst === inst) activeScene = null
          if (inst && inst.dispose) { try { inst.dispose() } catch (e) { /* 忽略 */ } }
          inst = null
          // 兜底硬释放：渲染器 dispose() 内部已走 WEBGL_lose_context，但快速连续切换时
          // 上下文与显存的释放跟不上创建（docs/scene-coverage.md 坑 2）——再对图层里的
          // 画布显式 loseContext 一次，让 GPU 进程立即回收，不等 GC。
          forceLoseGl(layer)
        }
        layers.set(layer, dispose)
        var dropLayer = function () {
          if (layers.get(layer) === dispose) layers.delete(layer)
          if (layer.parentNode) layer.parentNode.removeChild(layer)
        }
        return loadSceneLib().then(function (lib) {
          if (seq !== applySeq) return null   // 已被更晚的一次切换顶掉：不再启动渲染
          // 看门狗在真正开始挂载之后才起表：渲染器模块加载失败（旧宿主半）时不该留下一个
          // 20 秒后无人接管的 rejection
          var watchdog = new Promise(function (_, reject) {
            later(function () { reject(new Error('首帧超时 ' + SCENE_MOUNT_TIMEOUT_MS + 'ms')) }, SCENE_MOUNT_TIMEOUT_MS)
          })
          // 质量档位（0.6.1）：high 档一个键都不显式传——autoQuality「只填没显式指定的键」，
          // 显式传 high 反而会把它掉帧时自动降后处理的逻辑关掉；medium/low 才显式压
          // renderDpr（同时缩画布与贴图资源倍率）+ 粒子/后处理 FBO 档位省显存。
          var q = sceneQualityOptions()
          var mountOpts = {
            source: lib.httpSource(sceneAssetBaseOf(item)),
            fps: sceneFpsValue(),
            volume: 0,        // 背景壁纸一律静音起步：非静音会让浏览器挂起整个场景的音频节点
            autoQuality: true // 探到软件渲染 / 持续掉帧时自动降后处理与分辨率
          }
          if (q.renderDpr) mountOpts.renderDpr = q.renderDpr
          if (q.particles) mountOpts.quality = { antiAliasing: 'off', particles: q.particles, postProcessing: q.postProcessing }
          var mounting = lib.mount(layer, mountOpts)
          // 迟到实例的收割：看门狗先判负（或本次 apply 已被 clearActive 收掉）之后，mount 仍可能
          // resolve —— 那一刻图层已经撤了，必须把它释放掉，否则会留下一个看不见但一直在跑的渲染循环。
          // 判定只看 released：正常路径下由主流程接管（它自己会 dispose 或叠化入场）。
          mounting.then(function (late) {
            if (!released) return
            if (late && late.dispose) { try { late.dispose() } catch (e) { /* 忽略 */ } }
            forceLoseGl(layer)   // 迟到的实例同样硬释放，别留一个没人管的上下文
          }, function () { /* mount 自身的失败已由下面的 race 处理 */ })
          return Promise.race([mounting, watchdog])
        }).then(function (wp) {
          if (!wp) { dropLayer(); return }
          inst = wp
          if (seq !== applySeq) { dispose(); dropLayer(); return }
          activeScene = { inst: wp, id: String(item.id) }
          sceneLiveNote = ''
          crossfade(layer, 'scene')
          if (document.visibilityState === 'hidden') pauseActiveScene()
          warmNextInQueue()
          emit()   // 面板状态行立刻从「回退预览图」切到「正在实时渲染」
        }, function (err) {
          sceneLiveNote = String((err && err.message) || err)
          dispose()
          dropLayer()
          if (seq !== applySeq) return
          emit()   // 面板如实展示回退原因
          applyScenePreview(item)
        })
      }

      /** 场景壁纸入口（手动选中 / 队列 / 桌面同步共用）：默认实时渲染，
       *  关掉开关或本机不支持时回退工坊预览图。 */
      function applyScene(item) {
        if (!item) { clearActive(); return }
        if (state.sceneLive !== false && sceneLiveSupported) return applySceneLive(item)
        return applyScenePreview(item)
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
      function applyOverlay() {
        // 深色外观 → 黑色压暗遮罩；浅色外观 → 半透明白色雾层（类侧边栏雾感，垫在背景与内容之间提升细字可读性）
        var dark = isDarkTheme()
        var v = state.nativeBackground
          ? 0
          : Math.min(100, Math.max(0, Number(dark ? state.overlayOpacity : state.lightFog) || 0))
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
        tintEl.remove()
        bgEl.remove()
      }

      // ---------- 状态（localStorage 持久化） ----------
      var state = loadState()
      applySurfaceMode()   // 首帧就按持久化的原生背景开关铺好表面覆盖
      applyTaskTint()      // 首帧就按持久化的统一任务底色开关铺好底色层
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
        var wasSurfaceMode = !!state.nativeBackground + ':' + !!state.clearPanelGlass + ':' + !!state.taskTint
        var patchKeys = Object.keys(patch)
        // 只动外观的控件直接改当前图层；applyNow 会重新加载壁纸并交叉淡入，拖滑杆时会闪。
        var appearanceOnlyKeys = ['nativeBackground', 'clearPanelGlass', 'taskTint', 'overlayOpacity', 'lightFog', 'blur', 'brightness', 'safeZoom']
        var appearanceOnly = patchKeys.length > 0 && patchKeys.every(function (key) {
          return appearanceOnlyKeys.indexOf(key) >= 0
        })
        state = Object.assign({}, state, patch)
        if (wasSurfaceMode !== (!!state.nativeBackground + ':' + !!state.clearPanelGlass + ':' + !!state.taskTint)) applySurfaceMode()
        if (patchKeys.indexOf('taskTint') >= 0) applyTaskTint()
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
      var weCache = { list: null, current: null, currentAt: 0, monitor: '', monitorSource: '', monitors: [] }
      // 宿主半能力（一次性探测）：/health 的 monitorForward = 宿主半会不会把 monitor 透传给
      // WE API 服务；sceneLive = 宿主半有没有内置场景渲染器的 /vendor 路由（0.6.0 起）。
      // 宿主半随 dsh 启动加载，改完需要重启 dsh 才生效——探测到不支持时就如实提示，
      // 而不是让用户点了下拉却毫无反应。
      var hostCaps = { monitorForward: false, sceneLive: false, probed: false }
      function probeHostCaps() {
        if (hostCaps.probed) return
        hostCaps.probed = true
        fetch('/dsh-wallpaper-bg/health').then(function (r) { return r.json() }).then(function (res) {
          hostCaps.monitorForward = !!(res && res.monitorForward)
          hostCaps.sceneLive = !!(res && res.sceneLive)
          // 旧宿主半（0.5.x 及更早）没有 /vendor 路由：场景直接回退工坊预览图，不去试错
          if (!hostCaps.sceneLive) sceneLiveSupported = false
          emit()
        }).catch(function () { /* 探测失败按「不支持」处理（旧宿主半没有该路由） */ })
      }
      /** 吸收一次 WE 列表响应：缓存列表 */
      function noteWeList(res) {
        if (!res || !res.ok) return
        weCache.list = res.wallpapers || []
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

      // ---------- 桌面壁纸同步轮询（30 秒） ----------
      var syncIv = window.setInterval(function () {
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
      }, 30000)

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
      // 页面重新可见时立刻跟一次：切回 DSH 页签就能看到桌面最新的壁纸，不必等下一个 30 秒。
      // 实时渲染的场景壁纸同步暂停 / 恢复：页签在后台时没必要继续吃 GPU。
      var onVisible = function () {
        if (document.visibilityState === 'visible') {
          syncNow(true)
          resumeActiveScene()
        } else {
          pauseActiveScene()
        }
      }
      document.addEventListener('visibilitychange', onVisible)
      // 窗口失焦时同样停渲染：桌面端 DSH 不是当前窗口时壁纸根本看不见，白烧 GPU 没有意义
      // （visibilitychange 管页签/最小化，blur/focus 管应用窗口本身——点去别的程序就停）。
      // 恢复要两个条件都满足：窗口重新获焦且页签可见，避免「焦点回来了但还在后台页签」时误启。
      var onWindowBlur = function () { pauseActiveScene() }
      var onWindowFocus = function () {
        if (document.visibilityState === 'visible') resumeActiveScene()
      }
      window.addEventListener('blur', onWindowBlur)
      window.addEventListener('focus', onWindowFocus)

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
          // 只为拿一帧画缩略图：preload=auto 会把整个文件缓冲进媒体缓存——上传库里 51.7MB 的
          // mp4 为一张 320px 缩略图整文件缓冲，纯浪费。改 metadata + 主动 seek 到片头附近，
          // 浏览器按需只拉那一小段（本地 blob 同样走媒体缓存，一样省）。
          video.setAttribute('preload', 'metadata')
          var done = function () {
            window.clearTimeout(safety)
            try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
            try { video.removeAttribute('src'); video.load() } catch (e) { /* 忽略 */ }
            resolve()
          }
          var draw = function () {
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
          // 元数据就绪 → seek 到片头附近：seeked 才代表「这一帧的数据真的到了」。
          // 停在 0 可能不触发 seeked（已经在那），取一个很小的正数时间点；duration 异常时退回 0.1。
          video.onloadedmetadata = function () {
            var t = 0.1
            try {
              if (video.duration && isFinite(video.duration)) t = Math.min(0.1, video.duration / 10)
              video.currentTime = t
            } catch (e) { draw() }
          }
          video.onseeked = draw
          video.onerror = function () { vidThumbFailed.add(u.id); done() }
          // 兜底：元数据 / seek 都不来（个别容器）也不能把缩略图队列卡死——
          // pumpVideoThumbs 的并发位靠 generateVideoThumb 的 resolve 释放。
          // 用独立定时器而不用 later()：后者挂在 fadeTimers 上，切壁纸时会被 clearActive
          // 一并清掉，那时若元数据仍不来，并发位就漏了。
          var safety = window.setTimeout(done, 10000)
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

      // ---------- 主页面开关：场景壁纸实时渲染（0.6.1，与原生背景并列） ----------
      // 同一个 state.sceneLive：这里点一下 = 设置面板里那个复选框同步翻面，反之亦然。
      // 关 → 当前场景壁纸立刻回退工坊预览图（preview.gif 会动）；开 → 重新挂载实时渲染。
      // 只影响场景类壁纸；当前不是场景时也保持可点——改的是持久偏好，tooltip 里说清作用域。
      // 渲染失败过（sceneLiveNote 非空）时 tooltip 如实带上回退原因，和设置面板的信息一致。
      function SceneRenderControl() {
        var snapshotState = React.useState(Object.assign({}, state))
        var snap = snapshotState[0]
        var setSnap = snapshotState[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var on = snap.sceneLive !== false
        var title = on
          ? (sceneLiveNote
              ? '场景壁纸实时渲染：开，但当前这张渲染失败，正显示工坊预览图（' + sceneLiveNote + '）'
              : '场景壁纸实时渲染：开（WebGL2 实时绘制 scene.pkg）—— 点击切换到工坊预览图')
          : '场景壁纸实时渲染：关（显示工坊预览图）—— 点击开启 WebGL2 实时渲染（仅影响场景类壁纸）'
        return React.createElement('button', {
          type: 'button',
          className: 'wbg-scene-toggle',
          role: 'switch',
          'aria-checked': on,
          'aria-label': '场景壁纸实时渲染',
          title: title,
          onClick: function () { setState({ sceneLive: !on }) },
        },
          React.createElement('span', null, '场景'),
          React.createElement('span', { className: 'wbg-scene-track' },
            React.createElement('span', { className: 'wbg-scene-toggle-thumb' })))
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
          probeHostCaps()   // 显示器下拉要不要可用，取决于宿主半版本（只探测一次）
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
              step: opts.step || 1,
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
                ? React.createElement('img', { src: thumb, alt: title, draggable: 'false', loading: 'lazy' })
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

        /** 服务连不上时的基准地址（用户可能改过端口） */
        function weBaseUrl() { return snap.weBase || DEFAULTS.weBase }

        /**
         * 服务曾经连上过、之后断掉，列表还在缓存里时的横幅。
         * 能走到这里说明用户**装过**这个服务（否则不会有列表），所以只给最省事的两步：
         * 先重启服务，再（可选）设成开机自启，不必再让人 clone / npm install。
         */
        function weStaleBar() {
          if (!weError || !weList) return null
          return React.createElement('div', { className: 'wbg-stale' },
            React.createElement('span', null, '⚠'),
            React.createElement('span', null,
              '连不上 WE API 服务（' + weBaseUrl() + '）——下方列表是上次的缓存，可能已过期。'
              + '双击 wallpaper-engine-api\\重启服务(管理员).bat 后点「刷新」即可恢复；'
              + '想以后重启电脑 / 关掉窗口都不用管，双击同目录的 设置开机自启.bat。'
              + '注意：别在 DSH 客户端内部（终端 / 工具）启动服务——那样起的进程会随客户端退出一起结束；'
              + '请在资源管理器里双击脚本。'))
        }

        function weGrid() {
          var list = weList
          if (weLoading && !list) return React.createElement('div', { className: 'wbg-hint' }, '正在从 Wallpaper Engine 读取壁纸库…')
          if (weError && !list) {
            // 从没成功加载过 → 不知道用户装没装，按「从省事到麻烦」的顺序给全：
            // ① 装过只是没在跑（最常见）② 从没装过 ③ 排查与端口
            return React.createElement('div', { className: 'wbg-error' },
              weError + '。连不上 WE API 服务（' + weBaseUrl() + '）。'
              + '① 装过、只是没在运行（最常见）：双击 wallpaper-engine-api\\重启服务(管理员).bat，再点「刷新」；'
              + '想以后重启电脑 / 关掉窗口都不用管，双击同目录的 设置开机自启.bat。'
              + '（另：别在 DSH 客户端内部启动服务——它会随客户端退出一起结束。）'
              + '② 从没装过：该服务只随仓库提供、不在 npm 包里——先 git clone https://github.com/nishuoyang/dsh-wallpaper-bg ，'
              + '进入 wallpaper-engine-api 执行 npm install，再双击 启动服务.bat 走首次运行向导（会写出 we-api.config）。'
              + '首次运行请务必用 启动服务.bat：静默脚本 启动服务-静默.vbs 没有向导，缺配置时不弹窗、只在 we-api.log 里留错误。'
              + '③ 还是连不上：看 wallpaper-engine-api\\we-api.log 末尾的报错；改过端口的话把上方基地址改成一致。'
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
          // 跟随到场景壁纸：实时渲染时说明画面由谁画；回退到预览图时如实说明原因与实际像素
          if (cur && cur.kind === 'scene') {
            if (snap.sceneLive !== false && !sceneLiveNote) {
              children.push(React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
                '场景壁纸正在页面里实时渲染（WebGL2，帧率上限 ' + sceneFpsValue() + 'fps' +
                (snap.sceneQuality && snap.sceneQuality !== 'high'
                  ? '，质量档位 ' + sceneQualityLabel() + ' · 显存优先'
                  : '') +
                '）：粒子 / 水面 / 角色呼吸都是活的，画面由本机 GPU 绘制，不依赖桌面是否可见、不产生缓存文件。'))
            } else {
              var ps = cur.previewSize
              var sizeNote = ps ? '实测 ' + ps.w + '×' + ps.h + ' 像素，全屏放大后必然发虚。' : ''
              children.push(React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
                (snap.sceneLive === false
                  ? '「场景实时渲染」已关闭：页面显示它的工坊预览图（preview.gif 会动 / preview.jpg）。' + sizeNote
                  : '该场景已回退到工坊预览图：' + (sceneLiveNote || '未知原因') + '。' + sizeNote)))
            }
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
                React.createElement('span', { className: 'wbg-hint' }, '开启后只读跟随 Wallpaper Engine 当前桌面壁纸：桌面换一张、页面对上（30 秒轮询，切回页签立即跟随）。场景会在页面里用 WebGL2 实时渲染（失败自动回退工坊预览图），视频 / 图片 / 网页按各自方式渲染；不修改桌面，不产生缓存文件。多显示器会自动判定跟随哪台（最近换过壁纸 / 正在播放的那台），也可在下方状态行改成指定显示器'),
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

          panelSource === 'builtin' ? builtinGrid() : null,
          panelSource === 'custom'
            ? React.createElement(React.Fragment, null, queueSection('custom'), customGrid())
            : null,
          panelSource === 'we'
            ? React.createElement(React.Fragment, null, queueSection('we'), weStaleBar(), weGrid())
            : null,

          sliderRow({ label: '浅色雾层', value: snap.lightFog, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ lightFog: n }) } }),
          sliderRow({ label: '深色遮罩', value: snap.overlayOpacity, min: 0, max: 100, unit: '%', onChange: function (n) { setState({ overlayOpacity: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '浅色外观铺白色雾层、深色外观压深色遮罩，随主题自动切换；雾层位于背景与内容之间，提升细字可读性。开启主页面「原生背景」时暂时忽略这些数值，关闭后恢复。'),
          // 任务那一栏 / 工具卡片 / 分析卡片 / 菜单的深色磨砂底（DSH 菜单材质）是否清成透明
          React.createElement('div', { className: 'wbg-actions' },
            React.createElement('label', { className: 'wbg-switch' },
              React.createElement('input', {
                type: 'checkbox',
                checked: !!snap.clearPanelGlass,
                onChange: function (e) { setState({ clearPanelGlass: e.target.checked }) },
              }),
              '清任务面板玻璃',
            ),
            // 与上面正好互补：不去掉那层底色，而是把它铺给所有会话，让「有任务 / 没任务」看起来一致
            React.createElement('label', { className: 'wbg-switch' },
              React.createElement('input', {
                type: 'checkbox',
                checked: !!snap.taskTint,
                onChange: function (e) { setState({ taskTint: e.target.checked }) },
              }),
              '统一任务底色',
            ),
          ),
          React.createElement('div', { className: 'wbg-hint' },
            '「任务」那一栏、工具卡片、分析卡片和菜单垫的都是 DSH 的菜单材质（深色下是 45% 不透明的 #43454a 加 blur(40px)），' +
            '叠在壁纸与遮罩之上会压成一片暗面 —— 这就是「有任务栏的对话看着更黑」的来源。勾「清任务面板玻璃」把这些底清成透明，壁纸直接透出来；' +
            '原生背景开关管不到这层材质，所以单独给一个开关。代价：这些面板浮在内容之上，清得太干净会降低细字可读性，' +
            '觉得糊就取消勾选，或把「深色遮罩」再往低调。'),
          React.createElement('div', { className: 'wbg-hint' },
            '「统一任务底色」反过来用：不改任何面板，而是在壁纸之上、所有界面之下铺一层同样的底色（' + TASK_TINT_RGBA + ' + ' + TASK_TINT_BLUR + '），' +
            '于是每个会话 —— 不管有没有任务在跑 —— 都是同一种偏暗的观感，截图和实机也不会再打架。' +
            '它只作用于背景，不碰前景文字的对比度，所以和上面那个开关并不冲突（两个都勾 = 背景统一偏暗、面板自身透明）。'),
          sliderRow({ label: '背景模糊度', value: snap.blur, min: 0, max: 20, unit: 'px', onChange: function (n) { setState({ blur: n }) } }),
          sliderRow({ label: '背景亮度', value: snap.brightness, min: 50, max: 150, unit: '%', onChange: function (n) { setState({ brightness: n }) } }),
          sliderRow({ label: '安全放大', value: snap.safeZoom, min: 0, max: 10, unit: '%', onChange: function (n) { setState({ safeZoom: n }) } }),
          React.createElement('div', { className: 'wbg-hint' }, '安全放大：在画面四周裁掉 1–10% 边缘，用于去除视频/图片自带的黑边。'),

          // ---------- 场景壁纸：页面内 WebGL2 实时渲染（0.6.0） ----------
          React.createElement('div', { className: 'wbg-actions' },
            React.createElement('label', { className: 'wbg-switch' },
              React.createElement('input', {
                type: 'checkbox',
                checked: snap.sceneLive !== false,
                onChange: function (e) { setState({ sceneLive: e.target.checked }) },
              }),
              '场景实时渲染',
            ),
          ),
          snap.sceneLive !== false
            ? sliderRow({
                label: '场景帧率上限',
                value: sceneFpsValue(),
                min: 10,
                max: 60,
                step: 5,
                unit: 'fps',
                onChange: function (n) { setState({ sceneFps: n }) },
              })
            : null,
          snap.sceneLive !== false
            ? React.createElement('div', { className: 'wbg-row' },
                React.createElement('label', null, '渲染质量'),
                React.createElement('div', { className: 'wbg-seg', style: { flex: '1' } },
                  [['high', '高'], ['medium', '中'], ['low', '低 · 省显存']].map(function (pair) {
                    return React.createElement('button', {
                      key: pair[0],
                      type: 'button',
                      className: 'wbg-seg-btn' + ((snap.sceneQuality || 'high') === pair[0] ? ' wbg-active' : ''),
                      title: pair[0] === 'high'
                        ? '全默认画质：renderDpr 跟随设备，粒子 / 后处理拉满，掉帧时自动降档'
                        : pair[0] === 'medium'
                          ? 'renderDpr 0.85 + 粒子 / 后处理中档：显存约打七折，观感几乎无损'
                          : 'renderDpr 0.7 + 粒子 / 后处理低档：显存约打四折，画面明显变柔',
                      onClick: function () { setState({ sceneQuality: pair[0] }) },
                    }, pair[1])
                  })
                ))
            : null,
          React.createElement('div', { className: 'wbg-row', style: { flexWrap: 'wrap', gap: '8px' } },
            React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
              '开启后场景壁纸由页面里的 WebGL2 直接渲染工坊的 scene.pkg —— 对象树 / 骨骼 / 粒子 / 效果链都是活的，' +
              '场景自带的文字与音频响应脚本也会跟着跑。画面由你的 GPU 实时绘制，不依赖 Wallpaper Engine 正在运行、不采样桌面画面、不产生任何缓存文件。' +
              '渲染失败或 20 秒内没出首帧会自动回退工坊预览图（preview.gif 会动），背景不会空；帧率上限越高越流畅也越费电，笔记本建议 30fps。'),
            React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
              '「渲染质量」压的是画布与效果链缓冲的分辨率 —— 4K 屏上它们才是显存大头（随分辨率平方增长），贴图反而是其次：' +
              '「中」显存约打七折、观感几乎无损；「低」约打四折、画面明显变柔。切档会重挂载当前场景（scene.pkg 有缓存，不重新下载），叠化切换不闪黑。'),
            sceneLiveNote
              ? React.createElement('span', { className: 'wbg-hint', style: { flexBasis: '100%' } },
                  '上一张场景已回退到工坊预览图：' + sceneLiveNote)
              : null,
          ),

          React.createElement('div', { className: 'wbg-actions' },
            React.createElement('button', { type: 'button', className: 'wbg-btn', onClick: resetAll }, '恢复默认'),
            React.createElement('span', { className: 'wbg-hint' }, '背景层独立于桌面 Wallpaper Engine，切换不会影响桌面壁纸'),
          ),
        )
      }

      // ---------- 注册主页面开关（conversation.header.leading：根作用域，空白首页与会话页都可见） ----------
      // 注意：这个 slot 在 DSH 源码里是 kind:"single"（conversation.header 注册时 children 声明，
      // 只渲染 entriesOfSlot[0]）——原生背景与场景渲染两个开关必须在同一次 register 里一起返回，
      // 不能像 list slot 那样各注册各的：后注册的那个会被 single 语义悄悄忽略，界面上什么都不
      // 出现，且不报错（0.6.1 加场景开关时实测过源码确认，别改回两次注册）。
      slots.inject('conversation.header.leading', function () {
        return slots.register(
          { name: 'conversation.header.leading', priority: -1 },
          function () {
            return React.createElement(React.Fragment, null,
              React.createElement(NativeBackgroundControl),
              React.createElement(SceneRenderControl),
            )
          },
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

      // ---------- 清理与启动 ----------
      ctx.effect(function () {
        return function () {
          window.clearInterval(syncIv)
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('blur', onWindowBlur)
          window.removeEventListener('focus', onWindowFocus)
          clearQueueTimer()
          if (themeObserver) themeObserver.disconnect()
          if (document.body) document.body.removeAttribute('data-dshw-native-bg')
          if (document.body) document.body.removeAttribute('data-dshw-clear-panel')
          if (document.body) document.body.removeAttribute('data-dshw-task-tint')
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
