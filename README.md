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

本包是 DSH **静态双半插件**，并作为 **profile 补丁层（bundle）**组合进 DSH 的 host 平面：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| 宿主半（Node） | `lib/host.js` | 注册同源路由：`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 Range）、`/dsh-wallpaper-bg/we`（WE API 只读代理，带缓存）、`/dsh-wallpaper-bg/health` |
| 浏览器半 | `lib/client.js` | 单文件 client bundle（`window.__ModuleLoader__` 工厂形式），注入背景层与遮罩、注册设置面板「壁纸」选项卡 |
| 组合层 | `cordis.patch.yml` | `dsh.bundle` 补丁：把插件行插入 profile 组合的 host 平面，**随 `dsh web` 启动即生效**，首次加载页面就带背景 |

两端零构建：`lib/client.js` 是手写的单文件 bundle，无需任何打包工具；另附 `dsh-wallpaper-bg` CLI（`install`/`status`/`uninstall`）完成一键安装。

## 安装

### 方式一：一键 CLI（推荐）

```bash
npm install -g dsh-wallpaper-bg     # 把 dsh-wallpaper-bg 命令装上 PATH（发布后；本地开发用 npm install -g <仓库路径>）
dsh-wallpaper-bg install            # 自动完成全部安装，幂等可重跑
```

`install` 自动做三件事，全程无需手改文件：

1. **解析链检查**：用与 DSH 一致的 ESM 方式探测插件包能否从 harness 锚点解析（DSH 按包名从组合文件目录向上走 `node_modules` 链解析，宿主半与浏览器半同一锚点）；
2. 解析不到时在 `%USERPROFILE%\.dsh\node_modules` 建指向本包的 junction（Windows）/符号链接；
3. **写入 profile 补丁层** `profiles/<name>/cordis.patch.yml`（用户自有补丁层，带管理标记，`uninstall` 可干净移除）。

装完**刷新页面即可看到壁纸背景**——补丁层支持热重载，之后每次 `dsh web` 启动、首次加载页面就生效，无需会话、无需预设、无需重启。

其它命令：`dsh-wallpaper-bg status`（查看安装状态）、`dsh-wallpaper-bg uninstall`（卸载；移除本插件行后若补丁层只剩注释/空白，会自动恢复为带 `[]` 的模板，**不会**留下让 `dsh web` 启动失败的空文件）。

### 方式二：官方 dsh 命令（npm 发布后）

```bash
dsh plugin --profile web add dsh-wallpaper-bg    # 装进 profile 并作为 bundle 层激活，效果同方式一
```

> 本地路径含空格时 `dsh plugin` 的参数转发会被拆断，请用裸包名（npm 发布版 / GitHub 包）。

### 方式三：预设行模式（按会话挂载，可选）

想按会话开关壁纸（而不是全局常驻）时：

```bash
dsh-wallpaper-bg install --preset
```

会复制 `standard` 预设为 `standard-wallpaper` 并追加插件行；重启 DSH 后新建会话选择该预设即可。也可以手动在任一预设的 `agent.cordis.yml` 末尾追加：

```yaml
- id: wallpaper-bg
  name: dsh-wallpaper-bg
  config:
    weBase: http://127.0.0.1:8088
```

> 拿不准锚点时：CLI 的 `status` 会直接给出结论；手动排障则把启动报错里的 `imported from <目录>` 抄出来，把插件装进该目录链上的 `node_modules` 即可。

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
