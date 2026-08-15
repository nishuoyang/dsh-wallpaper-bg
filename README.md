# dsh-wallpaper-bg

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 网页界面添加**独立的动态壁纸背景**的静态插件（v0.1.0）。

背景层独立于桌面 Wallpaper Engine —— 在 DSH 里换壁纸不会动你的桌面壁纸，反之亦然。

## 功能

- **三种壁纸来源**
  - **内置壁纸**：10 张 Unsplash 高清图
  - **自定义上传**：本地图片 / 视频，存入 IndexedDB，刷新后保留
  - **WE 壁纸库**：只读读取本机 Wallpaper Engine 已安装壁纸（默认 `http://127.0.0.1:8088`）
- **三种渲染**：静态图片、视频（canvas 渲染、30 FPS 上限、cover 裁剪无黑边）、场景（官方预览图 / GIF 动画回退）
- **四项调节**：遮罩透明度、背景模糊度、背景亮度、安全放大（0–10%，裁掉视频/图片自带的边缘黑边）
- **同步桌面壁纸**开关：只读跟随 WE 当前桌面壁纸（30 秒轮询）
- 设置持久化到 localStorage；界面表面自动半透明化以透出背景

## 原理

本包是 DSH **静态双半插件**：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| 宿主半（Node） | `lib/host.js` | 注册同源路由：`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 Range）、`/dsh-wallpaper-bg/we`（WE API 只读代理，带缓存）、`/dsh-wallpaper-bg/health` |
| 浏览器半 | `lib/client.js` | 单文件 client bundle（`window.__ModuleLoader__` 工厂形式），注入背景层与遮罩、注册设置面板「壁纸」选项卡 |

两端零构建：`lib/client.js` 是手写的单文件 bundle，无需任何打包工具，`npm install -g` 后直接可用。

## 安装

DSH 的预设行按包名从 **harness 组合文件所在目录**向上走 `node_modules` 链解析（宿主半和浏览器半使用同一个锚点）。因此插件必须装在该锚点链上的某个 `node_modules` 里：

- **profile 启动的部署**（`dsh web` 从 `%USERPROFILE%\.dsh\profiles\...` 启动，报错里会显示 `imported from C:\Users\...\.dsh\profiles\web\`）：装到 `%USERPROFILE%\.dsh\node_modules`。
- **全局 npm 安装的部署**（报错里显示 `imported from ...\node_modules\@deepseek-ai\dsh\...`）：`npm install -g` 即可。

```bash
# 方式一：从 npm 安装（发布后；prefix 换成你的锚点上级目录）
npm install --prefix %USERPROFILE%\.dsh dsh-wallpaper-bg

# 方式二：从 GitHub 安装
npm install --prefix %USERPROFILE%\.dsh github:<你的用户名>/dsh-wallpaper-bg

# 方式三：本地克隆后安装（开发模式，junction 实时生效）
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\node_modules\dsh-wallpaper-bg" `
         -Target "<本仓库路径>"
```

> 拿不准锚点时，先加预设行再启动一次会话，把启动报错里的 `imported from <目录>` 抄出来，把插件装进该目录链上的 `node_modules` 即可。

然后在你要使用的**预设**里加一行插件行。DSH 自带预设不可修改，请先复制一份：

1. 打开 DSH Web 界面，复制你常用的预设（如 `standard`）为新预设（例如 `standard-wallpaper`）；或直接手动复制部署自带预设目录到 `%USERPROFILE%\.dsh\.agent-presets\<新预设id>\` 并改写 `preset.yml`。
2. 在该预设的 `agent.cordis.yml` 末尾追加：

```yaml
# ── 壁纸背景 ────────────────────────────────────────────────────────────────
# 只消费宿主服务、不发布服务，无需 isolate 域
- id: wallpaper-bg
  name: dsh-wallpaper-bg
  config:
    weBase: http://127.0.0.1:8088
```

3. **重启 DSH**（插件表按包名缓存，新增插件需重启后进入 boot graph）。
4. 新建会话时选择该预设。打开 **设置 → 壁纸** 即可切换与调节。

> 也可用仓库里的 `install-local.ps1` 完成第 1 步的本地安装（仍需手动添加预设行）。

## WE 壁纸库（可选组件）

`wallpaper-engine-api/` 是配合使用的本机只读服务，把 Wallpaper Engine 已安装壁纸列表以 HTTP API 暴露在 `127.0.0.1:8088`：

1. 进入 `wallpaper-engine-api/`，执行 `npm install`。
2. 双击 `启动服务.bat`（或 `启动服务-静默.vbs`）启动。
3. 可选：双击 `设置开机自启.bat`，登录 Windows 时静默启动。

服务**只读**：仅调用列表 / 当前壁纸查询，绝不触碰设置或播放接口；未检测到 WE 运行时不会拉起 WE 主程序。

> 端口 8088 是历史选择：8080 曾被 Jenkins 占用。如需换端口，设置环境变量 `WEAPI_PORT`，并在插件设置面板里把基地址改成对应值。

## 设置面板说明

| 项 | 说明 |
| --- | --- |
| 内置壁纸 / 自定义上传 / WE 壁纸库 | 来源切换（每行 4 张缩略图） |
| 上传自定义壁纸 | 图片 / 视频，存入 IndexedDB |
| WE 基地址 + 刷新 | WE API 地址（默认 `http://127.0.0.1:8088`） |
| 同步桌面壁纸 | 只读跟随 WE 当前桌面壁纸 |
| 遮罩透明度 / 背景模糊度 / 背景亮度 | 0–100% / 0–20px / 50–150% |
| 安全放大 | 0–10%，按比例放大背景以裁掉边缘黑边 |
| 恢复默认 | 一键重置全部设置 |

## 常见问题

- **场景类壁纸不动？** WE 场景壁纸是 `scene.pkg` 编译包，只有 WE 自己的引擎能渲染，浏览器无法执行。插件回退显示官方预览图（GIF 预览会保持动画）。
- **视频有黑边？** 用「安全放大」拉 2–3% 即可裁掉画面自带的黑边（渲染层的 cover 裁剪已保证不自造黑边）。
- **改了代码不生效？** 改 `lib/client.js` 或 `lib/host.js` 后重启 DSH（客户端 bundle 按内容哈希进 boot graph，新增/移除插件行需要重启）。
- **WE 壁纸库报错？** 确认 `wallpaper-engine-api` 服务在 8088 端口运行（浏览器访问 `http://127.0.0.1:8088/health` 验证），且插件设置里的基地址一致。

## 开源

MIT License，见 [LICENSE](LICENSE)。欢迎 issue / PR。

`legacy/` 目录存放 v0.1.0 之前的动态插件（Cordis dynamic package）时代源码，仅作归档。
