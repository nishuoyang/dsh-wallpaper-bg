# WE 壁纸库服务（Windows）

> 适用版本：插件 0.5.13 / `wallpaper-engine-api` 服务 0.5.1。本页是「WE 壁纸库」这个**可选**来源的全部准备与运维细节。不需要它的话，内置壁纸与自定义上传都不受影响。

- [它是什么，在哪里](#它是什么在哪里)
- [准备步骤](#准备步骤)
- [服务与 DSH 客户端的生命周期](#服务与-dsh-客户端的生命周期)
- [首次运行 vs 后台启动](#首次运行-vs-后台启动)
- [日志](#日志)
- [重启不等于升级](#重启不等于升级)
- [非交互 / 无人值守配置](#非交互--无人值守配置)
- [服务接口与能力标记](#服务接口与能力标记)
- [验证](#验证)

## 它是什么，在哪里

`wallpaper-engine-api/` 服务把 Wallpaper Engine 已安装壁纸列表以只读 HTTP API 暴露在 `127.0.0.1:8088`。

> 该服务只随**仓库**提供，不在 npm 包里（npm tarball 只含插件本体，不含 `wallpaper-engine-api/`）。从 npm 安装、又想要「WE 壁纸库」来源的用户，请执行 `git clone https://github.com/nishuoyang/dsh-wallpaper-bg`。插件面板的「WE 壁纸库」标签在连不上服务时也会给出同样的提示。

服务是独立的 Node 进程，**DSH 自带的 Node 运行时管不到它**。

## 准备步骤

按这个顺序准备：

1. **Windows + 本机已安装 Wallpaper Engine。** 服务只读取 WE 自己的文件，所以 WE 必须事先装好；找不到可用的 WE 安装，进程会以退出码 1 结束。它只查注册表里的 Steam 路径和几个常见 Steam 目录，因此装在**第二个 Steam 库**里的 WE（例如 `D:\SteamLibrary\steamapps\common\wallpaper_engine`）**不会被自动探测到**——第 5 步可以在向导里手动粘贴路径。
2. **PATH 里有 Node.js**（`node -v` 能跑）——系统级安装，和桌面端自带的运行时是两回事。没有它，`启动服务.bat` 会直接停在 `[ERROR] Node.js not found in PATH.`。
3. **clone 仓库**（服务不在 npm 包里）：

   ```bash
   git clone https://github.com/nishuoyang/dsh-wallpaper-bg
   ```

4. **在 `wallpaper-engine-api/` 里装依赖**：

   ```bash
   cd wallpaper-engine-api
   npm install
   ```

   若失败（例如 `EALLOWREMOTE`，或网络到不了锁文件里指向的镜像），第 5 步的启动脚本会走同样的兜底步骤：**三步引导**——`npm install` → `npm install --allow-remote=all`（放行锁文件指向的镜像）→ `npm install --no-package-lock`（忽略锁文件，改用你自己配置的源）。手工安装时按同样顺序执行即可。

   > 仓库里的锁文件把 `resolved` 固定在镜像 `registry.npmmirror.com` 上。npm 12 起默认 `allow-remote=none`，会拒绝主机与当前配置源不一致的 tarball（`EALLOWREMOTE: Fetching packages of type "remote" have been disabled`）；网络到不了该镜像时同样一直取不到包。
5. **双击 `启动服务.bat`**——首次运行的入口。它先查端口与 Node.js、缺依赖就补装；`we-api.config` 不存在时依次询问 WE 安装路径（探测到就直接回车确认；也可以粘贴 `wallpaper64.exe`、它所在的目录，或你的 Steam 目录）与订阅壁纸库目录（直接回车用推导出的默认值 `...\steamapps\workshop\content\431960`）。写入 `we-api.config` 后脚本会在当前窗口里启动服务，`Ctrl+C` 或关闭窗口即停止。之后随时可以用 `启动服务.bat /setup` 重跑向导。
6. **推荐：双击 `设置开机自启.bat`**，把静默启动脚本注册到注册表（`HKCU\...\Run`），登录 Windows 时后台自动启动。不设的话，服务只活在「启动它的那个窗口」存续期间——重启电脑、或随手关掉 `启动服务.bat` 的窗口，它就不在了，WE 页签会提示连不上服务（列表还会标注可能已过期），直到你再启动一次。取消请双击 `取消开机自启.bat`（两个脚本都直接引用本目录的 `启动服务-静默.vbs`，移动过目录后请重新设置一次）。

   > **两个脚本都会读写「启动应用」里的状态记录**（`HKCU\...\Explorer\StartupApproved\Run`）：任务管理器 /「设置 → 应用 → 启动」里的「禁用」并不删除 `Run` 值、只把这个状态改成「已禁用」，所以 `设置开机自启.bat` 会把它归一到「已启用」（不归一的话脚本会报成功、而登录时启动项仍被跳过），`取消开机自启.bat` 则把它连同 `Run` 值一起清掉（只留状态会让注册表看起来「还设着」，事后极难判断）。

## 服务与 DSH 客户端的生命周期

WE API 服务是独立的 Node 进程，正常启动后**不随 DSH 客户端退出而结束**：退出 / 重进客户端、重载窗口都不影响它，它只在 Windows 注销 / 关机时结束（下次登录由开机自启项拉起）。

唯一会「一退客户端就没」的情况，是从**客户端内部**启动它——在 DSH 的终端 / 工具里跑 `启动服务.bat`、`启动服务-静默.vbs` 或 `node server.js`，进程会落在客户端的进程树里（DSH 用带 `KILL_ON_JOB_CLOSE` 的 Job Object 管理这些进程），客户端一退出就被一起结束，而且 `we-api.log` 里**不会留下任何报错**，界面上只表现为「连不上服务」。所以启动请在**资源管理器里双击**脚本（这样它的父进程是 `explorer.exe`），或干脆交给开机自启项；怀疑服务没了时，先看 `http://127.0.0.1:8088/health` 还在不在。

## 首次运行 vs 后台启动

`we-api.config` 生成之后，`启动服务-静默.vbs` 才会无窗口地把同一个服务跑起来（开机自启项跑的就是它），输出追加到 `we-api.log`。

**首次运行请一律走 `启动服务.bat`**：静默启动没有向导，缺少 `node_modules` 或 `we-api.config` 时会**完全静默地**失败——连窗口都不会有，唯一痕迹是 `we-api.log` 末尾的一段堆栈。双击了却「什么都没发生」，就是这种情况：改用 `启动服务.bat`。

## 日志

都在 `wallpaper-engine-api/` 下，均已 gitignore：

- `we-api.log`——静默 / 开机自启路径写下的服务输出；
- `restart-debug.log`——记录 `重启服务(管理员).bat` 做了什么（结束进程的尝试、提权、等待端口）。

服务没响应时先看这两个文件。

## 重启不等于升级

`重启服务(管理员).bat` 只做两件事：结束占用 8088 的进程，再通过静默启动器重新拉起 `node server.js`（需要时自动请求管理员权限，随后等待端口就绪）。它**既不 `git pull` 也不 `npm install`**，因此永远拿不到新代码——升级 = 仓库里 `git pull` + `wallpaper-engine-api` 里 `npm install` + 重启。

## 非交互 / 无人值守配置

`we-api.config` 就是 `server.js` 同目录下的纯 `KEY=value` 文件，向导只写两个键，自己写好就完全不用交互：

```ini
WE_INSTALL_PATH=D:\Steam\steamapps\common\wallpaper_engine
WE_WORKSHOP_PATH=D:\Steam\steamapps\workshop\content\431960
```

也可以直接在 `wallpaper-engine-api/` 里 `node server.js`——向导只是套在它外面的一层便利。同样的配置还支持环境变量，且优先级高于 `we-api.config`：`WE_INSTALL_PATH`、`WE_WORKSHOP_PATH`、`WE_SUBSCRIPTIONS_FILE`（显式指定 `431960_subscriptions.vdf`）与 `WEAPI_PORT`。

> `WEAPI_PORT` 只改**服务自己**的端口：启动脚本把 8088 写死了（`启动服务.bat` 检测到 8088 被占用就拒绝启动，`重启服务(管理员).bat` 也只结束 / 等待 8088），换端口必须同时改这两个脚本，并把插件设置里的基地址改成一致。

## 服务接口与能力标记

服务**只读**：仅调用列表 / 当前壁纸查询，绝不触碰设置或播放接口；未检测到 WE 运行时也不会拉起 WE 主程序。列表按 Steam 真实订阅清单（`431960_subscriptions.vdf`）过滤——在 WE 里退订 / 本地禁用的壁纸即使文件夹残留也不会再出现，与 WE 界面一致。

**0.5.0 起服务回归纯只读的列表 / 文件服务**：`/health`、`/api/wallpapers`、`/api/current`、`/files/<id>/...`。0.4.x 的桌面画面捕获 `GET /capture?w=&q=`（`PrintWindow(Progman, …)` 采样桌面 + `koffi` / `jpeg-js`）与 0.3.x 的本地场景渲染器（`/scene-frame`、`/scene-anim`、`lib/we-renderer/`）一样已**整体移除**——旧端点一律返回 `404`，`/health` 不再上报 `desktopCapture`。现在返回 `"version": "0.5.1"`，以及能力标记 `"webShim": 1` 与 0.5.1 起的 `"monitorSelect": 1`（当前壁纸支持指定显示器），另有 `weInstallPath` / `workshopPath` / `subscriptionsFile` / `weRunning`。

服务不解析 `scene.pkg`、不生成帧 / 视频、不采样桌面、不创建 `~/.dsh-wallpaper-bg`；场景壁纸由插件端显示 WE 工坊预览图（`preview.gif` / `preview.jpg`）。

网页类壁纸的静态资源由 `/files` 路由只读提供（仅限已订阅壁纸目录），0.3.8 起改为流式发送 + `ETag` / `Last-Modified` 条件请求（HTML `no-cache`、静态资源 300 秒缓存）并支持 `Range`，切换壁纸时资源不再反复重下。

## 验证

浏览器打开 `http://127.0.0.1:8088/health` 返回 JSON 即 WE 服务正常（历史原因端口是 8088——8080 曾被 Jenkins 占用）。插件侧则看 `<DSH 地址>/dsh-wallpaper-bg/health`：`dsh web` 默认端口 3080，桌面端固定 19387。

WE 壁纸库报错时，先确认服务在 8088 端口运行、且插件设置里的基地址与其一致。

---

相关：[安装与升级](installation.md) · [设置与用法](configuration.md) · [故障排查手册](troubleshooting.md)
