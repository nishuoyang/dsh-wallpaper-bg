# Changelog

本文件记录 dsh-wallpaper-bg 的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 发版时把下面的 `## [未发布]` 改成 `## [x.y.z] - YYYY-MM-DD`（`scripts/release.ps1` 要求存在对应版本条目）。

## [未发布]

### 文档

- **新增两张橱窗预览图**（`docs/screenshots/preview-hero.jpg`、`docs/screenshots/preview-sources.jpg`）：hero 图取自「浅色外观 + 原生背景模式」实拍，标题与角标压在下缘与右上角、不遮挡界面；来源图把「内置壁纸 / 自定义上传 / WE 壁纸库」三屏并排，带中英说明与一行特性注释。两张都由仓库里已有的真实截图裁切合成，没有虚构界面。
- **新增 [`screenshots.json`](screenshots.json)**（放在 `package.json` 旁）：声明 8 张截图的展示顺序，供 DSH 插件市场（dsh-market、dsh-plugin.org 等详情页 / 主题 Tab）像 App Store 一样展示。不声明时市场只能从 README 里自动抽取，顺序与取舍都不可控；声明后换图也只需推自己的仓库。
- README / README.zh.md 顶部预览区把这两张图排在最前。

### 变更

- **插件分类从「工具能力」调整为「界面与外观」**：`package.json` 的 keywords 增加 `theme` / `themes` / `appearance` / `background` / `ui`；仓库 GitHub topics 增加 `theme` / `wallpaper` / `wallpaper-engine` / `appearance` / `background` / `web-ui` / `dsh-theme`。dsh-plugin.org 的分类器优先读 topics，DSH-Store 的分类按 `manifest.keywords` 匹配，两边据此把本插件归入「界面体验 / 主题外观」而不是「工具能力」。

## [0.5.11] - 2026-10-06

### 文档

