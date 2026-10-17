# dsh-wallpaper-engine-api

> v0.1.0 · MIT License · Windows

把 [dsh-wallpaper-bg](https://github.com/nishuoyang/dsh-wallpaper-bg) 仓库里原来那份需要 **clone 仓库 → `npm install` → 双击 `.bat` → 设置开机自启** 的 `wallpaper-engine-api/` 独立服务，做成一个 DSH 插件。

现在只需要一条命令：

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
```

桌面端更简单：**设置 → 插件 → 输入包名 `dsh-wallpaper-engine-api`**。

装好后，`dsh-wallpaper-bg` 的「WE 壁纸库」来源即可使用——不需要 PATH 里有 Node.js，不需要独立进程、启动脚本或开机自启项。

## 它做什么

在 DSH 宿主进程内启动一个**只读** HTTP API，把本机 Wallpaper Engine 的已安装壁纸暴露给 `dsh-wallpaper-bg` 的设置面板：

| 端点 | 作用 |
| --- | --- |
| `GET /health` | 服务状态、WE 路径、实际端口、错误原因 |
| `GET /api/wallpapers` | 已安装壁纸列表（按 Steam 真实订阅清单过滤） |
| `GET /api/current[?monitor=]` | 当前桌面壁纸（多显示器自动判定 / 手动指定） |
| `GET /files/<id>/<rel>` | 网页类壁纸目录文件（HTML 注入 WE 私有接口垫片） |

另有同源状态路由 `GET <DSH 地址>/dsh-wallpaper-engine-api/status`，供 `dsh-wallpaper-bg` **自动发现实际端口**——端口被占用而自动换端口时，用户不需要改任何基地址。

## 和旧手动服务的区别

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

1. **设置 → 插件**，安装框输入 `dsh-wallpaper-engine-api`；
2. 按提示重启桌面端（或重载窗口）；
3. 打开 **设置 → 壁纸 → WE 壁纸库**。

### 命令行

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
# 桌面端 profile：
dsh plugin --profile desktop add dsh-wallpaper-engine-api
```

> 升级要显式给版本：`dsh plugin --profile web add dsh-wallpaper-engine-api@latest`。pnpm 会保留 profile 清单里已有的版本范围，重复执行 `add` 不会升级；pnpm 11 默认还有约一天的「发布满 24 小时才安装」门槛，刚发布的版本可写死版本号立刻安装。

前提：**Windows** + 本机已安装 **Wallpaper Engine**；`dsh-wallpaper-bg` 已安装（本插件只提供数据，界面在它那边）。

## 验证

1. 插件页面能看到 **Wallpaper Engine 壁纸库 API**，状态为启用；
2. 打开 `<DSH 地址>/dsh-wallpaper-engine-api/status`，应返回 JSON，`base` 是实际 API 地址（例如 `http://127.0.0.1:8088`）；
3. 浏览器打开 `http://127.0.0.1:8088/health`（端口以 `base` 为准），应看到 `"mode": "readonly"`、`"weInstallPath"`、`"workshopPath"`；
4. `dsh-wallpaper-bg` 的 WE 页签能列出壁纸，并且「同步桌面壁纸」可用。

`/health` 里几个关键字段：

- `status`：`running`（本插件在监听）、`external`（复用了已存在的 WE API 服务）、`error`、`unsupported`；
- `external: true` 表示 8088 上已经有一个旧版 WE API 服务，本插件不会重复监听；
- `weInstallPath` / `workshopPath` 为空或 `error` 非空时，按提示补配置即可。

## 配置（可选）

默认零配置：自动探测 Steam / WE / 创意工坊目录，端口 8088。只有自动探测失败或端口冲突时才需要配置。

在 profile 的 `cordis.patch.yml` 里覆盖本插件行（桌面端为 `%DSH_HOME%\profiles\desktop\cordis.patch.yml`）：

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

也支持环境变量（优先级低于行配置）：`WEAPI_PORT`、`WE_INSTALL_PATH`、`WE_WORKSHOP_PATH`、`WE_SUBSCRIPTIONS_FILE`。

修改配置后重启 DSH 生效（宿主半是 Node 侧模块，不会进程内热重载）。

## 端口与生命周期

- 只绑定 `127.0.0.1`，不对外网开放；
- 默认 `8088`。端口上已有旧版 WE API 服务时直接复用它（`status: external`）；被无关程序占用时自动尝试 `8089`，再不行用系统分配的空闲端口；
- 实际端口通过同源状态路由暴露，`dsh-wallpaper-bg` 会用 `status.base` 自动接上；**只有**在你手动改过主插件的「基地址」时才需要保持一致；
- 服务随 DSH 启动 / 退出：DSH 退出即释放端口，没有后台残留，也没有开机自启项。

## 只读与安全

- 只调用「列出壁纸」与「读取当前壁纸配置」，**绝不**调用 WE 的 `load` / `stop` / `openProfile` 等接口；桌面壁纸不受影响；
- 不解析 `scene.pkg`、不截屏、不生成视频 / 帧缓存、不写任何文件；
- 网页壁纸在**独立端口**上渲染（与 DSH 页面不同源），创意工坊里的第三方 HTML 拿不到 DSH 的 origin、Cookie 或 localStorage；
- `/files` 只服务已订阅壁纸目录内的文件，做了路径越界检查；HTML 只对文档请求注入垫片；
- 列表按 Steam 真实订阅清单过滤，已退订 / 本地禁用的壁纸不会出现。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| `/status` 404 | 插件没装进当前 profile，或 DSH 没重启；确认 `dsh.profile.bundles` 里有 `dsh-wallpaper-engine-api` |
| `error` 说找不到 Wallpaper Engine | 在配置里填 `weInstallPath`（含 `wallpaper64.exe` 的目录）后重启 DSH |
| 列表为空但 WE 里有壁纸 | 先在 WE 里订阅；检查 `workshopPath` 与 `subscriptionsFile`；`hiddenUnsubscribed` 说明被订阅清单过滤掉了 |
| 同步桌面壁纸不可用 | `config.json` 读不到：确认 `weInstallPath` 指向 WE 安装目录 |
| 「连不上 WE API 服务」 | 看 `/status` 的 `base` 与 `error`；若主插件里手动改过基地址，改成默认或清空 |
| 8088 上还是旧服务 | `status.external: true` 属于正常复用；想换成本插件，先运行旧目录的 `取消开机自启.bat` 并结束旧进程，再重启 DSH |

## 开发与测试

零依赖、零构建：

```bash
node --check index.js
npm test        # 用临时 fixture 模拟 WE 目录，跑通列表 / 当前壁纸 / 文件服务 / 垫片 / ETag / Range
```

测试不读取真实 WE 库，也不占用 8088（使用临时端口）。

## 发布到 npm

维护者在包目录执行：

```bash
npm publish --access public
```

仓库的 `scripts/release.ps1` 只发布 `dsh-wallpaper-bg` 本体；本包独立发版。

## License

MIT，见 [LICENSE](LICENSE)。欢迎 issue / PR。
