# dsh-wallpaper-engine-api

> v0.1.1 · MIT License · Windows
> [English](https://github.com/nishuoyang/dsh-wallpaper-bg/blob/main/dsh-wallpaper-engine-api/README.md) · 简体中文

把 [dsh-wallpaper-bg](https://github.com/nishuoyang/dsh-wallpaper-bg) 仓库里原来那份需要 **clone 仓库 → `npm install` → 双击 `.bat` → 设置开机自启** 的 `wallpaper-engine-api/` 独立服务，做成一个 DSH 插件。

装好后，插件在 DSH 宿主进程内开一个**只读** HTTP API，把本机 Wallpaper Engine 的已安装壁纸交给 `dsh-wallpaper-bg` 的「WE 壁纸库」来源。一条命令即可：

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
```

桌面端更简单：**设置 → 插件** → 输入包名 `dsh-wallpaper-engine-api` → 安装 → 重启。

不需要 PATH 里有 Node.js，没有独立进程、启动脚本或开机自启项，也不会改动你的桌面壁纸。

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [与旧手动服务的区别](#与旧手动服务的区别)
- [安装](#安装)
- [验证安装](#验证安装)
- [主要 API 接口说明](#主要-api-接口说明)
- [使用示例](#使用示例)
- [配置项](#配置项)
- [端口与生命周期](#端口与生命周期)
- [只读与安全](#只读与安全)
- [常见问题](#常见问题)
- [开发与测试](#开发与测试)
- [发布到 npm](#发布到-npm)
- [许可证](#许可证)

## 项目简介

Wallpaper Engine（下称 WE）把已订阅壁纸放在 Steam 创意工坊目录 `steamapps\workshop\content\431960` 下，每张壁纸是一个子目录，里面有一份 `project.json`。桌面壁纸的当前选择则记在 WE 安装目录的 `config.json` 里。

本插件做的事情很单一：**把这两处只读地暴露成 HTTP 接口**，让 `dsh-wallpaper-bg` 能列出壁纸、读到当前桌面壁纸，并让网页类壁纸能在背景里正常渲染。它不接管 WE、不替换 WE 的渲染，也不写入任何文件。

- 包名：`dsh-wallpaper-engine-api`（DSH profile bundle，宿主平面一行）
- API 契约：与旧服务 `wallpaper-engine-api` **0.5.1** 对齐（`webShim: 1`、`monitorSelect: 1`）
- 端口：默认 `127.0.0.1:8088`，占用时自动换端口并由主插件自动发现
- 依赖：零运行时依赖、零构建，直接解析 WE 的 `project.json` / `config.json`

## 功能特性

- **一条命令装好**：`dsh plugin … add`，或在桌面端插件页填包名；升级也只需要重新 `add` 一个版本。
- **活在 DSH 进程里**：服务随 DSH 启动 / 退出，不留后台进程，也不写开机自启项。
- **零运行时依赖**：不依赖 `wallpaper-engine-api` npm 包，单个损坏的 `project.json` 只会被跳过，不会让整个列表失败。
- **Steam 库自动发现**：注册表 → `steamapps/libraryfolders.vdf` → 常见安装目录，能覆盖装在第二个 Steam 库里的 WE。
- **端口礼貌处理**：端口上已有旧版 WE API 服务时直接复用；被无关程序占用时自动换到下一个端口、再退到系统分配的端口。
- **同源状态路由**：`GET <DSH 地址>/dsh-wallpaper-engine-api/status` 把实际端口告诉主插件，换端口后不需要用户改基地址。
- **按真实订阅过滤**：读 Steam 的 `431960_subscriptions.vdf`，跳过已退订与 `disabled_locally 1` 的壁纸，和 WE 界面保持一致。
- **多显示器**：`/api/current` 能自动判断该跟随哪台显示器（最近改动 / 正在播放），也支持手动指定。
- **网页类壁纸可用**：`/files` 输出正确 MIME、`ETag` / 304、`Range` / 206，并给 HTML 注入 WE 私有接口垫片。
- **失败也不拖垮宿主**：找不到 WE、缺 `config.json`、监听失败都只反映在 `/health` 与状态路由里，插件照常激活。

## 与旧手动服务的区别

| | 旧 `wallpaper-engine-api/` | 本插件 |
| --- | --- | --- |
| 安装 | clone + `npm install` + 双击 `.bat` + 开机自启 | 一条命令 / 插件页面填包名 |
| 进程 | 独立 Node 进程，DSH 管不到 | 在 DSH 宿主进程内，随 DSH 启停 |
| Node.js | 需要 PATH 里有 Node | 不需要（桌面端自带运行时） |
| 升级 | `git pull` + `npm install` + 重启服务 | 重新 `dsh plugin … add dsh-wallpaper-engine-api@<版本>` |
| 路径探测 | 注册表 + 常见目录 | 注册表 + `libraryfolders.vdf`（覆盖第二个 Steam 库）+ 常见目录 |
| 端口冲突 | 8088 被占用就起不来 | 自动复用已有 WE API，或换端口并由主插件自动发现 |
| 找不到 WE | 进程退出码 1 | 插件照常激活，`/health` 与面板显示可操作的原因 |

旧的 `wallpaper-engine-api/` 目录仍保留在仓库里，供不想装插件的用户使用；新用户直接用本插件即可。

## 安装

### 桌面端

1. **设置 → 插件**，在安装框输入 `dsh-wallpaper-engine-api`；
2. 按提示重启桌面端（或重载窗口）；
3. 打开 **设置 → 壁纸 → WE 壁纸库**。

### 命令行

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api       # 网页版
dsh plugin --profile desktop add dsh-wallpaper-engine-api   # 桌面端 profile
```

### 前提

- **Windows**（Wallpaper Engine 没有其他平台的版本）；
- 本机已通过 Steam 安装 **Wallpaper Engine**；
- 已安装 `dsh-wallpaper-bg`——本插件只提供数据，界面在那边。

### 升级

升级必须显式给版本：

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api@latest
# 或锁定版本
dsh plugin --profile web add dsh-wallpaper-engine-api@0.1.1
```

pnpm 会保留 profile 清单里已有的版本范围，重复执行不带版本的 `add` 不会升级；pnpm 11 还有「发布满约 24 小时才安装新版」的默认门槛，刚落发布的版本可以写死版本号立刻安装。

## 验证安装

1. 插件页面能看到 **Wallpaper Engine 壁纸库 API**，状态为启用；
2. 打开 `<DSH 地址>/dsh-wallpaper-engine-api/status`，应返回 JSON，其中 `base` 是实际 API 地址（例如 `http://127.0.0.1:8088`）；
3. 打开 `base` 的 `/health`：`"mode": "readonly"`，`weInstallPath` / `workshopPath` 非空，`error` 为空；
4. `dsh-wallpaper-bg` 的 WE 页签能列出壁纸，「同步桌面壁纸」可用。

`status.external: true` 表示这个端口上已有一个旧的 WE API 服务被发现并复用，本插件不会重复监听。

## 主要 API 接口说明

服务只监听 `127.0.0.1`，只接受 `GET` / `HEAD`（其它方法返回 `405`），所有 JSON 响应带 `Cache-Control: no-store`。

| 端点 | 作用 |
| --- | --- |
| `GET /health` | 服务状态、WE 路径、实际端口、错误原因 |
| `GET /api/wallpapers` | 已安装壁纸列表（按 Steam 真实订阅清单过滤） |
| `GET /api/current[?monitor=]` | 当前桌面壁纸（多显示器自动判定 / 手动指定） |
| `GET /files/<id>/<rel>` | 网页类壁纸目录文件（HTML 注入 WE 私有接口垫片） |
| `GET <DSH 地址>/dsh-wallpaper-engine-api/status` | 同源发现路由，供主插件拿实际端口 |

### GET /health

别名：`/`、`/api/health`。无论探测是否成功都返回 `200`，失败原因写在 `error` 里。

```json
{
  "ok": true,
  "service": "dsh-wallpaper-engine-api",
  "plugin": "dsh-wallpaper-engine-api",
  "version": "0.1.1",
  "api": "0.5.1",
  "status": "running",
  "running": true,
  "external": false,
  "externalService": "",
  "base": "http://127.0.0.1:8088",
  "port": 8088,
  "requestedPort": 8088,
  "fallbackFrom": null,
  "mode": "readonly",
  "webShim": 1,
  "monitorSelect": 1,
  "weInstallPath": "E:\\SteamLibrary\\steamapps\\common\\wallpaper_engine",
  "workshopPath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960",
  "subscriptionsFile": "C:\\Program Files (x86)\\Steam\\userdata\\123456789\\ugc\\431960_subscriptions.vdf",
  "pathsSource": "auto",
  "weRunning": true,
  "error": "",
  "startedAt": "2026-10-27T00:10:00.000Z",
  "time": "2026-10-27T00:10:30.000Z"
}
```

| 字段 | 说明 |
| --- | --- |
| `ok` | 服务是否可用（等价于 `running`） |
| `status` | `idle` / `starting` / `running`（本插件监听）/ `external`（复用外部服务）/ `error` / `unsupported`（非 Windows）/ `stopped` |
| `version` | 插件版本 |
| `api` | 兼容的旧服务契约版本（`0.5.1`） |
| `base` / `port` / `requestedPort` | 实际地址、实际端口、配置里请求的端口 |
| `fallbackFrom` | 发生换端口时，原来请求失败的端口；没换过为 `null` |
| `external` / `externalService` | 是否复用了端口上已有的 WE API 服务，以及它的 `service` 标识 |
| `mode` / `webShim` / `monitorSelect` | 能力标记：只读、支持网页壁纸垫片、支持显示器选择 |
| `weInstallPath` / `workshopPath` | WE 安装目录、创意工坊壁纸库 |
| `subscriptionsFile` | 实际使用的订阅清单（多份用 `; ` 分隔） |
| `pathsSource` | 路径来源：`auto` 自动探测 / `config` 配置指定 / `none` 都没拿到 |
| `weRunning` | 检测到 `wallpaper32/64.exe` 或 `wallpaperservice32.exe` 在跑 |
| `error` | 可操作的错误描述；`/health` 与面板都读这个字段 |

### GET /api/wallpapers

别名：`/wallpapers`、`/api/wallpapers/list`、`/api/list`、`/list`。

| 查询参数 | 说明 |
| --- | --- |
| `refresh=1` | 跳过 60 秒列表缓存，重新读磁盘（订阅清单缓存 30 秒） |

```json
{
  "ok": true,
  "wallpapers": [
    {
      "id": "1234567890",
      "title": "Neon City",
      "type": "video",
      "filepath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\scene.pkg",
      "entry": "scene.pkg",
      "thumbnail": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
      "previewUrl": "",
      "previewFile": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
      "previewSize": { "w": 1920, "h": 1080 },
      "tags": ["Abstract"],
      "description": "",
      "rating": "everyone"
    }
  ],
  "count": 1,
  "hiddenUnsubscribed": 3,
  "skippedNoProject": 1
}
```

- `count` 是过滤后实际返回的条数；
- `hiddenUnsubscribed` 是因为不在订阅清单里（或 `disabled_locally 1`）被过滤掉的条数；
- `skippedNoProject` 是目录存在但 `project.json` 缺失 / 损坏、因而跳过的条数；
- `type` 取 `project.json` 的 `type`，缺失时按扩展名推断（`.pkg` → `scene`，`.html` → `web`，视频 / 图片同理）；
- `previewSize` 从 `preview.gif` / PNG / JPEG 头部解析，解析不出为 `null`；
- 壁纸库不可用时返回 `503`，`error` 说明缺哪个路径。

### GET /api/current

别名：`/current`、`/api/wallpapers/current`、`/wallpapers/current`、`/api/state`。

| 查询参数 | 说明 |
| --- | --- |
| `monitor`（或 `m`） | `Monitor1` / `1` 指定显示器（键名对应 WE `config.json` 里的 `Monitor0`、`Monitor1`…）；`auto` 或省略为自动判定 |

自动判定的顺序是：**手动参数 → 最近改动过的那台显示器 → 正在播放（媒体文件 atime 明显领先）的那台 → 第一台**。

```json
{
  "ok": true,
  "current": {
    "id": "1234567890",
    "title": "Neon City",
    "type": "video",
    "filepath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\scene.pkg",
    "entry": "scene.pkg",
    "thumbnail": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
    "previewUrl": "",
    "previewFile": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
    "previewSize": { "w": 1920, "h": 1080 },
    "tags": [],
    "description": "",
    "rating": "everyone"
  },
  "monitor": "Monitor1",
  "monitorSource": "changed",
  "monitors": [
    { "key": "Monitor0", "title": "Aurora", "type": "scene", "live": false, "selected": false },
    { "key": "Monitor1", "title": "Neon City", "type": "video", "live": true, "selected": true }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `current` | 选中显示器的壁纸条目，结构同 `/api/wallpapers` 的元素；取不到为 `null` |
| `monitor` | 最终选中的显示器键名 |
| `monitorSource` | `manual` 手动参数 / `changed` 最近改动 / `live` 正在播放 / `first` 兜底第一台 / `none` 没有可用壁纸 |
| `monitors[]` | 每台显示器的键名、标题、类型，以及 `live`（正在播放）、`selected`（本次选中） |
| `error` | 仅在读不到 WE `config.json` 时出现，此时仍是 `200` + `current: null` |

WE 安装目录不可用时返回 `503`。

### GET /files/&lt;id&gt;/&lt;rel&gt;

按创意工坊 ID 提供该壁纸目录内的文件，`rel` 省略时默认 `index.html`。

| 行为 | 说明 |
| --- | --- |
| 路径限制 | `id` 只能是数字，且要是已订阅壁纸（找不到订阅清单时不校验）；解析后的绝对路径必须落在 `workshopPath\<id>` 内，越界返回 `403` |
| MIME | 按扩展名映射（HTML / CSS / JS / 图片 / 音频 / 字体 / `mp4` / `webm` / `wasm`…），未知类型 `application/octet-stream` |
| 缓存 | HTML 为 `no-cache`，其它文件 `public, max-age=300`；响应带 `ETag` 与 `Last-Modified`，命中 `If-None-Match` 返回 `304` |
| 断点续传 | 支持单段 `Range`，返回 `206` 与 `Content-Range`；区间非法返回 `416` |
| 垫片注入 | 仅对**文档请求**（直接打开、`iframe` 加载；`fetch` 拿到的是原始 HTML）注入 `<script data-wbg-we-shim="1">` |
| 相对路径兜底 | 壁纸里写死的 `../assets/…` 会被浏览器折叠成 `/files/assets/…`，此时按 `Referer` 里的壁纸 ID 兜底，仍限制在该目录内 |

垫片做四件事：暴露 `window.__wbgWeShim`；用 `project.json` 的 `general.properties` 默认值驱动 `wallpaperPropertyListener.applyUserProperties`；为媒体 / 音频接口提供占位实现（静音频谱，避免壁纸因 `undefined` 报错）；检测「已画出内容」并向父页面发消息：

```js
{ __wbg: 1, type: 'painted' | 'error', id: '<壁纸 ID>', payload: null | { message } }
```

### GET &lt;DSH 地址&gt;/dsh-wallpaper-engine-api/status

同源发现路由，由宿主的 `webServer` 注册；`/dsh-wallpaper-engine-api`、`/dsh-wallpaper-engine-api/health` 也指向它。返回体是 `/health` 的全部字段，再加：

```json
{
  "discover": true,
  "plugin": "dsh-wallpaper-engine-api",
  "pluginVersion": "0.1.1",
  "apiBase": "http://127.0.0.1:8088"
}
```

其它路径返回 `404` 与 `{ "ok": false, "error": "未知路由: …" }`。主插件不填基地址时会先请求这个路由，拿到 `apiBase` 再转发。

### 状态码

| 状态码 | 场景 |
| --- | --- |
| `200` | 正常；`/health` 在探测失败时也用它，原因看 `error` |
| `206` / `304` / `416` | `Range` 分段、`ETag` 命中、区间非法 |
| `400` | 非法 URL、非法壁纸 ID、非法路径编码 |
| `403` | 壁纸未订阅 / 已本地禁用、路径越界 |
| `404` | 文件或壁纸目录不存在、未知端点 |
| `405` | 非 `GET` / `HEAD` |
| `503` | 壁纸库或 WE 安装目录不可用 |

## 使用示例

以下示例假设 `base` 为 `http://127.0.0.1:8088`，实际端口以 `/status` 的 `apiBase` 为准。Windows 的 PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，请写 `curl.exe`。

**1. 看一眼服务状态**

```bash
curl.exe -s http://127.0.0.1:8088/health
```

**2. 列出壁纸，只看标题和类型**

```bash
curl.exe -s "http://127.0.0.1:8088/api/wallpapers?refresh=1"
```

```bash
node -e "fetch('http://127.0.0.1:8088/api/wallpapers').then(r=>r.json()).then(d=>console.log(d.count+' 张：'+d.wallpapers.map(w=>w.title+'('+w.type+')').join('、')))"
```

**3. 读第二台显示器的当前壁纸**

```bash
curl.exe -s "http://127.0.0.1:8088/api/current?monitor=1"
```

**4. 把网页类壁纸嵌进页面**

```html
<iframe
  src="http://127.0.0.1:8088/files/1234567890/index.html"
  style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>

<script>
  addEventListener('message', (event) => {
    // 垫片以 targetOrigin='*' 发出，父页面自己校验来源
    if (event.origin !== 'http://127.0.0.1:8088') return
    const msg = event.data
    if (!msg || msg.__wbg !== 1) return
    if (msg.type === 'painted') console.log('壁纸已绘制：' + msg.id)
    if (msg.type === 'error') console.warn('壁纸脚本报错：', msg.payload)
  })
</script>
```

**5. 在 `dsh-wallpaper-bg` 里使用**

打开 **设置 → 壁纸 → WE 壁纸库** 即可，列表与「同步桌面壁纸」都走本服务。主插件会先请求同源 `/dsh-wallpaper-engine-api/status` 拿 `base`，**不需要手填基地址**；只有你在主插件里手动覆盖过基地址时，才需要让它和 `base` 保持一致。

## 配置项

默认零配置：自动探测 Steam / WE / 创意工坊目录，端口 `8088`。只有自动探测失败或端口冲突时才需要覆盖配置——在 profile 的 `cordis.patch.yml` 里改本插件那一行（桌面端为 `%DSH_HOME%\profiles\desktop\cordis.patch.yml`）：

```yaml
- id: wallpaper-engine-api
  name: dsh-wallpaper-engine-api
  config:
    port: 8088
    # 可选：WE 装在自动探测不到的位置时手填
    weInstallPath: D:\Steam\steamapps\common\wallpaper_engine
    workshopPath: D:\Steam\steamapps\workshop\content\431960
    # 可选：显式指定订阅清单
    subscriptionsFile: D:\Steam\userdata\1588688173\ugc\431960_subscriptions.vdf
    # 端口被非 WE 程序占用时自动换端口（默认 true）
    autoPort: true
    # 把诊断信息写进宿主日志（默认 false）
    verbose: false
```

| 配置项 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `port` | number | `8088` | 监听端口，只绑 `127.0.0.1`；`0` 表示直接让系统分配 |
| `weInstallPath` | string | 自动探测 | WE 安装目录（含 `wallpaper64.exe`）；「同步桌面壁纸」要靠它读 `config.json` |
| `workshopPath` | string | 自动探测 | 创意工坊壁纸库，通常是 `…\steamapps\workshop\content\431960` |
| `subscriptionsFile` | string | 自动查找 | 显式指定 `431960_subscriptions.vdf`；不填则扫描各 Steam 库的 `userdata\*\ugc\` |
| `autoPort` | boolean | `true` | 端口被非 WE 程序占用时是否自动换端口 |
| `verbose` | boolean | `false` | 把启动 / 换端口 / 探测失败等诊断信息写进宿主日志 |

也支持环境变量（优先级低于行配置）：

| 环境变量 | 等价配置项 |
| --- | --- |
| `WEAPI_PORT`（或 `WE_API_PORT`） | `port` |
| `WE_INSTALL_PATH` | `weInstallPath` |
| `WE_WORKSHOP_PATH` | `workshopPath` |
| `WE_SUBSCRIPTIONS_FILE` | `subscriptionsFile` |
| `DSH_WE_API_DEBUG=1` | `verbose` |

路径解析顺序是 **行配置 > 环境变量 > 自动探测**；自动探测依次看注册表（`HKCU\Software\Valve\Steam`、`HKLM\…\Valve\Steam`）、各 Steam 库的 `libraryfolders.vdf`、以及 `C:`–`H:` 的常见安装目录。只填 `workshopPath` 时，会先按它所在的 Steam 库反推 WE 安装目录，比全盘探测更准。

改完配置要重启 DSH 才生效（宿主侧是 Node 模块，不热重载）。

## 端口与生命周期

- 只绑定 `127.0.0.1`，不对局域网或公网开放；
- 默认 `8088`。该端口上已有旧的 WE API 服务（`/health` 的 `service` 可识别）时直接复用，状态为 `external`；被无关程序占用时，`autoPort` 开启就依次尝试下一个端口、再退到系统分配的空闲端口；
- 实际地址通过同源状态路由暴露，`dsh-wallpaper-bg` 用 `base` 自动接上——端口变了用户无感；
- 服务只活在 DSH 进程里：DSH 退出即释放端口，没有后台残留，也没有开机自启项；
- 非 Windows 上插件仍会激活，但 `/health` 的 `status` 为 `unsupported`，并说明原因。

## 只读与安全

- 只调用「列出壁纸」与「读取当前壁纸配置」，**绝不**调用 WE 的 `load` / `stop` / `openProfile` 等接口，桌面壁纸不受影响；
- 不解析 `scene.pkg`、不截屏、不生成视频 / 帧缓存、不写任何文件（列表与订阅清单只在内存里缓存）；
- 网页类壁纸在**独立端口**上渲染（与 DSH 页面不同源），创意工坊里的第三方 HTML 拿不到 DSH 的 origin、Cookie 或 localStorage；
- `/files` 只服务已订阅壁纸目录内的文件，做了路径越界检查；HTML 只对文档请求注入垫片；
- 列表按 Steam 真实订阅清单过滤，已退订 / 本地禁用的壁纸不会出现；
- 已知边界：服务只在本机回环地址可达，但响应带 `Access-Control-Allow-Origin: *`，因此**本机**任意网页都能读到壁纸列表与文件名——请把它当作本机可信环境下的本地服务。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| `/status` 返回 404 | 插件没装进当前 profile，或装完没重启 DSH；确认 `dsh.profile.bundles` 里有 `dsh-wallpaper-engine-api` |
| `error` 说找不到 Wallpaper Engine | 在配置里填 `weInstallPath`（含 `wallpaper64.exe` 的目录）后重启 DSH；装在第二个 Steam 库时确认 `libraryfolders.vdf` 可读 |
| 列表为空但 WE 里有壁纸 | 先在 WE 里订阅；检查 `workshopPath` 与 `subscriptionsFile`；`hiddenUnsubscribed` 说明被订阅清单过滤掉了 |
| 列表比 WE 里少几张 | 看 `hiddenUnsubscribed`（已退订 / `disabled_locally 1`）与 `skippedNoProject`（目录缺 `project.json`） |
| 同步桌面壁纸不可用 | 读不到 WE 的 `config.json`：确认 `weInstallPath` 指向 WE 安装目录，且当前 Windows 用户有读取权限 |
| `monitor` 参数不生效 | 键名要存在（`Monitor0`、`Monitor1`…，或简写 `1`）；传了不存在的键会退回自动判定 |
| 网页壁纸白屏 / 黑屏 | 用 `iframe` 或直接打开 `/files/<id>/index.html`；用 `fetch` 取 HTML 不会注入垫片，壁纸依赖的 WE 接口会缺失 |
| 「连不上 WE API 服务」 | 看 `/status` 的 `base` 与 `error`；若主插件里手动改过基地址，改成默认或清空 |
| 8088 上还是旧服务 | `status.external: true` 属于正常复用；想换成本插件，先运行旧目录的 `取消开机自启.bat` 并结束旧进程，再重启 DSH |
| 改了配置没生效 | 宿主侧配置不会热重载，重启 DSH |

几个高频问题：

**会不会自动换掉我的桌面壁纸？** 不会。服务只有读接口；`dsh-wallpaper-bg` 的「同步桌面壁纸」只是读取你当前的 WE 壁纸、把它用作 DSH 背景，不会反向修改 WE 或 Windows 桌面设置。

**需要单独启动服务或设置开机自启吗？** 不需要。服务随 DSH 启停；想关掉就在插件页禁用该插件。

**支持哪些壁纸类型？** 列表会列出 `scene` / `video` / `web` / `application` 等全部已安装壁纸；`/files` 的文件服务与垫片只对网页类（`web`）有意义。

**非 Windows 能用吗？** 不能。Wallpaper Engine 只有 Windows 版，插件在其它系统上会把状态标成 `unsupported`。

## 开发与测试

零依赖、零构建：

```bash
node --check index.js
npm test          # 等同 npm run verify
npm run pack:check # npm pack --dry-run，检查 files 列表
```

`npm test` 用临时 fixture 模拟 WE 目录，覆盖：`/health` 能力标记、列表与订阅过滤、当前壁纸与显示器参数、`/files` 的垫片 / ETag / Range / 路径越界 / 未订阅、外部服务复用、端口回退、找不到 WE。测试不读取真实 WE 库，也不占用 8088（使用临时端口）。

## 发布到 npm

维护者在包目录执行：

```bash
cd dsh-wallpaper-engine-api
npm test
npm pack --dry-run
npm publish --access public
```

仓库的 `scripts/release.ps1` 只发布 `dsh-wallpaper-bg` 本体，**不处理本包**；本包独立发版，版本号在 `package.json` 里改，发版前先补 `CHANGELOG.md` 的对应条目。`package.json` 的 `files` 需包含 `index.js`、`lib/`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、两个 README、`LICENSE` 与 `CHANGELOG.md`。主插件通过同源状态路由发现本包，两者可以独立升级；只有契约（`/dsh-wallpaper-engine-api/status` 的 `base` 字段）变化时才需要同时升级主插件。

## 许可证

MIT，见 [LICENSE](LICENSE)。欢迎 issue / PR。