- **README / README.zh.md 顶部徽章行加上社区插件目录的收录徽章**（[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/nishuoyang/dsh-wallpaper-bg)）：本插件已被 [DSH Plugin Hub](https://dsh-plugin.org/plugins/nishuoyang/dsh-wallpaper-bg)（dsh-plugin.org 的社区插件市场）收录并标记为 **Verified**（收录于 2026-08-27），徽章指向该条目页。徽章图片 `https://dsh-plugin.org/badges/listed.svg` 实测返回 200（132×20 的 SVG）。
- `docs/troubleshooting.md` 里的**当前版本号**同步到 0.5.11：「适用版本」行、第 1 条自查的 health 示例，以及升级 / 锁版本示例；0.5.9 / 0.5.10 这类**历史版本引用保持不变**。
- npm 上的 README 只随发布更新，所以这次以 **0.5.11** 重新发布一遍（纯文档）：`lib/host.js` / `lib/client.js` 的逻辑与 0.5.10 完全一致，插件行为无任何变化；两个文件里只有版本号字符串随之更新。

## [0.5.10] - 2026-10-04

### 修复

- **播放队列自动切下一张（尤其是两个视频之间）会闪一段黑屏**（`lib/client.js`）：叠化本身是有的，但三处细节让它在视频之间漏了黑：
  1. **旧图层在淡出开始的瞬间就被断源**：`fadeOutLayer()` 原先立刻执行 `dispose()`（`releaseVideo`：`pause()` + 摘掉 `src` + `load()`），那一帧 `<video>` 已经没有任何可画的帧，只剩图层自己的近黑底色 `#0b0d12`，于是「旧壁纸淡出」实际是「旧壁纸塌成近黑再淡出」。现在淡出期间只 `pause()`（暂停不丢最后一帧、也不再解码），真正 `releaseVideo` 推迟到图层被移除时；视频淡出期间不再多留解码器，帧率的旧修复不受影响。
  2. **近黑底色挂在图层上**：`.wbg-layer` 自带 `background-color:#0b0d12`，只要这一层的内容还没画出来（4K 视频从 attach + `play()` 到真正出画面可能要几百毫秒），露出的就是这块不透明近黑。现在底色移到容器 `#dsh-wallpaper-bg` 上，图层全透明 —— 新壁纸没就绪时透出的是**还在画的旧壁纸**，而不是黑。
  3. **新图层其实没在叠化**：`appendChild()` 与「把 `opacity` 改成 1」落在同一帧时浏览器不会产生过渡，新壁纸是「跳进来」的；同时队列预热路径（`preloaded`）拿到 `readyState` 就立刻叠化，没有等合成器真的画出一帧。现在 `crossfade()` 先强制结算一次样式再改 `opacity`（叠化按设计真的跑起来），视频路径等 `requestVideoFrameCallback` 上报「已呈现首帧」后才进场（有计时兜底）；首屏没有可叠化的旧层时仍直接显示，不会凭空多出 0.42s 的从黑淡入。
  验证：用真实 `lib/client.js` + 真 IndexedDB 跑「两张视频的自定义队列」，在 60s 自动切换点上以约 30ms 间隔逐帧截图测合成像素与图层台账；修改前能拍到旧层断源（`readyState 0 / 无 src`）导致的近黑窗口，修改后切换全程由旧画面平滑过渡到新画面。

## [0.5.9] - 2026-10-03

### 修复

- **macOS 桌面端：装上插件后 DSH 窗口拖不动，双击也不放大**（`lib/client.js`，[#3](https://github.com/nishuoyang/dsh-wallpaper-bg/pull/3)，感谢 @wlabbyflower）：两个全屏层原先 `appendChild` 到 `<body>` 末尾，而 DSH 桌面端基础样式里有 `html[data-platform=darwin] body>:not(#root){-webkit-app-region:no-drag}` —— 它们各自成为一块覆盖整窗的 no-drag 区域，并且在文档顺序上排在所有 `[data-window-drag]` 标题行**之后**；Electron 合成拖拽区域时是「靠后的矩形覆盖靠前的」（`DraggableRegionsToSkRegion()` 按顺序逐条 union / difference），整窗拖拽区因此被抹掉（双击缩放依赖同一套区域，一起失效）。现在两层插到 `#root` **之前**，靠后的标题行反向覆盖它们。视觉与功能不变（仍是 `position:fixed; z-index:-1`，仍在所有 UI 之下）；Windows / Linux / 浏览器里没有这条 darwin 规则，行为完全不变。自查：本机用 Electron 44（与 DSH 桌面端同大版本）的无边框窗口 + 真实系统鼠标拖拽复现了「改前拖不动、改后正常拖动」，见 PR 里的验证记录。

## [0.5.8] - 2026-10-03

### 文档

- **README / README.zh.md 新增「服务与 DSH 客户端的生命周期」**（并补一条 FAQ「退出 DSH 客户端再进来，服务就没了？」）：WE API 服务是独立的 Node 进程，退出 / 重进客户端、重载窗口都**不会**带走它，它只在 Windows 注销 / 关机时结束（下次登录由开机自启项拉起）。唯一会「一退客户端就没」的是**从客户端内部启动**的那份——在 DSH 的终端 / 工具里跑启动脚本时，进程落在客户端的进程树里，而 DSH 用带 `KILL_ON_JOB_CLOSE` 的 Job Object 管理这些进程（实测 `LimitFlags = 0x00002000`），客户端一退出就被一并结束，且 `we-api.log` 里**没有任何报错**，界面上只表现为「连不上服务」。正确做法：在**资源管理器里双击**脚本（父进程是 `explorer.exe`），或交给开机自启项。

### 变更

- **面板「连不上服务」的两处提示各加一句**（`lib/client.js`）：别在 DSH 客户端内部（终端 / 工具）启动服务——那样起的进程会随客户端退出一起结束，请在资源管理器里双击脚本。纯文案，不改行为。
- 插件版本 0.5.8（宿主半 `/dsh-wallpaper-bg/health` 的 `version` 同步为 0.5.8，需重启 DSH 生效）；WE API 服务仍是 **0.5.1**——服务端代码本次未改。

## [0.5.7] - 2026-10-03

### 修复

- **本次现场的定性（不是脚本缺陷）**：用户报告「点过那几个脚本、重启电脑后 WE 服务仍不自启」，实测根因是 `HKCU\...\Run` 里那条自启值**已被删除**（唯一会删它的是 `取消开机自启.bat`，从残留痕迹看极可能是误双击），脚本与服务本身都没问题——`设置开机自启.bat` 实跑退出码 0、写出的值名与数据都正确，静默启动链路（`wscript.exe` → `cmd /c node server.js`）也在 1 秒内把 8088 重新拉了起来。下面两条是这次排查暴露出来的真实粗糙点。
- **自启项被「禁用」后，`设置开机自启.bat` 会报成功但登录仍不启动**：任务管理器 /「设置 → 应用 → 启动」里的「禁用」**不删除** `HKCU\...\Run` 里的值，只把 `HKCU\...\Explorer\StartupApproved\Run` 里同名的状态写成 `01`（本机实例：`QianwenUpdaterTaskUser1.0.0.10` 的 Run 值仍在、状态是 `01-00-00-00-…`），而登录时这种状态会被跳过。脚本以前只校验 Run 值在不在，于是这种情况照样打印 `[成功]`。现在注册 Run 值之后会把该状态一并归一为「已启用」（`REG_BINARY` `02 00 00 00 …`，12 字节，与 Windows 给「从未被禁用过」的启动项写下的形态一致），并回读 `reg query` 校验：读到 `01` 明确警告去任务管理器启用，读到其它内容则照实打印，而不是无条件报成功。
- **`取消开机自启.bat` 只删 Run 值，把 `StartupApproved` 状态留在原地**：事后看注册表或任务管理器会出现两种误判——「还设着」和「设了却不生效」，本次现场正是被这条残留带偏的。现在它把状态记录一并删除，输出里也写明「只取消下次登录自动启动，当前正在运行的服务不受影响；恢复请双击 `设置开机自启.bat`」。

### 文档

- README / README.zh.md 的「WE 壁纸库服务」小节补上这两点：自启项在任务管理器 → 启动里显示「已禁用」时，重新双击 `设置开机自启.bat` 会把它重新置为「已启用」；`取消开机自启.bat` 会把 `Run` 值与状态记录一起清掉。
- 说明分发范围：`wallpaper-engine-api/` 的脚本**不在 npm 包里**（`package.json` 的 `files` 未包含该目录），拿到这次修复要走仓库 `git pull`；npm 包里的本文件只作告知。

### 变更

- 插件版本 0.5.7（宿主半 `/dsh-wallpaper-bg/health` 的 `version` 同步为 0.5.7，需重启 DSH 生效）；WE API 服务仍是 **0.5.1**——服务端代码本次未改，只改了它的两个自启脚本。

## [0.5.6] - 2026-10-02

### 修复

- **服务断线时面板会「瞒着」用户**：`loadWe()` 失败时只 `setWeError`、不清空列表，而错误块的渲染条件是 `weError && !list`——于是只要本次页面会话里成功加载过一次壁纸库，之后 WE API 服务挂掉（重启电脑而没设开机自启、随手关掉了 `启动服务.bat` 的窗口等），切回 WE 页签看到的仍是一份**过期列表**，界面上没有任何异常迹象。现在只要列表还在而服务已连不上，就会在列表上方显示一条横幅：说明连不上服务（带当前基地址）、列表可能已过期，并给出两步——双击 `重启服务(管理员).bat` 后点「刷新」即可恢复；想以后重启电脑 / 关窗口都不用管，双击同目录的 `设置开机自启.bat`。走横幅这条路径能确定用户**装过**服务（否则不会有列表），所以它只说这一步，不再让人 clone / npm install。
- **「连不上服务」的完整提示不再一上来就让人重新装**：原文按「从没装过」的口径写，开头就是 `git clone` + `npm install`，对「装过、只是服务没在运行」的人（最常见）是**错误的第一步**。现在按代价从低到高排列：① 装过、只是没在运行 → 重启脚本（并推荐设开机自启）；② 从没装过 → clone / npm install / `启动服务.bat`；③ 还是不行 → 看 `we-api.log` 末尾与端口设置。

### 文档

- **README / README.zh.md 把 `设置开机自启.bat` 从「可选第 6 步」提升为推荐步骤**，并写明不设的后果：服务只活在「启动它的那个窗口」存续期间，重启电脑或关掉该窗口后就没了，WE 页签会提示连不上（列表标注可能已过期），直到手动再启动一次。

### 变更

- 插件版本 0.5.6（宿主半 `/dsh-wallpaper-bg/health` 的 `version` 同步为 0.5.6，需重启 DSH 生效）；WE API 服务仍是 **0.5.1**——服务端代码本次未改。
## [0.5.5] - 2026-10-02

### 修复

- **新克隆的仓库装依赖时 `npm install` 直接失败（`EALLOWREMOTE`）**：`wallpaper-engine-api/package-lock.json` 把每个包的 `resolved` 地址写死为 `https://registry.npmmirror.com/...`，而 npm 12 起默认 `allow-remote=none`，会拒绝主机与当前配置源不一致的 tarball，于是 `npm install` 硬失败：`EALLOWREMOTE: Fetching packages of type "remote" have been disabled`（实测 npm 12.0.2 + 该 lock 文件退出码 1、去掉 lock 文件后退出码 0；npm 11.21.0 + 该 lock 文件退出码 0）。启动脚本以前只把这种情况报成 `npm install failed. Check your network / npm registry.`，把用户引向并没有问题的网络与源，然后直接退出——新用户到此彻底卡死。
- **`启动服务.bat` 的依赖补装改为三级兜底**：`npm install` 失败时，依次追加 `--allow-remote=all`（放行 lock 文件里指向另一个 registry 的 tarball，对应上面的 `EALLOWREMOTE`）与 `--no-package-lock`（忽略 lock、改按用户 `.npmrc` 里配置的源解析）各重试一次，每一步都打印原因，三次都失败才提示手动执行 `npm install` 看完整报错。**保留 lock 文件是有意的**：本机实测 `registry.npmjs.org` 连接超时、`registry.npmmirror.com` 0.5 秒返回 200，lock 里写死的镜像地址让安装*不依赖*用户配置的源，删掉它反而会让 `npm install` 卡住。
- **`.bat` / `.cmd` / `.vbs` 的行尾不再取决于克隆者的 `core.autocrlf`**：cmd.exe 按字节偏移而不是按行解析批处理，行尾若是裸 LF 就会定位到行中间、开始执行半截命令，刷出一片 `'...' is not recognized as an internal or external command`——`启动服务.bat` / `重启服务(管理员).bat` 都可能因此启动失败。Git for Windows 默认 `core.autocrlf=true`（检出为 CRLF）掩盖了这一点，`core.autocrlf=false` / `input` 或在非 Windows 主机克隆后再经共享目录运行就会踩到。新增 `.gitattributes` 固定 `*.bat` / `*.cmd` / `*.vbs` 为 `text eol=crlf`（仓库内仍存 LF，检出统一为 CRLF）。
- **面板里「WE 壁纸库」连不上服务时的提示改推 `启动服务.bat`**：原文让用户双击 `启动服务-静默.vbs`，而静默启动没有首次运行向导，缺少 `node_modules` 或 `we-api.config` 时会**完全静默地**失败——连窗口都不弹，唯一痕迹是 `we-api.log` 末尾的堆栈。现在提示改为 `启动服务.bat`（首次运行走向导并写出 `we-api.config`），静默脚本只作为后台 / 开机自启方式；`bin/dsh-wallpaper-bg.js` 的提示沿用同样的说法。

### 文档

- **README / README.zh.md 的「WE 壁纸库服务」小节按真实首次运行流程重写**，顺序为：(a) Windows + 本机 Wallpaper Engine（服务必需；装在第二个 Steam 库时不会被自动探测，需要在向导里粘贴路径）、(b) **PATH 里有 Node.js**（服务是独立的 Node 进程，桌面端自带的运行时管不到它，缺了会停在 `[ERROR] Node.js not found in PATH.`）、(c) `git clone https://github.com/nishuoyang/dsh-wallpaper-bg`、(d) `wallpaper-engine-api` 里 `npm install`、(e) 双击 `启动服务.bat` 回答向导。同时写明首次运行请走 `启动服务.bat`（`/setup` 可重跑向导），`启动服务-静默.vbs` 只用于后台 / 开机自启；双击后「什么都没发生」正是静默启动缺配置的表现，改用 `启动服务.bat` 即可。
- **补文档化两个诊断文件**：`wallpaper-engine-api/we-api.log`（静默 / 开机自启路径写下的服务输出）与 `wallpaper-engine-api/restart-debug.log`（`重启服务(管理员).bat` 的停进程 / 提权 / 等待端口记录），两者都已 gitignore。
- **纠正「重启 = 升级」的旧说法**：`重启服务(管理员).bat` 只结束占用 8088 的进程、再以静默方式拉起 `node server.js`，既不 `git pull` 也不 `npm install`，**不能升级服务**；升级 = 仓库里 `git pull` + `wallpaper-engine-api` 里 `npm install` + 重启。FAQ 里判断服务是否过旧的依据也从已失效的 `subscriptionsFile`（现在任何版本都会输出该键，可能为 `null`）改为当前能力标记 `"webShim": 1` / `"monitorSelect": 1`（服务版本 **0.5.1**）。
- **补非交互 / 无人值守安装方式**：`we-api.config` 是 `server.js` 同目录下的纯 `KEY=value` 文件（向导写 `WE_INSTALL_PATH=` / `WE_WORKSHOP_PATH=`），也可改用 `WE_INSTALL_PATH` / `WE_WORKSHOP_PATH` / `WE_SUBSCRIPTIONS_FILE` / `WEAPI_PORT` 环境变量（优先级高于配置文件），并可直接在 `wallpaper-engine-api` 里执行 `node server.js`。
- **说明 `WEAPI_PORT` 只改服务端口**：启动脚本把 8088 写死（`启动服务.bat` 检测 8088、`重启服务(管理员).bat` 结束 / 等待 8088），换端口必须同时改这两个脚本，并同步插件设置里的基地址。
- **FAQ 清理与补齐**：删除 README.md 里重复的「Do web-type wallpapers render?」条目（保留内容更新的那一条，README.zh.md 本来就只有一条）；「服务要升级到 0.2.6」这类过时要求改为「当前服务（0.5.1）」；补上完整的 `git clone` 命令；npm tarball 说明去掉不准确的内容枚举（tarball 只含插件本体，不含 `wallpaper-engine-api/`）；新增两条 FAQ——`npm install` 报 `EALLOWREMOTE` / 取不到包时的三步兜底命令，以及「双击启动服务后什么都没发生」= 静默启动缺配置、改用 `启动服务.bat`。

## [0.5.4] - 2026-10-01

### 修复

- **`dsh-wallpaper-bg status` 现在能认出「装了但没进 bundles」的状态**：`dsh plugin … add` 由 DSH 自己把插件名回填进 `dsh.profile.bundles`，只有进了这个列表才会被当成 profile 组合层加载；版本刚发布、注册表还在传播时偶尔会漏写（依赖装上了、bundles 里却没有），表现是「装完了但 设置 → 壁纸 里没有面板」。status 以前只按「依赖里有没有」判断，会误报成已安装；现在区分为 `installed（bundle 层，随 DSH 启动加载）` 与 `installed（依赖已装，但 dsh.profile.bundles 里没有 … → 不会被加载；重跑一次 dsh plugin --profile <name> add dsh-wallpaper-bg 即可补上）`，desktop profile 一行同理。
- **README / README.zh.md FAQ 增补**：「装完没有面板」的排查步骤（查 `dsh.profile.bundles`、用 status 判断、重跑一次 add），以及 `<DSH 地址>/dsh-wallpaper-bg/health` 这另一半检查。

## [0.5.3] - 2026-10-01

### 新增

- **「WE 壁纸库」连不上服务时直接给出获取方式**：面板的错误提示现在写明该服务只随仓库提供、不在 npm 包里，并给出 `git clone https://github.com/nishuoyang/dsh-wallpaper-bg` → `wallpaper-engine-api` 里 `npm install` → 双击 `启动服务-静默.vbs` 的完整步骤，同时说明不需要 WE 壁纸库时可以忽略（内置壁纸与自定义上传都不依赖它）。`dsh-wallpaper-bg install` / `status` / `help` 与 `install-local.ps1` 的提示同样补上了仓库地址，`package.json` 描述里也标明了这一限制（桌面端「设置 → 插件」列表与 npm 包页面可见）。

### 变更

- **npm ↔ GitHub 双向关联**：`package.json` 补齐 `repository` / `homepage` / `bugs` / `author`（从下一次发布会写进 npm 注册表元数据，npm 包页面随即出现指向本仓库的 Repository 链接）；README / README.zh.md 顶部新增 npm 版本 / 下载量 / release / license 徽章；仓库 About 的 Website 指向 npm 包页面。
- **新增两个 CI 工作流**（`.github/workflows/`），都不改动现有发布流程：
  - `publish-npm.yml`：用 OIDC **trusted publishing** 发布到 npmjs（无需 token），npm 自动附带 **provenance** 证明——npm 包页面出现 "Built and signed on GitHub Actions" 徽章，点开直达本仓库 / commit。默认只手动触发，避免与 `release.ps1` 的本地 `npm publish` 抢版本号。
  - `publish-github-packages.yml`：GitHub Release 发布后把包镜像到 GitHub Packages（`@nishuoyang/dsh-wallpaper-bg`），让仓库右侧的 **Packages** 区块列出本包。该镜像仅供 GitHub 侧展示——GitHub Packages 的 npm 源即使 public 也要带 token 才能 install，对外安装仍走 npmjs。

### 修复

- **装进没有 Web 服务的 profile 不再让 DSH 启动失败**：宿主半原先用 `inject: ['webServer']` 硬门控，在没有 Web 服务的 profile（`headless`、`tui`、自建 profile，以及终端里 `dsh plugin --profile desktop` 新建出来的 desktop profile）里这条插件行会永远停在 pending，DSH 启动直接报 `plugin tree failed to load: dsh: 1 entry did not activate / dsh-wallpaper-bg: waiting for service: webServer`——用户装完插件整个 profile 都起不来。现在改为 `ctx.inject(['webServer'], cb)` 按需注入：服务缺失时插件照常激活、什么都不注册；服务出现时自动注册路由、消失时自动注销。`web` / 桌面端行为与之前完全一致（`/dsh-wallpaper-bg/health`、`/we`、`/asset` 全部照常）。

### 文档

- **新增「升级」小节**（README / README.zh.md）：说明 `dsh plugin … add` 对已存在的依赖不会改范围（停在 `^0.4.1` 的 profile 不会自己升到 0.5.x），升级要写 `dsh-wallpaper-bg@latest` 或具体版本；并说明 **pnpm 11 默认 24 小时 `minimumReleaseAge`** 的影响——版本发布后约一天内 `add dsh-wallpaper-bg` 只会装到上一个版本（`@latest` 同样受限），要立刻安装可写死版本号、加 `--config.minimumReleaseAge=0`，或在 profile 的 `pnpm-workspace.yaml` 里配 `minimumReleaseAgeExclude`。
- **补 Windows `link:` 安装的路径限制**：`dsh plugin` 经 shell 转发给 pnpm，仓库路径带空格时 spec 会被拆成两个假依赖（`link:E:/My` + `link:Dir/plugin`）导致 profile 加载失败；改用无空格路径或 `install-local.ps1` / `dsh-wallpaper-bg install`（后者链接到 `%DSH_HOME%\node_modules`，全程无空格）。
- **FAQ 增补两条**：安装到旧版本的处理方式；装进 `headless` / `tui` / 自建 profile 的行为（无害但无意义）。
- **WE 服务安装说明补一句**：`wallpaper-engine-api/` 只随仓库提供，npm 包（tarball）里只有插件本体，从 npm 安装的用户要用「WE 壁纸库」需 clone 仓库（README 里已给出仓库地址）。

## [0.5.2] - 2026-10-01

### 新增

- **主页面「原生背景」开关**（标题区 DSH 标旁边，空白首页与会话页都在）：一键清掉浅色雾层 / 深色遮罩，以及插件给界面表面加的半透明覆盖，让壁纸完整透出；输入框座位与弹窗仍保留半透明可读底色，细字不受影响。关掉开关即恢复原来的雾层 / 遮罩数值，开关状态持久化到 localStorage。开关本体是胶囊开关：跟随 DSH 主题令牌、支持键盘焦点环（`:focus-visible`）、`role="switch"` + `aria-checked` 无障碍语义，并在 `prefers-reduced-motion` 下关闭过渡动画。

### 修复

- **切换「原生背景」或拖动外观滑杆时背景闪烁**：只改外观的 `setState`（原生背景、浅色雾层 / 深色遮罩、模糊度、亮度、安全放大）不再走 `applyNow()`——那条路径会重新加载壁纸并交叉淡入，拖动滑杆时会一路闪——改为直接更新当前图层（遮罩 / 滤镜 / 缩放）。
- **开关滑块圆点不可见**：拇指颜色原用 `--dsw-alias-switch-thumb`，而本版 DSH 并没有这个令牌（解析为空 → 圆点透明，只剩一条色带）；改用实际存在的 `--dsw-static-neutral-00` / `--dsw-static-neutral-bluish-1000` 并带字面兜底，深色主题「开启」时拇指按 DSH 习惯显示为深色。
- **WE API 启动脚本的依赖检查**：`启动服务.bat` 从「只看 `node_modules\wallpaper-engine-api` 目录在不在」改成校验该包的 `package.json`——目录建出来但装到一半也能被发现，重新跑 `npm install` 补装。同时不再检查 `koffi` / `jpeg-js`：它们随 0.5.0 的桌面画面捕获一并移除，留着会让每次启动都白跑一次 `npm install`。

### 变更

- 新增浅色外观下的原生背景实拍图 `docs/screenshots/overview-native-light.jpg`（1440×765，190KB），README / README.zh.md 同步引用。
- README / README.zh.md 的发布示例改为 `-Version x.y.z`：发布脚本会按旧版本号批量替换 README 里的字符串，写死版本号每次发版都要顺手改一遍。
- 插件版本 0.5.2（宿主半 `/dsh-wallpaper-bg/health` 的 `version` 同步为 0.5.2，`monitorForward: 1` 不变）；WE API 服务仍是 **0.5.1**——服务端代码本次未改，只改了它的启动脚本。

## [0.5.1] - 2026-10-01

> 本版**一并发布此前未单独发版的 0.5.0**（「同步桌面壁纸」回到只读跟随、场景改显示工坊预览图、WE API 服务移除桌面画面捕获等）——完整说明见下方 [0.5.0] 条目。

### 修复

- **「同步桌面壁纸」跟错显示器**（多屏 / 笔记本 + 外接屏常见）：`/api/current` 旧实现直接取 WE `config.json` 里 `selectedwallpapers.Monitor0`，而这个键的编号由 WE 自己维护——显示器插拔、切换主屏、笔记本内屏关掉之后，`Monitor0` 往往不是你正在看的那台。表现就是**页面一直是「以前那张」壁纸**（很容易被误判成缓存没清、同步没生效）。
  - 现在按四级判定跟随哪台显示器：**手动指定**（设置面板「跟随显示器」下拉）→ **最近换过壁纸的那台**（对比 `wallpaperconfigrecent` 最后两条配置的差异；日常使用中就是正在看的那台）→ **正在被读取 / 播放的那台**（各显示器壁纸媒体文件 `atime` 最新者：没在渲染的壁纸不会更新 atime）→ `Monitor0` 兜底。全程仍只读 `config.json` + `stat`，不采样桌面画面、不调用 WE 任何写入接口。
  - `/api/current` 响应新增 `monitor` / `monitorSource`（`manual` / `changed` / `live` / `first` / `none`）与 `monitors[]`（每台显示器的键、标题、类型、是否正在播放、是否被选中）；`?monitor=Monitor1`（或 `?monitor=1`）可显式指定，非法值自动退回自动判定。旧字段 `current` 原样保留，旧客户端不受影响。
  - 插件端：WE 页签的**同步状态行**显示「显示器 Monitor1（自动：最近换过壁纸的那台）」，多显示器时出现**「跟随显示器」下拉**（`auto` = 自动判定，也可钉死某台）；`monitor` 经宿主半透传给服务，并计入宿主缓存键（切显示器立刻生效，不会命中上一台的缓存）。
  - **场景壁纸的预览图会如实标注像素**：服务端解析 `preview.gif` / `preview.jpg` 头部，状态行显示「实测 192×192 像素，全屏放大后必然发虚」——WE 工坊预览图普遍只有 192×192，说出来才不会又被当成「缓存里的旧图」。视频 / 图片 / 网页壁纸仍是原生渲染，不受影响。
  - **修掉「跟随显示器」下拉与「立即刷新」按钮文字重叠**：初版把 `<select>` 包在 `<label>` 里塞进 `.wbg-row`，而面板早已有 `.wbg-row label{width:88px;flex:none}` 规则——`label` 被钉成 88px 宽（「跟随显示器」竖着折成 4 行），`select`（选项里还塞了完整壁纸标题）溢出到按钮底下。现在改用独立的 `div.wbg-sync`：整块 `flex:1 1 auto;min-width:0`、`select` 同样 `min-width:0`，空间不够时一起收缩 / 换行而不是覆盖按钮；下拉选项文案精简为「Monitor1（视频）· 正在播放」，完整标题仍在上方状态行里。已在 380 / 300 / 220px 三种宽度下用无头 Chrome 渲染核对（旧写法能复现原图，新写法不再重叠）。

### 变更

- `scripts/release.ps1` 补 UTF-8 **BOM**：Windows PowerShell 5.1 对没有 BOM 的 `.ps1` 按 ANSI 解码，脚本里的中文提示会让整个脚本在**解析阶段**就失败（`字符串缺少终止符`），只有 PowerShell 7 才跑得起来。与 0.3.x 给 `install-local.ps1` 补 BOM 是同一类问题（0.5.1 发布时实测踩到）。
- WE API 服务版本 0.5.1（`/health` 新增 `monitorSelect: 1`）；插件版本 0.5.1（宿主半 `/dsh-wallpaper-bg/health` 新增 `monitorForward: 1`）。宿主半随 `dsh` 启动加载：若该标记缺失（旧宿主半），面板会提示「指定显示器需要重启 dsh 后生效」，而不是让下拉静默无效。
- 新增 `verify-host.mjs`：不启动 DSH，用最小 ctx 直接挂载宿主半、以假 req/res 打真实路由（`/health`、`/we?action=current` 的显示器透传与缓存维度、`/we?action=list`、`/asset`）。`verify-service.mjs` 增加当前壁纸的显示器判定用例，并支持用 `WEAPI_BASE` 指向非 8088 端口。

## [0.5.0] - 2026-09-30

### 变更

- **场景类壁纸一律显示 WE 工坊预览图，「同步桌面壁纸」回到只读跟随**：0.4.0 为「在网页里看会动的场景」引入了桌面截图镜像（约每秒采样一次桌面画面），实际观感并不划算——镜像到的是**整个桌面**（任务栏、其它窗口都会进画面），帧率只有 ~1 fps，还要求 WE 正在运行。现在回到最干净的做法：
  - 场景壁纸（手动选中 / 播放队列 / 桌面同步）一律显示 WE 自带的工坊预览图 `preview.gif`（会动）/ `preview.jpg`，不再与服务端产生任何帧请求；
  - 「同步桌面壁纸」恢复为**只读跟随**：桌面换成哪张、页面对上（30 秒轮询 + 切回 DSH 页签立即跟随），然后按类型走普通渲染路径——场景 → 工坊预览图、视频 → 视频、图片 → 图片、网页 → iframe；**同步状态行**显示跟随的壁纸标题 / 类型 / 上次同步时间，带「立即刷新」，跟随到场景时额外说明「页面显示的是工坊预览图」；
  - 想要 100% 保真的动态场景：用 WE 托盘菜单的屏幕录制（或 OBS）录 30 秒左右导出 MP4，再从「自定义上传」导入，浏览器里用原生 `<video>` 播放——完整流畅、零额外开销（README 常见问题里一直保留这条建议）。
- 插件版本 0.5.0；建议搭配 **WE API 服务 0.5.0**（`/health` 的 `version` 应为 `0.5.0`）。旧版服务（0.4.x）与本版插件混用不会报错，只是 `capture` 端点不再被调用。

### 移除

- **WE API 服务移除桌面画面捕获整套实现**：删除 `lib/desktop-capture.js`（`PrintWindow(Progman, PW_RENDERFULLCONTENT)` + 主屏 `StretchBlt` + `koffi` FFI / `jpeg-js` 编码）、`GET /capture` 路由与 `probe()` 探测；`/health` 不再上报 `desktopCapture` / `captureError` / `primary`（保留 `webShim`、`weRunning` 与路径信息）；`package.json` 依赖回到只剩 `wallpaper-engine-api`（`package-lock.json` 同步收敛，`koffi` / `jpeg-js` 及其 win32 原生模块不再安装）。`/capture` 现在一律 `404`。
- **插件侧移除全部镜像代码与文案**：`lib/client.js` 的镜像轮询 / 单 `<img>` 换帧 / 黑帧提示 / 捕获不可用提示、`lib/host.js` 透传的 `desktopCapture` 能力位、设置面板与 README 中「实时镜像桌面画面」的表述全部删除。
- 启动向导写入的 `we-api.config` 注释与 `启动服务.bat` 输出同步改写（桌面同步只需跟随桌面壁纸，没有任何需要开启的开关）。

### 维护

- `verify-service.mjs` 契约校验适配：断言服务版本 `0.5.0`、`/health` 无 `desktopCapture` 字段、`/capture` 与 `/scene-frame`、`/scene-anim` 一律 `404`；`test-bridge.js` 第 4 项改为「`/capture` 已移除」。
- 文档：README（中英）特性表 / 设置面板说明 / 原理 / 常见问题里与镜像、捕获相关的段落全部改写；CONTRIBUTING、SECURITY 同步更新（服务只列列表、只读文件、只读当前壁纸，**不采样屏幕**）。

## [0.4.2] - 2026-09-30

### 修复

- **首次运行向导在 CMD 下解析报错（0.4.1 引入，修法来自 PR #1 by @Mulbaixi）**：`启动服务.bat` 写入 `we-api.config` 的 `( ... )` 命令块里，注释文本含未转义的括号，CMD 会提前闭合代码块并中止整个脚本——新用户双击向导会直接失败，`we-api.config` 写不出来，服务也就配不起来。现把括号转义为 `^(` / `^)`，写出的配置内容与措辞保持不变。
  - 说明：PR #1 是针对 0.3.12 的旧文案提交的，那一行在 0.4.0 砍掉场景渲染时已被删除，因此合并时把同一修法应用到了 0.4.1 的新文案上。
- `install-local.ps1` 补 UTF-8 BOM：此前在 Windows PowerShell 5.1 下中文注释与提示会乱码。

### 变更

- **发布脚本 `scripts/release.ps1` 更耐中断**（此前一次远端抖动或 npm 传播延迟就会把整条发布流程卡死）：
  - `npm publish` 后注册表要几十秒到几分钟才可见，改为轮询等待（`-NpmWaitSeconds`，默认 300 秒），等不到只警告并继续发 GitHub Release。
  - GitHub Release 步骤幂等：`gh release create` 失败重试 3 次，若 Release 其实已经建好则改为补传附件。
  - 新增 `-Resume`：上次中断后续跑，要求工作区干净、标签指向 HEAD，跳过已成功的步骤（提交 / 打标签 / 推送 / 发布）。
  - 远端标签查询失败重试 3 次，不再被单次远端错误打断。
- **补齐 GitHub 社区规范文件**：`CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）、`CONTRIBUTING.md`（中英双语：本地开发 / 测试 / 只读承诺 / 提交与发布流程）、`SECURITY.md`（支持范围、私密报告入口、设计与范围说明）、issue 表单（bug / feature）与 PR 模板。

## [0.4.1] - 2026-09-30

### 新增

- **DeepSeek Harness 0.2 桌面端安装支持（文档 + 安装器）**：桌面端自带插件管理页面，插件本身无需改动即可工作（本机 `0.2.0-rc.2` 桌面端实测：宿主半 `/dsh-wallpaper-bg/health` 返回 `{"ok":true,...}`，客户端「壁纸」设置页签正常注册）。本次补齐的是安装路径与说明：
  - README 中英双语新增「桌面端安装（无需命令行）」：**设置 → 插件** 里输入包名 `dsh-wallpaper-bg` → 安装 → 按提示重启应用；等价命令 `dsh plugin --profile desktop add dsh-wallpaper-bg`（需先在应用内装上 `dsh` 命令）。
  - 说明 `desktop` profile 由 Electron 应用独占管理：终端启动会被拒绝（`profile "desktop" is managed exclusively by the Electron application`），这是预期行为；`dsh plugin --profile desktop …` 仍可用。前提条件改为「桌面端自带 Node / pnpm，无需自装 Node.js；只有 `dsh web` 才需要 Node ≥ 20」。
  - 验证方式按部署区分：`dsh web` 默认 `http://127.0.0.1:3080/dsh-wallpaper-bg/health`；桌面端固定 **19387**（`dsh-desktop-host` 启动 `desktop` profile 时写死 `--port 19387`，本机 0.2.0-rc.2 实测），即 `http://127.0.0.1:19387/dsh-wallpaper-bg/health`；界面里「设置 → 插件 / 设置 → 壁纸」同样能确认。端口固定也意味着页面 origin 稳定，自定义上传（IndexedDB）与各项设置（localStorage）在桌面端重启后保留。

### 变更

- **安装器 `bin/dsh-wallpaper-bg.js` 增加桌面端感知**（此前它会把插件行写进**每个** profile 的用户补丁层，包括 Electron 独占管理的 `desktop`——而桌面端已经通过 `dsh.profile.bundles` 加载插件，再插一行就会重复挂载）：
  - `install` 跳过 `desktop` profile 并给出桌面端安装指引；已经作为插件包安装（`package.json` 的 `dsh.profile.bundles` / `dependencies` 里已有本包）的 profile 同样跳过并说明原因；全部跳过时以退出码 0 结束并说明是「已生效」还是「需在桌面端应用内安装」，不再误报失败。桌面端专属部署（连用户补丁层都没有）也只给指引，不报错。
  - 新增 `--profile <name>`：只对指定 profile 生效（名字不存在时报错并列出可用 profile）。
  - `ensurePatchFiles()` 不再往 `desktop` profile 创建模板补丁层；`uninstall` 不再触碰 `desktop` profile，并提示桌面端的卸载方式；`status` 逐 profile 报告状态（用户补丁层 / bundle 插件包 / 桌面端独占）并单列 desktop profile。
  - `install-local.ps1` 与 `cordis.patch.yml` 顶部注释同步桌面端说明（并修正 install-local 里过时的「新建会话选择预设」提示）。
- `package.json`：版本 0.4.1，描述补上「0.2 桌面端」，keywords 加 `desktop`（描述会显示在桌面端插件页面里）。

## [0.4.0] - 2026-09-13

### 移除（架构转折）

- **砍掉本地场景渲染与烘焙整套方案**：不再解析 `scene.pkg`、不再渲染场景帧、不再烘焙循环视频。
  - WE API 服务删除：`scene-frame.js` / `scene-anim.js` / `scene-video-frames.js`、`lib/we-renderer/`、`lib/pkg-extract.js`、`lib/scene-scripts.js` 等全部渲染器源码；`/scene-frame`、`/scene-anim` 端点一律 `404`。
  - 删除 `WE_SCENE_RENDER` 开关（配置键 / 环境变量 / 启动向导写入全部移除）；`/health` 不再上报 `sceneRender` / `puppetAnim` / `sceneAnim` / `sceneFrameCache`。
  - 不再创建 `~/.dsh-wallpaper-bg` 缓存目录；**已清理本机历史遗留的 847.9 MB 帧 / 视频缓存**。依赖 `@shaderfrog/glsl-parser` 一并移除。

### 新增

- **桌面壁纸实时镜像（新「同步桌面壁纸」底座，思路参考 GitHub 上的桌面同步方案）**：不去渲染、不去烘焙——Wallpaper Engine 本来就在桌面上用自己引擎（GPU）实时渲染当前壁纸，插件直接**采样那些像素**：
  - WE API 服务新增 `GET /capture?w=&q=`：`PrintWindow(Progman, PW_RENDERFULLCONTENT)`（DWM 合成路径，含 WE 的 `WPEDesktopDX11Window` D3D 子窗口；新式独立 swapchain 合成下 GDI `BitBlt(CAPTUREBLT)` 只能拿到**全黑帧**，所以 PrintWindow 是主路径、BitBlt 仅作兜底）→ 主屏区域 `StretchBlt` 缩放 → 内存 JPEG，全程不落盘（`lib/desktop-capture.js`，koffi FFI + jpeg-js；实测 1280×720 约 100ms/帧）。黑帧经响应头 `X-Capture-Black: 1` 上报，客户端在状态行说明原因，不再默默黑屏。
  - 「同步桌面壁纸」改为：复用单个 `<img>` 图层、每 ~1 秒向 `/capture` 换一帧（fetch + blob，便于读取黑帧 / 错误响应头）——场景的粒子 / 水面 / 角色呼吸等于是桌面实况，视频 / 网页 / 图片类桌面壁纸同样镜像。
  - 场景壁纸手动选中 / 队列：显示 WE 自带的工坊预览图（`preview.gif` / `preview.jpg`），不再有任何帧渲染请求。
  - `/health` 新增 `"desktopCapture": 1|0`（0 = 无交互桌面 / WE 未运行）；服务版本 0.4.0。
- 插件 `lib/client.js` 移除全部烘焙控件 / 状态（`sceneAnim*` 状态、烘焙按钮、`WE_SCENE_RENDER` 提示），同步状态行改为镜像状态；依赖服务 0.4.0（旧版服务镜像会失败并在状态行给出提示）。

## [0.3.13] - 2026-09-13

### 新增

- **桌面壁纸同步的场景化增强**：同步（只读跟随 WE 当前桌面壁纸）此前只能「桌面换到哪张、页面显示哪张」，场景类壁纸还只是一张静态帧，跟随状态也不可见。现在：
  - **同步状态行**：WE 页签下显示正在跟随的壁纸标题与类型、上次同步时间；场景壁纸烘焙中还显示进度百分比，旁边是「立即刷新」按钮——不必等 30 秒轮询。
  - **页面重新可见时立即再查一次**：切走 DSH 页签再切回来（`visibilitychange`）立刻跟随桌面最新壁纸，配合原有 30 秒轮询，日常「桌面换一张 → 页面对上」几乎无感。
  - **同步桌面时自动烘焙**（新开关，默认开，与「选中时自动烘焙」独立）：桌面当前是未烘焙的场景壁纸时自动开始烘焙，完成后自动从静态帧叠化到循环动画——跟随桌面就是想看到会动的场景；不想让它吃 CPU 可关掉，手动选中仍走原来的「选中时自动烘焙」（默认关）。
  - **场景渲染未开启时的明确指引**：同步到场景壁纸但服务端 `WE_SCENE_RENDER=0` 时，状态行直接写明「网页端暂显示工坊预览图」及开启方式（`we-api.config` 加一行 `WE_SCENE_RENDER=1` 并重启服务），不再让用户对着一张预览图猜原因。
  - 以上均为插件侧改动（`lib/client.js`），无需升级 WE API 服务；场景渲染能力仍需服务端 `WE_SCENE_RENDER=1` 开启（见 0.3.12）。

## [0.3.12] - 2026-09-10

### 变更

- **场景类壁纸渲染加总开关，默认关**：场景帧渲染（`/scene-frame`）与动画烘焙（`/scene-anim`）现在由 `WE_SCENE_RENDER` 控制（环境变量或 `we-api.config`，`1/true/on` 开启），**默认关闭**。关闭时服务启动、`/health`、列表接口都不会再创建 `~/.dsh-wallpaper-bg` 缓存目录，场景路由直接返回 `403`，插件端把场景壁纸回退到工坊预览图（`preview.gif` / `preview.jpg`）——只装壁纸插件、不打算用场景渲染的用户不会再被自动生成 `C:\Users\<用户名>\.dsh-wallpaper-bg`。需要完整场景帧 / 烘焙动画时，在 `wallpaper-engine-api/we-api.config` 里加一行 `WE_SCENE_RENDER=1` 并重启服务（首次运行 `启动服务.bat` 的向导已默认写入 `WE_SCENE_RENDER=0`）。
  - 服务 `/health` 与 `/api/wallpapers` 响应新增/如实上报 `sceneRender: 0|1`（关闭时 `puppetAnim` / `sceneAnim` 同为 0、`sceneFrameCache` 为 `null`），插件宿主半把该能力位透传给客户端——关闭时客户端不再发起注定失败的 `/scene-frame` 请求，设置面板的烘焙区块改为提示「在 we-api.config 设置 WE_SCENE_RENDER=1」。
  - 配置方式沿用现有约定：环境变量 > `we-api.config`（键名 `WE_SCENE_RENDER`）。旧配置文件没有该键 = 默认关；升级后想继续用场景渲染的用户需显式开启一次。
  - **已有缓存目录可手动删除**：`~/.dsh-wallpaper-bg` 只缓存渲染产物，删除不影响插件其它功能（图片 / 视频 / 网页壁纸不依赖它）。
- 插件 0.3.12 建议搭配 **WE API 服务 0.3.1**（开关默认关）；升级后 `http://127.0.0.1:8088/health` 的 `"sceneRender"` 应为 `0`（开启后为 `1`）。服务版本号从 0.3.0 → 0.3.1。
- `verify-service.mjs` 契约校验适配开关：默认关时断言场景路由 `403`、`/health` 不报告缓存目录；`WE_SCENE_RENDER=1` 时执行原有完整场景渲染 / 烘焙契约。

### 修复

- `scripts/release.ps1`（发布工具，不进 npm 包）：`Run()` 的参数名用了 PowerShell 自动变量 `$args`，调用时传进去的数组被静默丢弃（`git` 变成裸命令、打印帮助），发布在提交步骤就中断；同时 `$ErrorActionPreference = 'Stop'` 会把 git / npm 写到 stderr 的正常进度（`To https://...`、`LF will be replaced by CRLF`）当成终止错误。两处都已修。另外 Release 附件改用 `npm pack --pack-destination` 获取并在失败时打印原因（0.3.11 首次发布时因此漏掉了 .tgz，已补传），Release 链接也不再打印多余的 `.Trim()`。

## [0.3.11] - 2026-09-09

### 新增

- **场景壁纸动起来了（离线烘焙成循环视频）**：场景壁纸此前只能渲染成**一张静态帧**——粒子不飘、水波不动、角色不呼吸。真正的实时播放要把渲染器搬到 GPU（工程量以周计），而「离线烘焙」能用小得多的代价拿到同样的观感：服务端把场景渲染成若干帧、自动找循环点、用 ffmpeg 编码成一段无缝循环 MP4，浏览器用原生 `<video loop muted>` 播放（**60fps 且几乎零 CPU 开销**，插件早就支持视频层）。
  - **服务端** `GET /scene-anim/<id>?w=&h=&fps=&dur=&bake=1&cancel=1`（异步任务：入队 → 逐帧渲染 → 编码）+ `GET /scene-anim/<id>/video.mp4`（带 Range 的 MP4）+ `GET /scene-anim/status`（任务列表）。渲染在 worker 线程完成，**逐帧写盘**（不把整段动画留在内存），同一时刻只跑一个任务、其余排队。
  - **循环点检测**：worker 顺便算每帧的 32×N 缩略签名，主线程找一个与首帧最接近的帧作为循环终点并裁掉尾部（实测差异 3~5/255），循环播放时不会看到跳变。所有帧签名几乎一致 → 判定该壁纸本身没有动画，不产出视频。
  - **客户端**：设置 → 壁纸 里新增「场景壁纸播放烘焙动画」（默认开）与「选中时自动烘焙」（默认关，烘焙很吃 CPU），带烘焙按钮 / 进度百分比 / 取消。已烘焙的场景壁纸直接播视频，未烘焙的先显示静态帧并提示；烘焙完成后若正显示该壁纸会自动叠化切到动画。
  - **实测成本**（本机，1080p / 24fps / 4 秒循环 = 120 帧）：普通场景 3.7 分钟（「亚斯娜」1.5 秒循环、300KB），骨骼角色场景 6.6 分钟（「小鸟游星野」4.96 秒循环、2.5MB）。烘焙是**一次性**的，之后走磁盘缓存秒开；重效果场景（水波/大量效果）可能 5~25 分钟，后台进行不影响使用。
  - **拿不到的**：鼠标视差、音频响应、可交互（「可触摸」）类效果——它们依赖实时输入，预渲染视频天然无法复现。

### 变更

- 插件 0.3.11 建议搭配 **WE API 服务 0.3.0**：升级后双击 `wallpaper-engine-api/重启服务(管理员).bat`，`http://127.0.0.1:8088/health` 应出现 `"sceneAnim": 1`。未升级时新设置项不报错，只是没有烘焙动画可用（仍旧显示静态场景帧）。
- `verify-service.mjs` 契约校验扩到 30 项（新增 `sceneAnim` 能力位、烘焙状态 / MP4 响应 / Range / 未知 ID / 任务列表）。

## [0.3.10] - 2026-09-09

### 修复

- **场景壁纸里角色的眼睛「没有」或「位置不对」**：WE 的 2D 角色是 puppet 骨骼网格，眼睛（眼白 / 眼珠 / 眼睑 / 睫毛）靠骨骼动画摆位和眨眼。原来的渲染器有三处偏差，叠加起来就是用户看到的现象——角色像没有眼睛，或眼睛长在别处：
  - **骨骼动画整段解析失败（fps ≠ 30 的模型）**：MDLA 动画头原来靠扫描浮点特征 `[f0 41]`（= 30.0f）定位字段，只对 30fps 的模型成立；60 / 24 / 66.7fps 的模型要么读成垃圾、要么抛异常把**整个动画列表清空**，角色只能停在绑定姿态（`anims=0`）。现在按段头逐字段读取（fps / 帧数 / 骨骼数 / 段字节），后续动画用「字段 + 名字串 + 骨骼数」签名扫描定位。实测 123 个 puppet 网格里含动画的从 97 个升到 **109 个**（其余 14 个本身没有 MDLA 段）。
  - **动画缩放被完全忽略**：每帧 36 字节 = 9 个 float `[x, y, 0, 0, 0, 旋转, 缩放x, 缩放y, 缩放z]`，旧实现只读位置和旋转，**从不读缩放**——而眨眼正是靠眼睑骨骼的 `scaleY` 从 1 收缩到 0.04 实现的，所以眨眼永远不发生。现在骨骼变换是完整的 2D 仿射（平移 + 旋转 + 缩放），蒙皮矩阵按 `finalWorld × bindWorld⁻¹` 计算。
  - **段起点与列映射**：每骨骼段之间还有 8 字节 `[u32 0][u32 段字节]` 前缀，旧的「9 列交错」读法在位置上是等价变换，但旋转列会整体差一帧。现在显式按 `段起点 + 帧×36` 读取，并逐骨骼校验「帧 0 是否等于 MDLS 绑定姿态」——本机 109 个含动画模型全部通过（位置 / 旋转 / 缩放三项一致）。
- **静态帧正好落在闭眼相位**：壁纸当背景只取一帧，若这一帧恰好是眨眼动画的闭眼段，角色看起来就像没有眼睛（例如「小鸟游星野-祈福」2.5s 处闭眼，且该动画有 40% 的时间是闭眼）。新增**静态帧时刻选择**：从动画数据里识别「眼睑类骨骼」（`scaleY` 在动画中大幅变化），默认时刻若开度 < 0.85，就在候选时刻里挑「入场动画已稳定 + 眼睑开度最大」的时刻（如该壁纸自动改到 6s）。可用 `&auto=0` 关闭，响应头 `X-Scene-Still-Time` 会报出实际使用的时刻。
- **旋转图层上出现巨大黑色矩形 / 菱形（镜头光晕、彩虹弧、纯色叠加层）**：WE 用 `colorBlendMode` 表达「屏幕 / 亮化 / 叠加」这类颜色混合，镜头光晕类素材本身就是**黑底 + 一圈彩虹弧**、完全靠混合模式把黑底消掉。渲染器的旋转分支 `blitRotated` 没有混合模式参数，于是所有「旋转 + 有 colorBlendMode」的图层都被当成不透明矩形画出来——「亚斯娜 结城明日奈」正中央那个黑菱形就是旋转 42.6° 的镜头光晕层。现在 `blitRotated` 与 `blitScaled` 走同一套 `ApplyBlending`，`image` / `solidlayer` 两个旋转分支都带上 `colorBlendMode`。静态扫描：本机 134 张场景里有 **26 张 / 60 个图层**属于这一类（含 3 张专门的 rainbow-lens-flare 壁纸）。
- **渲染"成功"但其实是白屏 / 灰屏**：质量门禁原来的条件是「几乎全黑 **且** 颜色极少」，于是两种退化帧都漏过去了——「UNKUSU」那张只画出了白底 + 红色水印文字（2 色），「The Blur」的全屏渐变层没渲染出来（23 色灰渐变）。现在门禁只要「采样颜色数 < 48」即判退化（真实画面在 4bit 量化采样下都有数百~数万色），本机又拦下 **6 张**这类壁纸，回退主纹理或工坊预览图。
- 实测本机 134 张场景壁纸：**109 张**输出真正的完整场景帧，21 张回退主纹理静态帧，4 张（含 1 张 pkg 里既无场景也无可用主纹理）由插件端回退工坊预览图。渲染耗时 p50 ≈ 8s、p90 ≈ 35s（首次；之后走缓存）。

### 变更

- 插件 0.3.10 建议搭配 **WE API 服务 0.2.9**：升级后双击 `wallpaper-engine-api/重启服务(管理员).bat`，`http://127.0.0.1:8088/health` 应出现 `"puppetAnim": 2`（旧版为 0/缺省，角色眼睛会闭着或错位）。场景帧管线版本 `wb2 → wb3`，旧缓存自动失效重建。
- **退化帧负缓存**：被判退化的场景（如上面那 4 张）第一次请求要跑完整渲染 + 主纹理提取（5~45 秒），现在会在缓存目录写一个 `<key>.fail.json` 标记，之后同一张壁纸**秒回 422**，由插件端直接显示工坊预览图。只对确定性判定（质量门禁 / 主纹理门禁）写标记，超时、取消等瞬时失败仍可重试；管线版本变化时 key 变化，标记自动失效。
- `verify-service.mjs` 契约校验扩到 23 项（新增 `puppetAnim` 能力位、`X-Scene-Still-Time` 响应头、`auto=0` 行为、眨眼场景自动换时刻、退化帧门禁 422、负缓存秒回）。

## [0.3.9] - 2026-09-09

### 新增

- **场景壁纸从「预览图」升级为「完整场景帧」**：借鉴 [dsh-plugin-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine) 的纯 JS 场景渲染器（`lib/we-renderer/`），把 WE 的 `scene.pkg` 真正渲染出来——对象树（image / puppet 骨骼网格 / model / 粒子 / text）、纹理解码（RGBA / DXT1/3/5 / 内嵌 JPEG）、shader 效果链（waterwaves / waterripple / godrays / watercaustics / filmgrain 等 20 余种 CPU 实现 + 第三方 workshop GLSL 效果）、场景脚本与用户属性。以前场景类壁纸只能显示工坊预览图（`preview.gif` / `preview.jpg`），现在是一张按场景正交比例渲染的完整画面。
  - **渲染跑在 WE API 服务里**（`wallpaper-engine-api/`），新增 `GET /scene-frame/<id>?w=&h=&t=&refresh=1` 返回 PNG；渲染在 **worker 线程**完成，不阻塞服务事件循环，客户端切换壁纸时通过 `AbortSignal` 终止 worker 释放 CPU。
  - **磁盘缓存**：`~/.dsh-wallpaper-bg/cache/scene-frames/`（`DSH_WB_CACHE_DIR` 可覆盖），key 含场景文件 mtime + 渲染尺寸 + 时刻 + 管线版本，工坊更新后自动重建；实测命中后由 8.6 秒降到毫秒级。
  - **插件端优先用渲染帧**：`/dsh-wallpaper-bg/we` 透传 `hasFrame` / `previewFile`，客户端对 `kind=scene` 的壁纸先加载渲染帧（`w=2560&t=2.5`），失败自动回退 `preview.gif` / `preview.jpg`；队列循环也把渲染帧纳入预热，切换同样走叠化。
  - **实测本机 134 张场景壁纸**：完整场景渲染 **114 张（85%）**，回退主纹理静态帧 19 张，两者都无内容 1 张（由插件端回退工坊预览图，属预期）。渲染耗时 p50 ≈ 9.3s、p90 ≈ 34s（首次；之后走缓存）。
- **视频纹理场景也能渲染了（新增 ffmpeg 抽帧）**：不少场景壁纸的主画面其实是**视频纹理**——`.tex` 容器里内嵌的 MP4（WE 的 sync 动画），或材质直接引用的独立 `.mp4` / `.webm` / `.mov`。渲染器只会解码静态纹理，遇到这类场景会整体失败（回退主纹理甚至 422）。现在渲染前先用 ffmpeg 抽出目标时刻的一帧 PNG，以 `videoFrames` 映射交给渲染器替代视频纹理：本机 3 张这类场景全部从「422 / 回退」变成完整场景帧（含粒子层），其余 11 张原本已能渲染的场景里带视频纹理的也不再缺画面。ffmpeg 来源：`WE_FFMPEG` / `FFMPEG_PATH` → 系统 PATH → 常见安装位置；**找不到就自动跳过**（行为退回改造前，不报错）。抽帧结果缓存于 `~/.dsh-wallpaper-bg/cache/video-frames/`。
  - ffmpeg 单帧导出的坑（9.0 实测）：`-ss` 与 `select=eq(n,0)` 同时用会**一帧都不写**（退出码 0、无 stderr）；`-frames:v 1` 单独用也不写；`select=gte(t,X)` 的 `t` 是时间基单位、不吃秒值。最终用 `-vf select=gte(pts,<秒>) -frames:v 1 -f image2 -vcodec png`。
- **画面质量门禁**：渲染器"成功"但输出基本是黑底（纯 shader 生成类场景常只画出文字、logo 层）时，判为失败并回退主纹理 → 再回退工坊预览图，不会给用户一张黑屏。

### 变更

- 插件 0.3.9 建议搭配 **WE API 服务 0.2.7**：升级后双击 `wallpaper-engine-api/重启服务(管理员).bat`，`http://127.0.0.1:8088/health` 应出现 `"sceneRender": 1`。未升级时场景壁纸自动退回原来的预览图显示，其它类型不受影响。
- 服务新增依赖 `jpeg-js`（纹理内嵌 JPEG 解码）与 `@shaderfrog/glsl-parser`（第三方 workshop GLSL 效果，可选——未安装时渲染器照常工作，仅跳过未内置实现的效果）。
- `wallpaper-engine-api/server.js` 重建：0.3.8 的网页壁纸垫片（`applyUserProperties` 属性注入 / 媒体接口占位 / 音频静默频谱 / `painted` 上报）、`/files` 路由的 ETag·Last-Modified 条件请求 + Range + 流式发送、以及 `../assets/...` 的 Referer 兜底，全部按 0.3.8 的行为重新实现，并叠加本版的 `/scene-frame` 路由。可用 `node verify-service.mjs` 做端到端契约校验（17 项）。
- 开发教训：不要用 `Get-Content | Set-Content` 做批量文本替换——它会把 UTF-8 文件按 ANSI 读入再写回，中文注释全部变成乱码且加上 BOM（本次 `server.js` 就是这样被破坏并被迫重建的）。改文件一律用编辑工具。

## [0.3.8] - 2026-09-09

### 修复

- **网页壁纸黑屏 / 半天不出画面 / 内容像一张竖屏壁纸**：三个叠加的原因，插件与 WE API 服务一起修。实测 16 张网页壁纸：修复前 2 张 **85% 纯黑**、6 张内容只占画面中部（包围盒长宽比 0.46–0.85，看起来像竖屏壁纸）；修复后全部铺满 1920×1080，纯黑 0%，叠化时刻从 **4000ms+** 降到 **75–1000ms**。
  - **未插入 DOM 的 iframe 根本不会加载**：旧实现先给 iframe 设 `src`、等 `load` 时才插入图层，而浏览器里未插入文档的 iframe 没有浏览上下文——`src` 不加载、`load` 永不触发、`contentDocument` 为 `null`（实测采样：`src-set@0 → 4001ms 才 attached → 4021ms 才 load`）。于是每张网页壁纸都要等 **4 秒兜底定时器**插入后才开始加载，且插入瞬间就叠化，第三方页面往往还没画出第一帧。现在先插入图层（`opacity` 仍为 0，不会提前露出）再设 `src`，加载零延迟；同时给 iframe 补上 `allow="autoplay"`（部分壁纸自带 BGM，`play()` 被拒会卡在初始化）。
  - **WE 私有接口缺失**：WE 用 `file://` 加载网页壁纸并注入 `wallpaperPropertyListener.applyUserProperties` 等接口，裸 iframe 里都不存在。只在属性回调里设置背景图的壁纸（如 Nikke 系列）就只剩角色立在纯黑底上——这正是「像竖屏壁纸」的观感。WE API 0.2.6 现在给 HTML 文档注入一层兼容垫片：读取 `project.json` 的默认属性调用 `applyUserProperties`（时序对齐 WE，在 `load` 之后调用，超大页面 2 秒兜底，抛错自动重试）、提供音频 / 媒体接口占位，并用 canvas 像素 / `img` / `video` / 元素背景采样判断「确实画出内容」后 `postMessage` 上报，插件收到即叠化。
  - **按 `file://` 写的相对路径在 HTTP 下失效**：部分壁纸写的是 `location.protocol === 'file:' ? … : '../assets/…'`，浏览器会先把 `../` 折叠掉，请求变成 `/files/assets/…`（首段不是壁纸 ID）而被 400 拒绝，8K 模型加载失败即黑屏（实测 Blue Archive 系列 85% 纯黑）。WE API 现在用 `Referer` 里的壁纸 ID 兜底解析这类请求，路径仍严格限制在该壁纸目录内。
- **网页壁纸资源反复重下、切换卡顿**：WE API 的 `/files` 路由原来用 `readFileSync` 整读文件（每个请求都阻塞事件循环，上百 MB 的网页壁纸尤其明显）且返回 `Cache-Control: no-store`（每次切换全部重下）。现在改为流式发送 + `ETag` / `Last-Modified` 条件请求（HTML `no-cache` 每次校验、静态资源 300 秒缓存）并支持 `Range`。

### 变更

- 插件 0.3.8 建议搭配 **WE API 服务 0.2.6**：升级后双击 `wallpaper-engine-api/重启服务(管理员).bat`，`http://127.0.0.1:8088/health` 应出现 `"webShim": 1`。未升级时网页壁纸仍能显示，但会退回「`load` + 500ms 叠化」，也没有属性垫片与 `../` 路径兜底。

## [0.3.7] - 2026-08-20

### 修复

- **4K 视频壁纸把整机拖慢（帧率腰斩）**：两处叠加的开销，实测 4K 壁纸只有 22–27fps，现在稳定 57–60fps。
  - **视频层改用合成器渲染**：原先把视频每帧 `drawImage` 到视口大小的 canvas 上做缩放，1080p 尚可（约 2ms/帧），但 4K 视频取一帧本身就 **20–40ms**（与目标尺寸无关，缩到 64×36 也一样贵），帧率被压到 24–28fps。现在视频层直接用 `<video object-fit: cover>` 铺满，缩放 / 裁剪交给合成器（GPU）完成，**每帧零 JS 开销**；同时不再需要 30fps 的抽帧定时器与 `resize` 重绘。
  - **恒等滤镜会禁用 GPU 合成**：`filter: blur(0px) brightness(100%)` 看起来是「无操作」，实际会让整个背景层无法走 GPU 合成——单独这一项就把 4K 视频从 60fps 压到 **22fps**（`filter: none` 为 60fps）。现在只在真的需要模糊 / 调亮度时才挂 `filter`，默认值下完全不设置。
- **白场探测不再每帧执行**：原先视频显示后的前 12 秒会**每帧**对全屏 canvas 做 `getImageData` 判白（4K 下约 5.9ms/帧）。现在只在「首次加载、没有预热结果」时**采样一帧**判断，只有首帧确实是白场才继续找正片起点（队列切换走预热阶段，零额外开销）。
- **切到视频壁纸后画面静止不动**：改用合成器渲染时，预热复用的 `<video>` 处于暂停状态（预热只缓冲数据、不起播），漏掉了显式 `play()`；另外跳过白场片头的 seek 也会暂停播放。现在 seek 完成后统一起播，两条路径都不会停在首帧。

### 性能实测（1920×1080 视口，4K 视频壁纸，连续采样 24 秒）

| 场景 | 修复前 | 修复后 |
|---|---|---|
| 4K 视频壁纸稳定播放 | 22–27 fps | **57–60 fps** |
| 4K 视频每秒长帧（>33ms） | 68–72 | 3–9 |
| 队列循环（4K + 1080p 视频 + 场景 + 网页） | — | 场景 / 图片 60fps，网页取决于第三方内容 |

其他类型壁纸本身没有性能问题（静态图、场景预览在 60fps，加模糊 / 放大也不掉帧）；网页壁纸的开销完全来自第三方 `index.html` 内容（裸 iframe 对照同为 28fps），插件侧零额外开销。

## [0.3.6] - 2026-08-20

### 修复

- **循环列表每切一次壁纸就卡一点，越切越卡**：视频壁纸的图层清理函数被 `crossfade()` 覆盖成了 `null`（视频路径是「先 `layers.set(layer, dispose)` 注册清理、再调用 `crossfade()`」，而 `crossfade()` 里那句占位用的 `layers.set(layer, null)` 正好把它冲掉），于是旧图层淡出时拿不到 `dispose`——旧视频的 `pause()` 与媒体资源释放**从未执行**。这些 `<video>` 元素从不进入 DOM，分离后浏览器仍会继续解码，因此每切一张就多留一路后台解码 + 一个 30fps 抽帧定时器。
  - 实测（三张 4K 视频队列，连续切换 6 次）：修复前抽帧定时器 `2→8` 个、同时播放的视频 `1→7` 个，帧率 **59.7 → 12.2 fps**；修复后定时器恒为 `2` 个、始终只有 `1` 个视频在播，帧率稳定在 **58–60 fps**。
- **图层清理现在有双重兜底**：旧图层淡出时既执行注册的 `dispose`，也会扫描层内 `<video>` 统一 `releaseVideo()`（暂停 + 断开 `src`），即使将来某条渲染路径漏注册也不会再留下后台解码。

## [0.3.5] - 2026-08-20

### 修复

- **视频壁纸切过去先看到几秒白屏**：部分壁纸视频**本身**开头就是一段纯白片头（实测《明日方舟》「喧闹法则」前 2 秒整帧纯白、Hatsune Miku 开头 1 秒也几乎全白），切换过去就会看到一大片白。现在预热阶段会顺手探测「正片起点」：从 0 秒开始逐点采样，找到第一帧不是白场的时间点（该视频为 2.4s / 1.2s），切换时直接从那一点开始播，白场片头不再出现在画面里；探测只在队列停留期做一次并缓存，不会每帧跑。
- **切换到 MIKU 时旧壁纸停留五六秒**：队列推进前常会先触发一次无关的状态更新，而 `applyNow()` 开头会清空预热结果——预热好的下一张（连已缓冲的 `<video>` 元素）被提前丢弃，于是又退化成从零加载，白白多等几秒。现在预热结果只在自己被真正用掉、或确认不是这一次要显示的那张时才作废；实测切换从「5 秒后才出现新层」变为 **67ms 出现、约 0.4 秒完成叠化**。
- **视频层首次显示可能露出空白画布**：视频的 `loadeddata` 早于「帧真的能画出来」，此前会先把空 canvas 淡入（大文件表现为白屏）。现在必须等首帧真正画上 canvas 才开始叠化。

## [0.3.4] - 2026-08-20

### 修复

- **切换壁纸闪黑屏**：队列循环切图（以及手动点选换壁纸）时，旧壁纸会先被清空、新壁纸才开始加载，中间有一小段没有画面的空窗，看起来就是闪一下黑屏（大图 / 视频、尤其网络壁纸更明显）。现在改为**双层交叉淡入淡出**：
  - 新壁纸在**自己的图层**里先就绪再显示——图片预加载并 `decode()` 完成，视频等 `loadeddata` 且首帧已画上 canvas，场景 / 网页等 iframe `load` 后再留 180ms 让首帧落定；
  - 就绪后新旧两层叠化约 **0.42 秒**（`opacity` 过渡），旧层淡出结束才从 DOM 移除，因此**切换全程每一帧都有画面**，不再闪黑；
  - 图片 / 视频 / 场景 / 网页四种渲染、队列循环与手动点选、桌面壁纸同步全部走同一条切换路径；
  - 异步就绪带序号校验：连续快速切换时，晚就绪的旧壁纸不会再抢镜；组件卸载会停掉视频抽帧、释放 objectURL 并清理所有图层。

### 新增

- **下一张预热（让叠化几乎立刻开始）**：队列循环播放时，停留期间就提前把**下一张**壁纸准备好，切换那一刻不再干等下载 / 解码：
  - 停留期开始先「拉取」预热——网络图片（内置 / WE 图片）提前下载并解码，WE 视频提前把数据取进浏览器缓存；
  - **切换前 30 秒**再预热一次——自定义上传提前读 IndexedDB 并建好 `objectURL`，切换时直接复用，省掉读库 + 建 URL 的等待；
  - 实测：自定义队列切换从「点下去约 2.5 秒后才有画面」变为 **107ms 就开始叠化**，整段过渡约 0.4 秒；
  - 预热只针对队列的下一张、同一时刻只保留一条预取结果，切换 / 停止 / 卸载时立即作废并释放 `objectURL`，不累积内存。

## [0.3.3] - 2026-08-20

### 修复

- **自定义上传视频黑屏 / 无预览**：
  - **黑屏播放**：部分视频文件（如 .mkv / .mov）浏览器 `file.type` 为空，导致插件把视频当图片渲染（背景一片黑）。现在按 mime 判断失败时会再按扩展名兜底识别，空类型视频也会走视频渲染；
  - **黑色占位**：视频卡片原本只显示深色字母占位。现在上传列表与队列会自动生成**视频首帧缩略图**（canvas 抽帧、最长边 320px、内存缓存、并发 3 张、失败不重试），视频也能看到画面预览。

## [0.3.2] - 2026-08-20

### 变更

- **自定义上传队列同样吸顶**：与 WE 壁纸库一致，「自定义上传」页签的播放队列移到网格上方并吸顶（毛玻璃背景），上传多了也能随时把任意一张拖入队列。

## [0.3.1] - 2026-08-20

### 修复

- **WE 壁纸库长列表拖不到队列**：WE 库壁纸很多时，队列原本在网格下方，顶部壁纸要跨越整个网格才能拖到队列（拖拽过程中页面不会自动滚动，基本拖不到）。现在 WE 队列移到网格**上方**并**吸顶**（`position: sticky`，毛玻璃背景）——浏览网格任意位置时队列都固定在面板顶部，任何一张壁纸只需短距离拖拽即可入队。

## [0.3.0] - 2026-08-20

### 新增

- **WE 壁纸库播放队列**：与自定义上传队列同等的完整队列能力——把 WE 库里的壁纸（视频 / 场景 / 网页 / 图片均可）拖入队列循环播放，支持拖拽排序、点选跳播、× 移除、清空，队列内容与开关持久化到 localStorage。视频 / 场景 / 网页在队列中按既有渲染方式循环，每张停留「每张时长」（1–10 分钟，与自定义队列共用）后自动切换。两个来源的队列相互独立、互不干扰；点击任一来源的单张壁纸或开启「同步桌面壁纸」即退出对应队列循环。

## [0.2.9] - 2026-08-20

### 变更

- **WE 壁纸库分级默认「非18+」**：每次点击「WE 壁纸库」页签进入时，分级筛选自动重置为「非18+」（面板打开时若当前就在 WE 来源也同样默认非18+），避免一进库就看到 18+ 内容；类型筛选与用户手动选择保持不变。

## [0.2.8] - 2026-08-20

### 变更

- **来源切换不再切换背景**：顶部「内置壁纸 / 自定义上传 / WE 壁纸库」按钮现在只切换设置面板的视图（网格 / 筛选 / 队列），**背景壁纸保持不动**——只有点击某张壁纸、操作播放队列（入队 / 跳播 / 开循环）、或开启「同步桌面壁纸」时才会真正应用对应来源。浏览其他来源时，正在播放的队列 / 背景不受打扰；「恢复默认」仍会回到内置壁纸并同步页签。

## [0.2.7] - 2026-08-20

### 新增

- **队列支持视频壁纸**：播放队列不再局限于图片，上方已上传的视频同样可拖入队列（队列项显示 ▶ 占位）；轮到视频时按既有 canvas 渲染循环播放，停留「每张时长」设定时间后自动切到下一张。
- **队列内拖拽排序**：拖住队列项左右移动，松开时按落点插入（鼠标在目标项左半 → 插到它前面，右半 → 后面，空白处 → 末尾）；拖拽过程显示品牌色插入指示条，排序后当前正在播放的那一张保持不跳变。队列顺序持久化到 localStorage。

## [0.2.6] - 2026-08-20

### 新增

- **自定义上传播放队列**：自定义上传来源下新增「播放队列」区块——把上方已上传的**图片**壁纸拖入队列（仅图片，视频壁纸仍单张点选），支持按顺序**循环播放**；「每张时长」滑杆控制每张壁纸停留 1–10 分钟（默认 5 分钟），点队列项可直接跳播、× 移除单张、清空一键重置。队列内容、开关、时长与当前播放下标全部持久化到 localStorage，刷新后保留；删除上传图片时自动从队列移除并修正播放位置。点击上方任意单张壁纸即退出队列循环，恢复单张播放。

## [0.2.5] - 2026-08-20

### 修复

- **WE API 开机自启失效**：旧版 `设置开机自启.bat` 把 `启动服务-静默.vbs` 复制到启动文件夹，但 VBS 按自身所在目录启动 `node server.js`——副本位于启动文件夹，找不到 `server.js`，每次登录都会静默失败（`we-api.log` 记录 `MODULE_NOT_FOUND`）。现改为把 `"wscript.exe" "…\启动服务-静默.vbs"` 注册到注册表 `HKCU\...\Run`，直接引用原目录脚本，登录即可正常启动；`取消开机自启.bat` 删除注册项并兼容清理旧版启动文件夹副本。两个脚本统一为 UTF-8（带 BOM）编码。

## [0.2.5] - 2026-08-16

### 变更

- WE 壁纸库类型筛选移除「图片」分类：WE 创意工坊没有图片类型壁纸（实测库内 208 张全部为 视频 / 场景 / 网页），空分类只会占位。渲染层仍保留对 image 类型的兜底兼容，不影响任何现有壁纸。
- README 全面重写：新增开篇功能概览、分步安装指引（含前提条件、三种安装方式、WE 服务组件与验证方法）与真实界面截图（`docs/screenshots/`，npm 包已纳入截图文件）。
- 注：WE API 服务本轮无改动，版本号仍为 0.2.4，无需重启该服务。

## [0.2.4] - 2026-08-16

### 新增

- **Web 类壁纸浏览器原生渲染**：web 类型壁纸本身就是 HTML/JS 网页，现在插件用 iframe 全屏原生渲染其 `index.html`（此前被误归为 scene 只能看静态预览）。WE API 新增只读目录文件路由 `/files/<id>/<相对路径>`（路径越界保护 + 仅限订阅清单内的壁纸目录），供 iframe 加载相对资源；设置面板类型筛选新增「网页」按钮，卡片新增「网页」角标。
- **场景缩略图优先取动画 preview.gif**：列表与全屏展示优先用 `preview.gif`（存在时），没有才退回 `preview.jpg`，更多场景能在浏览器里动起来。

### 变更

- WE API：`/health` 新增 `version` 字段（0.2.4），列表条目新增 `entry`（project.json 的入口文件相对路径）；订阅清单读取加 30 秒缓存。
- 文档：常见问题新增「场景录成 MP4 上传」的高保真方案与 Web 壁纸渲染说明。

## [0.2.3] - 2026-08-16

### 新增

- **浅色外观白色雾层**：浅色主题下 DSH 的细字直接压在壁纸上不够清晰。现在遮罩层随主题自动切换——深色外观沿用黑色压暗遮罩，浅色外观改为半透明白色雾层（类侧边栏雾感），垫在背景与内容之间提升可读性。设置面板新增「浅色雾层」滑杆（默认 55%），原「遮罩透明度」更名「深色遮罩」，两档强度独立记忆，跟随 `body[data-ds-dark-theme]` 实时切换（含加载时同步读取，无闪烁）。

## [0.2.2] - 2026-08-16

### 修复

- **在 WE 里删掉（退订）的壁纸仍然出现在插件列表里**：退订后 Steam 会立刻把条目从订阅清单移除，但 workshop 目录下的文件夹删除可能被延迟（文件被占用等），旧版按文件夹列目录就会把残留壁纸列出来。现在 WE API 按 Steam 真实订阅清单（`userdata/<id>/ugc/431960_subscriptions.vdf`）过滤，退订 / 本地禁用的壁纸不再出现，与 WE 界面一致；清单读不到时退化为不过滤。列表响应新增 `hiddenUnsubscribed` 计数，`/health` 显示所用清单路径。
- 宿主的「刷新」现在把 `refresh` 透传给 WE API，绕过下游 60 秒缓存，删掉壁纸后立刻可见。

### 新增

- `wallpaper-engine-api/重启服务(管理员).bat`：一键结束并静默重启 WE API 服务（自动请求管理员权限——旧服务若以高权限启动，普通权限杀不掉），并等待端口就绪。

## [0.2.1] - 2026-08-13

### 修复

- **深色外观下选中按钮文字消失**：来源切换按钮与筛选胶囊的激活态之前用固定 `#fff` 文字色；而 DSH 深色主题的品牌主色是近白色（`--dsw-alias-brand-primary` → bluish-50），导致白底白字。现在激活态文字改用配套的 `--dsw-alias-label-primary-inverted`（深色主题下为深色文字），深浅两种外观都保持清晰对比度。

## [0.2.0] - 2026-08-13

### 新增

- **WE 壁纸库筛选**：
  - 类型筛选按钮（全部 / 视频 / 场景 / 图片），按壁纸真实类型过滤；
  - 分级筛选按钮（全部 / 非18+ / 18+），基于 WE project.json 的 `contentrating`（18+ = Mature + Questionable，非18+ = Everyone / 未标注）；
  - 筛选面板实时显示「共 N · 筛选出 M」计数；筛选结果为空时给出提示；
  - 18+ 壁纸卡片左上角显示红色「18+」角标。
- WE API 服务：列表条目新增 `rating` 字段，`type` 统一小写并补全视频/图片扩展名推断。

### 变更

- 版本号跳至 0.2.0（新增功能）；宿主 /health 同步返回新版本号。

## [0.1.1] - 2026-08-13

### 修复

- **卸载后补丁层变成空文件、`dsh web` 启动失败**：移除插件行后若 `cordis.patch.yml` 只剩注释/空白（YAML 解析为 null，而 DSH 要求该文件要么不存在、要么是顶层数组），CLI 现在自动恢复为带 `[]` 的模板内容；对已损坏的空/仅注释文件同样自愈
- 目标 profile 还没有 `cordis.patch.yml` 时，`install` 现在会先按 DSH 自带模板创建该文件再写入插件行（此前会报「找不到补丁层」）

## [0.1.0] - 2026-08-13

首个正式版：由动态插件形态重构为可常驻的 DSH 静态双半插件包。

### 新增

- 静态双半包结构：宿主半 `lib/host.js` + 浏览器半 `lib/client.js`（单文件 bundle，零构建）
- **`dsh-wallpaper-bg` CLI**：`install`（默认写入 profile 补丁层 `cordis.patch.yml`——启动即生效、热重载，无需会话/预设/重启；`--preset` 切按会话模式）、`status`、`uninstall`
- **`dsh.bundle` 组合层**（`cordis.patch.yml`）：`dsh plugin --profile web add` 安装后作为 profile 层激活，首次加载页面即带背景
- 宿主路由：`/dsh-wallpaper-bg/health`、`/dsh-wallpaper-bg/we`（WE API 只读代理，5 分钟列表 / 10 秒当前壁纸缓存）、`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 Range，大视频不再整读内存）
- 三种壁纸来源：内置 10 张 Unsplash / 自定义上传（IndexedDB）/ WE 壁纸库（只读）
- 三种渲染：图片、视频（canvas + 30 FPS 上限 + cover 裁剪无黑边）、场景（官方预览图回退，GIF 保持动画）
- 四项调节：遮罩透明度、背景模糊度、背景亮度、安全放大（0–10% 裁边）
- 同步桌面壁纸开关（只读，30 秒轮询）
- 界面表面半透明化（主题 token 覆写，随 fiber 卸载自动恢复）
- 设置持久化（localStorage），并自动迁移旧端口 8080 → 8088
- `wallpaper-engine-api/` 本机只读服务（静默启动 + 开机自启脚本）

### 变更

- 安装方式：默认 `dsh-wallpaper-bg install` 写入 profile 补丁层（host 平面常驻、启动即生效）；官方 `dsh plugin --profile web add`（发布后）或 `--preset` 按会话模式作为可选
- 动态插件时代源码归档至 `legacy/`

### 修复

- 预设行下宿主半的服务与配置取法（与标准行 tool-pwsh/tool-web 一致）：宿主服务硬注入 `inject: ['webServer']`（standing scope 下 `ctx.get` 取不到）；行配置走 `apply(ctx, config)` 第二参数（`ctx.config` 的 `'config'` 注入在 standing mount 下不会兑现，挂载报 "waiting for config"）
- 安装位置误判：profile 启动的部署锚点是 `%USERPROFILE%\.dsh\profiles\web`（全局 npm 根不在其解析链上）
- 视频窗口化时右侧/底部黑边（画布位图拉伸 → 视口像素一一对应 + cover 源裁剪）
- 场景壁纸 `filepath` 缺失时无法回退缩略图
