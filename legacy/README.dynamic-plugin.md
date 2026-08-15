# dsh-wallpaper-bg

让 DeepSeek Harness (DSH) Web UI 拥有**独立于桌面 Wallpaper Engine 的壁纸背景**。背景层完全属于浏览器页面，切换壁纸不会影响桌面壁纸；同时可以只读读取 WE 壁纸库，在 DSH 内独立展示。

## 功能

- **三种壁纸来源**（设置面板中切换）
  - **内置壁纸**：10 张 Unsplash 免费图片，网格缩略图展示
  - **自定义上传**：上传图片 / 视频，存入 IndexedDB 持久化
  - **WE 壁纸库**：只读读取 Wallpaper Engine 本地 HTTP API（默认 `http://127.0.0.1:8088`），在 DSH 内独立渲染 WE 已安装壁纸，**不调用 WE 的设置/播放接口，桌面壁纸保持不变**
- **三种壁纸类型**
  - 静态图片：`background-image`（cover 居中）
  - 视频壁纸：`<video muted autoplay loop playsinline>` 解码 → `<canvas>` 绘制，**帧率上限 30 FPS**
  - 动态场景：`<iframe>` 嵌入 WE 本地预览页（帧率由 WE 预览页自控；无预览地址时回退为缩略图）
- **背景层结构**
  - `<div id="dsh-wallpaper-bg">`：`position:fixed` 全屏，`z-index:-1`，`pointer-events:none`
  - `<div id="dsh-wallpaper-overlay">`：半透明遮罩（默认 `rgba(0,0,0,0.4)`），位于背景层之上、对话内容之下
- **调节项**：遮罩透明度 0–100%、背景模糊 0–20px（`filter: blur()`）、背景亮度 50–150%
- **同步桌面壁纸**（仅 WE 模式）：开启后每 30 秒只读获取 WE 当前壁纸并自动同步显示；关闭时使用 DSH 内独立选择
- **持久化**：来源 / 壁纸 ID / 全部设置存 `localStorage`，刷新自动恢复；上传存 `indexedDB`
- **WE 库缓存**：Host 侧内存缓存，列表 5 分钟、当前壁纸 10 秒，避免每次打开面板都请求 API

## 目录

| 文件 | 内容 |
| --- | --- |
| `src/types.ts` | 类型定义与常量（默认设置、缓存 TTL、帧率间隔等） |
| `src/wallpapers.ts` | 10 张内置壁纸数据 |
| `src/we-bridge.ts` | WE API 桥接层：只读 GET、多端点/多响应形状归一化、缓存 |
| `src/index.ts` | 插件主入口（Host）：WE API 代理转发 + `/dsh-wallpaper-bg` 本地资源代理路由 |
| `src/ui.ts` | Web UI 背景层：DOM 注入、图片/视频/场景渲染器、遮罩与滤镜 |
| `src/settings.ts` | 设置面板（`settings.section` Slot「壁纸」选项卡）+ 状态管理（localStorage/IndexedDB） |

## 部署方式

### 1. 动态插件（推荐，本会话内即时生效）

DSH 动态 Cordis 插件以**纯 JavaScript 函数体**部署（动态插件不支持 TypeScript / JSX / import / bundler），因此运行时代码是 `src/*.ts` 的逐行内联版本，通过 `cordis_define` 提交 Host / Client 两半，`cordis_run` 激活。本项目仓库的 `.ts` 文件是运行时代码的源码镜像（带类型），供阅读、类型检查与版本管理。

### 2. 源码镜像运行 / 类型检查

```powershell
pnpm typecheck   # tsc --noEmit 类型检查（无构建产物）
node --experimental-strip-types src/index.ts   # Node ≥ 22.6 直接运行（语法级验证）
```

`package.json` 无任何运行时依赖，不需要打包工具。

## 运行时契约（本实现所依赖的 DSH 能力）

实现前通过 `cordis_inspect_*` 逐一确认：

