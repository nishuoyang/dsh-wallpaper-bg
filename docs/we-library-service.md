# WE 壁纸库服务（Windows）

> 适用版本：主插件 **0.5.14**、配套插件 **dsh-wallpaper-engine-api 0.1.0**；旧的手动服务仍为 `wallpaper-engine-api` **0.5.1**。本页是「WE 壁纸库」这个**可选**来源的全部准备与运维细节。不需要它的话，内置壁纸与自定义上传都不受影响。

- [它是什么](#它是什么)
- [方式 A：配套插件（推荐，一条命令）](#方式-a配套插件推荐一条命令)
- [配置插件（可选）](#配置插件可选)
- [端口、生命周期与自动发现](#端口生命周期与自动发现)
- [方式 B：旧的手动服务（仅保留给已有部署）](#方式-b旧的手动服务仅保留给已有部署)
- [服务接口与能力标记](#服务接口与能力标记)
- [验证](#验证)
- [故障排查](#故障排查)

## 它是什么

「WE 壁纸库」来源需要一台本机服务，把 Wallpaper Engine 已安装壁纸以**只读** HTTP API 暴露在 `127.0.0.1`。从 0.5.14 起有两种装法：

| | 方式 A：配套插件（推荐） | 方式 B：旧手动服务 |
| --- | --- | --- |
| 安装 | `dsh plugin … add dsh-wallpaper-engine-api` / 插件页面填包名 | clone 仓库 + `npm install` + 双击 `.bat` + 开机自启 |
| 进程 | DSH 宿主进程内，随 DSH 启停 | 独立 Node 进程，需要自己管 |
| Node.js | 不需要 | PATH 里必须有 |
| 升级 | 重新 `dsh plugin … add dsh-wallpaper-engine-api@<版本>` | `git pull` + `npm install` + 重启服务 |
| 路径探测 | 注册表 + `libraryfolders.vdf`（第二个 Steam 库）+ 常见目录 | 注册表 + 常见目录 |
| 端口冲突 | 复用已有 WE API，或自动换端口并被主插件发现 | 8088 被占用就起不来 |

新用户请直接用方式 A；方式 B 只保留给已经部署了旧服务、暂时不想改的用户。

## 方式 A：配套插件（推荐，一条命令）

前提：**Windows + 本机已安装 Wallpaper Engine**；主插件 `dsh-wallpaper-bg` 已安装（界面在它那边）。

```bash
# 网页版 / 命令行
dsh plugin --profile web add dsh-wallpaper-engine-api

# 桌面端（也可在 设置 → 插件 里输入包名）
dsh plugin --profile desktop add dsh-wallpaper-engine-api
```

装好后重启 DSH。插件会在 DSH 宿主进程内启动只读服务：

- 默认监听 `http://127.0.0.1:8088`；
- 自动读取注册表 Steam 路径与 `steamapps/libraryfolders.vdf`，所以装在第二个 Steam 库里的 WE 也能找到；
- 找不到 WE、找不到壁纸库、端口冲突都**不会**让 DSH 启动失败，原因写在 `/health` 与同源状态路由里；
- 服务随 DSH 退出而释放，没有后台残留，也没有开机自启项。

配套插件的完整说明见 [`dsh-wallpaper-engine-api/README.zh.md`](../dsh-wallpaper-engine-api/README.zh.md)。

### 配置插件（可选）

默认零配置。只有自动探测失败或端口冲突时才需要覆盖 profile 里的插件行（桌面端文件：`%DSH_HOME%\profiles\desktop\cordis.patch.yml`）：

```yaml
- id: wallpaper-engine-api
  name: dsh-wallpaper-engine-api
  config:
    port: 8088
    # 可选：WE 装在自动探测不到的位置时手填
    weInstallPath: D:\Steam\steamapps\common\wallpaper_engine
    workshopPath: D:\Steam\steamapps\workshop\content\431960
    subscriptionsFile: D:\Steam\userdata\1588688173\ugc\431960_subscriptions.vdf
    autoPort: true
    verbose: false
```

环境变量（优先级低于行配置）：`WEAPI_PORT`、`WE_INSTALL_PATH`、`WE_WORKSHOP_PATH`、`WE_SUBSCRIPTIONS_FILE`。

修改宿主半配置后需要重启 DSH 才生效。

## 端口、生命周期与自动发现

- 只绑定 `127.0.0.1`，不对外网开放；
- 默认 `8088`。如果该端口上已经有**旧的 WE API 服务**，插件直接复用它（`/health` 里 `status: "external"`、`external: true`），不会抢端口、也不会起第二份；
- 如果被**无关程序**占用，插件自动尝试 `8089`，再不行让系统分配空闲端口（`autoPort: false` 可关闭自动换端口）；
- 实际端口通过同源路由 `GET <DSH 地址>/dsh-wallpaper-engine-api/status` 的 `base` 字段公布；主插件 `dsh-wallpaper-bg` 会自动发现它，所以**用户不需要手改基地址**；
- 只有你在主插件面板里**手动填过**基地址时，主插件才会尊重手填值、不做自动发现；
- 服务属于 DSH 宿主进程：DSH 退出 / 重启即停，不存在「窗口关了服务还在 / 一退客户端服务就没了」的问题。

## 方式 B：旧的手动服务（仅保留给已有部署）

> 新用户不建议再用这一节。以下步骤只适用于已经在用 `wallpaper-engine-api/` 目录的用户。

### 准备步骤

1. **Windows + 本机已安装 Wallpaper Engine**。服务只查注册表里的 Steam 路径和几个常见 Steam 目录；装在**第二个 Steam 库**里的 WE 不会被自动探测到——首次运行向导里可以手动粘贴路径。
2. **PATH 里有 Node.js**（`node -v` 能跑）——系统级安装，和桌面端自带的运行时是两回事。
3. **clone 仓库**（服务不在 npm 包里）：

   ```bash
   git clone https://github.com/nishuoyang/dsh-wallpaper-bg
   ```

4. **在 `wallpaper-engine-api/` 里装依赖**：

   ```bash
   cd wallpaper-engine-api
   npm install
   ```

   若失败（例如 `EALLOWREMOTE`，或网络到不了锁文件里指向的镜像），第 5 步的启动脚本会走同样的兜底步骤：**三步引导**——`npm install` → `npm install --allow-remote=all`（放行锁文件指向的镜像）→ `npm install --no-package-lock`（忽略锁文件，改用你自己配置的源）。
5. **双击 `启动服务.bat`**——首次运行的入口。它先查端口与 Node.js、缺依赖就补装；`we-api.config` 不存在时依次询问 WE 安装路径与订阅壁纸库目录。之后随时可以用 `启动服务.bat /setup` 重跑向导。
6. **推荐：双击 `设置开机自启.bat`**，把静默启动脚本注册到注册表（`HKCU\...\Run`）。不设的话，服务只活在「启动它的那个窗口」存续期间。

### 生命周期与日志

旧服务是**独立 Node 进程**，正常启动后**不随 DSH 客户端退出而结束**。唯一会「一退客户端就没」的情况，是从**客户端内部**启动它——在 DSH 的终端 / 工具里跑脚本时，进程会落在客户端的 Job Object 里，客户端一退出就被一起结束。请从资源管理器双击脚本，或交给开机自启项。

日志都在 `wallpaper-engine-api/` 下（已 gitignore）：

- `we-api.log`——静默 / 开机自启路径写下的服务输出；
- `restart-debug.log`——`重启服务(管理员).bat` 做了什么的记录。

### 重启不等于升级

`重启服务(管理员).bat` 只结束占用 8088 的进程再重新拉起 `node server.js`，**既不 `git pull` 也不 `npm install`**。升级 = 仓库里 `git pull` + `npm install` + 重启。

### 非交互配置

`we-api.config` 是 `server.js` 同目录下的纯 `KEY=value` 文件：

```ini
WE_INSTALL_PATH=D:\Steam\steamapps\common\wallpaper_engine
WE_WORKSHOP_PATH=D:\Steam\steamapps\workshop\content\431960
```

也支持环境变量，且优先级高于 `we-api.config`：`WE_INSTALL_PATH`、`WE_WORKSHOP_PATH`、`WE_SUBSCRIPTIONS_FILE`、`WEAPI_PORT`。

> `WEAPI_PORT` 只改服务自己的端口；`启动服务.bat` 与 `重启服务(管理员).bat` 把 8088 写死了，换端口要同时改脚本与主插件里的基地址。用配套插件则没有这个问题。

### 旧服务与配套插件共存

如果旧的 WE API 服务已经在 8088 上跑着，再装配套插件：插件会识别出这是已知的 WE API 并直接复用（`external: true`），不会重复监听。想彻底切到插件：运行旧目录的 `取消开机自启.bat`、结束旧进程，然后重启 DSH。

## 服务接口与能力标记

两种方式提供同一套只读端点（默认基地址 `http://127.0.0.1:8088`）：

| 端点 | 作用 |
| --- | --- |
| `GET /health`、`/` | 服务状态（`webShim` / `monitorSelect` 能力标记、WE 路径、`weRunning`） |
| `GET /api/wallpapers`（含 `/wallpapers` 等别名） | 已安装壁纸列表，按 Steam 真实订阅清单过滤 |
| `GET /api/current[?monitor=]`（含 `/current` 等别名） | 当前桌面壁纸；`monitor` 可指定 `MonitorN` / `N`，缺省自动判定 |
| `GET /files/<id>/<rel>` | 网页类壁纸目录文件；HTML 注入 WE 私有接口垫片，支持 ETag / Range |

服务**只读**：仅调用列表 / 当前壁纸查询，绝不触碰设置或播放接口；未检测到 WE 运行时也不会拉起 WE 主程序。不解析 `scene.pkg`、不生成帧 / 视频、不采样桌面、不创建 `~/.dsh-wallpaper-bg`。

配套插件还提供同源状态路由（只在 DSH 页面 origin 上）：

```text
GET <DSH 地址>/dsh-wallpaper-engine-api/status
→ { ok, status, base, port, external, weInstallPath, workshopPath, weRunning, error, ... }
```

## 验证

1. **插件是否挂载**：打开 `<DSH 地址>/dsh-wallpaper-engine-api/status`，应返回 JSON；`base` 是实际 API 地址。
2. **服务是否健康**：打开 `<base>/health`（通常是 `http://127.0.0.1:8088/health`），应看到 `"mode": "readonly"`、`"webShim": 1`、`"monitorSelect": 1`、非空的 `weInstallPath` / `workshopPath`。
3. **主插件是否挂载**：`<DSH 地址>/dsh-wallpaper-bg/health` 返回 `{"ok":true,…,"discoverWeApi":1}`（旧宿主半没有 `discoverWeApi`，需要重启 DSH 升级）。
4. **面板**：设置 → 壁纸 → WE 壁纸库，能列出壁纸；「同步桌面壁纸」可用。

`dsh web` 默认端口 3080，桌面端固定 19387（以你实际打开的地址为准）。

## 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| `/status` 404 | 配套插件没装进当前 profile，或装完没重启 DSH；确认 `profiles/<name>/package.json` 的 `dsh.profile.bundles` 里有 `dsh-wallpaper-engine-api` |
| `error` 说找不到 Wallpaper Engine | 在插件行配置 `weInstallPath`（含 `wallpaper64.exe` 的目录）或设 `WE_INSTALL_PATH`，重启 DSH |
| 列表为空但 WE 里有壁纸 | 先在 WE 里订阅；检查 `workshopPath` / `subscriptionsFile`；列表按订阅清单过滤，已退订 / 本地禁用的不会出现（`hiddenUnsubscribed` 显示被过滤数量） |
| 同步桌面壁纸不可用 | `/health` 的 `error` 会说明是 `config.json` 读不到还是安装目录不对；修正 `weInstallPath` |
| 8088 被占用 | 配套插件自动换端口并由主插件发现；若你在主插件里手填过基地址，改成默认或清空。旧服务则只能改端口并同步改脚本 / 基地址 |
| 装了插件但主插件仍连 8088 | 确认主插件宿主半是 0.5.14+（`/dsh-wallpaper-bg/health` 有 `discoverWeApi: 1`），并重启 DSH |
| 桌面端插件页面显示「启用但未激活」 | 看安装结果的 diagnostic；模块导入错误（例如版本不匹配）需要修正包后重启 DSH |

日志：配套插件默认不写文件，诊断信息走 DSH 宿主日志（`verbose: true` 可打开详细日志）；旧服务的日志见上文。

---

相关：[安装与升级](installation.md) · [设置与用法](configuration.md) · [故障排查手册](troubleshooting.md) · [配套插件 README](../dsh-wallpaper-engine-api/README.zh.md)
