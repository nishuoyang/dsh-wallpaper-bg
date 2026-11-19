# 问题分析：界面「全屏」后壁纸消失、背景变纯黑（issue #5）

- 议题：[#5 [bug] 点界面「全屏」后壁纸消失、背景变纯黑](https://github.com/nishuoyang/dsh-wallpaper-bg/issues/5)
- 报告环境：Windows 11 26100 / DSH 0.2.2-rc.5 桌面端（Electron）/ dsh-wallpaper-bg **0.5.20** / 内置静态壁纸
- 分析基准：仓库 `main` @ 0.5.20（`lib/client.js` 与 `app-extract/` 中抽取的 DSH 客户端代码）
- 结论一句话：**不是 Fullscreen API 的元素作用域问题；壁纸是被「右侧详情栏全屏后铺满视口的表面」盖住的**。

---

## 1. 现象与边界条件（先把范围钉死）

| 操作 | 结果 | 说明 |
| --- | --- | --- |
| 点右侧详情栏顶部中间那颗 `⛶` | 壁纸消失，屏幕只剩该面板 + 纯黑其余区域 | 问题现场 |
| 再点一次 / `Esc` | 壁纸恢复 | 布局态回退，没有状态被销毁 |
| `Win + ↑` 最大化、`F11` 系统级全屏 | 壁纸正常 | 这两种走的是**窗口**全屏，没有改变页面内部布局 |
| 浏览器访问 `http://127.0.0.1:<port>` | 同样复现 | 与 Electron / 桌面端窗口行为无关 |

**关键推论**：进入该「全屏」后界面结构发生的变化是「右侧面板从约 400px 的竖条变成铺满视口」，
而不是「页面被交给浏览器全屏渲染」。这正是后面要验证的分歧点。

---

## 2. 报告者的假设：成立吗？

issue 里的推测是：

> 界面里的「全屏」是 `requestFullscreen()`。浏览器进入全屏后只渲染全屏元素及其子树…而两个壁纸图层是 `#root` 的**兄弟节点**，于是被一起移出画面。

对当前 DSH 客户端代码做全文检索（`app-extract/` = 前端 bundle + 全部内建插件 + Electron 主进程/preload）：

| 检索式 | 命中 | 判定 |
| --- | --- | --- |
| `requestFullscreen` | **0 处** | 从不调用 |
| `RequestFullscreen` / `RequestFullScreen` / `EnterFullscreen` | 0 处业务代码（仅 i18n 文案键 `chrome.exitFullscreen`） | 从不调用 |
| `fullscreenElement` / `webkitFullscreenElement` | 1 处：`dsh-client-ui-sidebar-terminal__lib__client.terminal.js:7347` | 随包 **xterm.js 自己**的状态探测，与本功能无关 |

右侧面板的「全屏」实际是**纯 CSS 布局态**：

```js
// app-extract/plugins/dsh-client-ui-sidebar-right__lib__client.js
5677:  width: fullscreen ? "100vw" : width,
5678:  "--dsh-sidebar-width": fullscreen ? "100vw" : `${width}px`,
5681:  "data-sidebar-right-panel": fullscreen ? "fullscreen" : "push",

6644:  toggleFullscreen(target) {
6648:      const fullscreen = autoFullscreen || this.mountedSurface()?.layout.mode === "fullscreen";
6650:      actions.setMode(sessionId, fullscreen ? "push" : "fullscreen");
```

`mode` 的取值域就是 `["push", "fullscreen"]`（同文件 4951 行），配套 CSS 只有一条抬层级：

```
.OUqwTW_panel[data-sidebar-right-panel=fullscreen]{ --dsh-dockkit-dock-layer: 40 }
```

布局层把该状态记到 `layoutInfo.rightbarFullscreen`，再写到 frame 的 `data-rightbar-fullscreen` 上
（`dsh-client-ui-layout__lib__client.js:324`），而这条属性**只被用于 `transition:none`**。

> 结论：issue 的「原因推测」与实现不符。`document.fullscreenElement` 在这个操作里**始终是 `null`**，
> 浏览器从没进入过"只渲染全屏子树"的模式。所以"监听 `fullscreenchange`""把壁纸层移进全屏元素"
> 这两条修法照字面写都不会有效果——那个事件永远不会触发。

---

## 3. 那么壁纸为什么真的不见了：底层的存在方式

壁纸不是应用背景的一部分，而是**挂在 `#root` 之外的一块全局底层**：

```js
// lib/client.js
197: '#dsh-wallpaper-bg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;...background-color:#0b1020;...}'
205: '#dsh-wallpaper-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;...background:rgba(0,0,0,0.4);...}'

509: var anchor = document.getElementById('root') || document.body.firstChild
510: document.body.insertBefore(bgEl, anchor)      // 注意：是 body 的直接子元素，且排在 #root **之前**
511: document.body.insertBefore(overlayEl, anchor) // （0.5.9 为修 macOS 窗口拖拽，见 CHANGELOG #3 / troubleshooting §3.11）
```

因此它在绘制顺序上位于 `#root` **整棵子树之下**。界面上任何一块不透明表面，
只要盖住视口，就会把它遮住。它之所以平时可见，靠的是插件对宿主「表面色」令牌的整体改写：

```js
// lib/client.js: applySurfaceMode()
418: '--dsw-alias-bg-base': { light: 'transparent', dark: 'transparent' },
420: '--dsw-alias-bg-layer-1': 半透明（原生背景模式为 transparent）
424: '--dsw-alias-bg-layer-2': 半透明
428: '--dsw-specific-sidebar-fill': 半透明
```

而 `docs/architecture.md` 明确写了这套改写的边界：

> 插件只覆盖 `bg-base`、`bg-layer-1/2`、侧栏 token；**layer-3/4 在 0.2.1 里被当前景色与 hover 底色使用，不能全局透明化**。

**于是因果链闭合了**：

1. 平时右侧面板只占约 400px 的竖条，它内部那些「插件没改写过的表面」只盖住屏幕右侧一条，没人注意；
2. 点 `⛶` 后同一个面板被撑到 `100vw`，层级抬到 dock layer 40，**整屏都变成了这块面板的底**；
3. 面板里的 dockkit 表面 / pane 底色不在插件改写的那几个令牌里，深色主题下就是近黑；
4. 壁纸层仍在原位（`position:fixed`、全视口、未被销毁），只是被压在下面——所以退出后瞬间恢复，没有任何重载动画。

### 为什么看起来是「纯黑」而不是「透明」

- 壁纸容器自身带近黑底色 `#0b1020`（`lib/client.js:197`），其上是 `rgba(0,0,0,0.4)` 的遮罩（205）；
- 深色主题下未被改写的表面同样是近黑。

如果壁纸层真的被浏览器移出画面、页面整体透明，露出的会是**白色画布**（Chrome 对全透明页面的默认底色），
而不是纯黑。观察到的是纯黑，反过来说明"壁纸层还在，只是被一块深色表面盖住了"。

---

## 4. 这是模型问题，不是一次性 bug

同一套模型此前已经踩过一次：设置弹窗用 `--dsw-alias-bg-base` 当底板，
插件把这个令牌整体设成 `transparent` 后弹窗连底板一起透明、文字直接压在壁纸和聊天内容上，
于是 `lib/client.js:304–332` 又给 `[role=dialog]` / `[data-composer-seat]` 单独打补丁把它钉回去。

**每新增一种"盖住视口的新表面"，就要再补一次洞。** 右侧详情栏全屏只是下一个受害者。
报告者提到的 #3（全屏背景层插入位置影响桌面端）也是同一类：背景层的**位置与层级**与宿主布局强耦合。

---

## 5. 仍未定论的一环（需要一条真机确认）

dockkit 的 `pane` / `surface` 实际用的是哪个令牌，我没能从 `app-extract` 里完整取到
（该 CSS 模块的规则文本躺在 bundle 的超长行里，读取时被截断）。所以"究竟是哪一条令牌漏了"
需要在桌面端 DevTools 里点一下确认。三条命令足够定性：

```js
// 1) 直接否掉 issue 的 Fullscreen API 假设（预期 null）
document.fullscreenElement

// 2) 证明壁纸层没有被销毁、仍是全视口（预期 width/height === innerWidth/innerHeight）
document.getElementById('dsh-wallpaper-bg').getBoundingClientRect()

// 3) 找出那块盖住壁纸的表面到底涂了什么
getComputedStyle(document.querySelector('[data-dockkit-surface]')).backgroundColor
getComputedStyle(document.querySelector('[data-sidebar-right-panel="fullscreen"]')).backgroundColor
```

再在全屏状态下把第 3 步命中元素的 `background` 临时改成 `transparent`：
壁纸立刻回来 = 遮挡假设成立；仍然黑 = 需要另找（例如某个 `::before` 或 z-index 更高的浮层）。

---

## 6. 修复方向（按成本从低到高）

| 方案 | 做法 | 代价 | 评价 |
| --- | --- | --- | --- |
| A. 面板表面透明化 | 给 `[data-sidebar-right-panel="fullscreen"]` 及其 dockkit surface/pane 补一条与其它表面同源的令牌改写（或直接 `background:transparent`） | 最小，纯 CSS | 立竿见影，但仍是"逐个表面打补丁" |
| B. 壁纸抄进面板 | 全屏态把当前壁纸同步到面板自身 `background-image`（相当于 `::backdrop` 的替代品） | 中等；视频 / 网页 / 场景壁纸要单独处理 | 面板再怎么不透明都能显示壁纸，鲁棒性比 A 强 |
| C. 结构解：壁纸进背景 | 令壁纸成为 `body`/`#root` 的 `background-image`（例如新增 `--dshw-wallpaper-url`），任何透明表面自然透出壁纸 | 较大；视频与 iframe 壁纸仍需 fixed 层兜底 | **长期解**，能一次性消灭这一类"新表面盖住壁纸"的问题 |
| D. 监听 `fullscreenchange` | —— | —— | **不适用**：该事件在这里永远不触发。等价钩子是 `[data-rightbar-fullscreen]` / `[data-sidebar-right-panel="fullscreen"]`（`:has()` 或 MutationObserver） |

---

## 7. 给 issue 的一句话回复（草稿）

> 已定位：这个「全屏」走的是纯 CSS 布局态（`data-sidebar-right-panel="fullscreen"` + 面板 `width:100vw`），
> DSH 客户端从不调用 `requestFullscreen`（`document.fullscreenElement` 在全屏时仍是 `null`），
> 所以不是 Fullscreen API 的作用域问题。真实原因是壁纸作为 `z-index:-1` 的全局底层挂在 `#root` 之外，
> 面板铺满视口后，面板里未被插件改写表面令牌的那一层把壁纸盖住了——
> 也解释了为什么退出后瞬间恢复、最大化/F11 不受影响。
---

## 8. 修复记录（2026-11-19）

- `lib/client.js` 的 `CSS_TEXT` 末段新增一组规则：面板全屏时把 `[data-sidebar-right-panel="fullscreen"]` 自身、它的直接子 `div`（`.panelBody`）以及 `[data-dockkit-surface]` / `-cell` / `-host` / `-pane` / `-empty` 的 `background-color` 清成 `transparent!important`。
- 选择器用 `#root` 前缀（id 级）压过 DSH 的 CSS Modules 单类选择器，再加 `!important`，避免以后 DSH 调整模块样式时这条规则被无意盖掉。
- 只清 `background-color`，不动卡片 / 终端 / 编辑器等内容自身的底色；聊天区、非全屏状态完全不受影响。
- 已做的验证：`node --check lib/client.js` 通过；CSS 文本括号配平（126/126）、无注释泄漏；7 条选择器与 `app-extract` 中 DSH 实际渲染的属性逐一对照（`data-sidebar-right-panel="fullscreen"`、`data-dockkit-*`）。
- **尚未做**：真机像素级验证。本机沙箱不允许 Chromium 起子进程（`mojo ... Check failed: 拒绝访问`），无法出对比截图，需要在实际 DSH 里点一次 `⛶` 肉眼确认。正在按"全屏面板表面透明化"修。