- **Client 闭包面**：`React` / `host` / `styles` / `console` + 浏览器全局（`document`、`window`、`localStorage`、`indexedDB`、`URL` 等）；`fetch` / `setTimeout` / `setInterval` 被陷阱屏蔽 → 定时器一律用 `ctx.interval`（timer 服务），网络一律走 `host.call` RPC。
- **设置选项卡**：Client `settings.section` Slot（list，注册 `{ id, order, label }`，owner props 含 `close`）。
- **主题**：`ctx.theme.overrideTokens(source, tokens)`，tokens 为 `{ token: { light, dark } }`；本插件把 `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1/2`、`--dsw-specific-sidebar-fill` 覆盖为半透明，让背景层透出（卸载时自动恢复）。
- **Host RPC**：`harness.handle('we:api', handler)` ↔ Client `host.call('we:api', args)`（JSON）。
- **代理路由**：`ctx.webServer.register({ kind: 'prefix', path: '/dsh-wallpaper-bg', handler })`，handler 为 Node `(req, res)`。浏览器通过同源 URL `/dsh-wallpaper-bg/asset?path=...` 获取 WE 本地文件（图片/视频/缩略图），支持单区间 Range（视频可拖动进度）。
- **文件读取**：`ctx.fs.readBytes`——**读操作在所有沙箱模式下放行**，可读取 Steam 目录下的 WE 壁纸文件；仅写入受限。
- **出站 HTTP**：本部署未注册 `web.fetch` provider，且动态插件沙箱无 `fetch` / `node:http`，故 WE API 的只读 GET 通过 `ctx.subprocess` + `curl.exe`（缺失时回退 `powershell Invoke-RestMethod`）完成，单次超时 8 秒，输出 collect 上限 8 MB。

## 关于 Wallpaper Engine 本地 API

Wallpaper Engine **官方默认不开放 HTTP API**。本插件面向规范约定的 `http://127.0.0.1:8088` 只读接口实现，并做了兼容层：

- **端点自动尝试**：
  - 列表：`/api/wallpapers` → `/wallpapers` → `/api/wallpapers/list` → `/api/list` → `/list`
  - 当前：`/api/current` → `/current` → `/api/wallpapers/current` → `/wallpapers/current` → `/api/state`
  - 探测：`/` → `/health` → `/api/health`
- **响应形状自动归一化**：数组根、`{wallpapers}`、`{data}`、`{result}`、`{items}` 等；
  字段兼容 `id/publishedfileid/workshopId`、`title/name/projectname`、`thumbnail/preview`、`type/filetype`、`filepath/path/file/resourcePath`、`previewUrl`。
- 基地址可在设置面板「WE 壁纸库」模式下修改。

推荐直接使用提供上述只读端点的社区 WE API 服务（例如基于 npm 包 [wallpaper-engine-api](https://www.npmjs.com/package/wallpaper-engine-api) 的本地服务），或自建仅暴露列表 + 当前壁纸 + 本地路径的最小服务。**本插件不会调用任何会修改桌面壁纸的接口。**

### 本机 WE API 部署（`wallpaper-engine-api/` 目录）

本仓库已配套一个只读 WE API 服务（`server.js`，端口 `127.0.0.1:8088`，默认值可由环境变量 `WEAPI_PORT` 覆盖），并提供三种运行方式：

| 文件 | 用途 |
| --- | --- |
| `启动服务.bat` | 前台运行（带窗口，Ctrl+C / 关窗口停止；首次运行带配置向导） |
| `启动服务-静默.vbs` | **后台静默启动（无窗口）**，日志追加写入同目录 `we-api.log` |
| `设置开机自启.bat` | 把静默启动器复制到用户「启动」文件夹，**登录 Windows 自动后台启动**（无需管理员权限） |
| `取消开机自启.bat` | 移除上述自启项 |

注意：静默模式若端口已被占用（如前台窗口还在跑），新实例会写入 `we-api.log` 后退出；停止后台实例可在管理员终端用 `netstat -ano | findstr :8088` 找到 PID 后 `taskkill /PID <pid> /F`。

## 已知限制

1. **场景 iframe 帧率**：iframe 内部渲染帧率由 WE 预览页自控，宿主无法从外部限帧到 15 FPS；视频壁纸的 30 FPS 上限通过 canvas 定时步进实现。
2. **网络缩略图**：WE API 若返回 `http://...` 缩略图 URL，会直接由浏览器加载（本地路径则全部走 Harness 代理）。DSH 动态插件沙箱没有二进制出站抓取能力，无法对网络资源做二进制反代。
3. **大视频文件**：本地视频经代理一次性读入内存（上限 512 MB）后分块响应，超大视频可能因内存受限；视频代理已支持 Range，拖动进度可用。
4. **动态插件生命周期**：动态插件为当前进程内的运行时扩展，重启 DSH 进程后需重新 `cordis_run`（定义与授权会保留）；如需常驻，请将本工程按 DSH 预设插件行方式安装。
5. **透明表面**：插件将 DSH 应用表面令牌覆盖为半透明以露出背景，卸载插件后自动恢复原主题。

## 许可证

MIT
