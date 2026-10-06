# dsh-wallpaper-bg 故障排查手册

> 适用版本：插件 **0.5.11**（宿主半 `/dsh-wallpaper-bg/health` 里的 `version`）、可选服务 WE API **0.5.1**（`http://127.0.0.1:8088/health` 里的 `version`）。
> 本文只回答一个问题：**出状况时按什么顺序查、每一步对应什么动作**。功能说明与安装步骤见 [`README.zh.md`](../README.zh.md)（英文版 [`README.md`](../README.md)），逐版变更见 [`CHANGELOG.md`](../CHANGELOG.md)。

插件分两半，出问题时先分清是哪一半：

| 半边 | 加载方式 | 改完怎么生效 | 出问题的典型表现 |
| --- | --- | --- | --- |
| 宿主半（`lib/host.js`，Node 侧） | 随 DSH 进程启动加载一次 | **必须重启 DSH** | `/dsh-wallpaper-bg/health` 打不开；面板里所有壁纸都加载不出来 |
| 浏览器半（`lib/client.js`） | 每次请求从磁盘现读 | 普通刷新页面（F5） | 面板能打开、宿主接口正常，但界面行为不对 |
| WE API 服务（`wallpaper-engine-api/`，独立 Node 进程） | 自己启动，**不在 DSH 进程里** | 重启该服务 | 只有「WE 壁纸库」页签不行，内置壁纸与自定义上传照常 |

---

## 0. 先做这三件事

三条检查覆盖绝大多数情况，做完基本就能定位到下面哪一节。

| # | 检查 | 怎么做 | 正常应该看到 |
| --- | --- | --- | --- |
| 1 | 插件宿主半是否挂上 | 浏览器打开 `http://127.0.0.1:19387/dsh-wallpaper-bg/health`（桌面端固定 19387）；`dsh web` 默认换 **3080** | `{"ok":true,"plugin":"dsh-wallpaper-bg","version":"0.5.11","monitorForward":1}` |
| 2 | WE API 服务是否在跑（只影响 WE 壁纸库） | `http://127.0.0.1:8088/health` | `{"ok":true,"service":"we-api-proxy","version":"0.5.1","webShim":1,"monitorSelect":1,…}` |
| 3 | profile 是否真把它当组合层加载 | 仓库里 `node .\bin\dsh-wallpaper-bg.js status`（或用 `npx dsh-wallpaper-bg status`） | 出现 `installed（bundle 层，随 DSH 启动加载）` |

判定方向：

- **设置里没有「壁纸」面板** → 第 1、3 条不会同时正常，看 [§2.1](#21-装完了但设置--壁纸里没有面板) / [§2.2](#22-整个-profile-起不来1-entry-did-not-activate)。
- **面板在、内置壁纸也不显示** → 宿主半或页面加载问题，看 [§3.1](#31-面板能打开但换哪张壁纸都没有反应)。
- **只有「WE 壁纸库」页签报错** → 服务和插件无关，直接看 [§4](#4-we-壁纸库可选服务)。
- **界面文字看不清 / 想要壁纸完全露出来** → 这是调节项，不是故障，看 [§3.2](#32-页面文字看不清或想完全露出壁纸)。

---

## 1. 症状索引

| 你看到的现象 | 最可能的原因 | 去哪一节 |
| --- | --- | --- |
| 装完了，设置里找不到「壁纸」 | profile 的 `dsh.profile.bundles` 没回填 | [§2.1](#21-装完了但设置--壁纸里没有面板) |
| DSH 整个起不来，报 `1 entry did not activate` | 装进了没有 Web 服务的 profile（旧版插件） | [§2.2](#22-整个-profile-起不来1-entry-did-not-activate) |
| 装的版本比 npm 上的旧 | pnpm 11 的 24 小时 `minimumReleaseAge` | [§2.3](#23-版本比-npm-上的旧--重复-add-不升级) |
| 本地 `link:` 装完 profile 直接加载失败 | 仓库路径带空格被拆成两个假依赖 | [§2.4](#24-link-安装路径带空格) |
| `profile "desktop" is managed exclusively…` | 终端不能启动 desktop profile（预期） | [§2.5](#25-desktop-profile-被桌面端独占报错) |
| 换端口 / 换地址后设置和上传的壁纸都没了 | 页面 origin 变了，localStorage / IndexedDB 不通用 | [§2.7](#27-换了端口或地址之后设置--上传的壁纸全没了) |
| 内置壁纸一张都不显示 | 内置壁纸走 Unsplash 远程图片，需要联网 | [§3.1](#31-面板能打开但换哪张壁纸都没有反应) |
| 上传完壁纸没出现，也没报错 | IndexedDB 写入被静默拒绝（无痕窗口 / 站点数据被禁 / 空间不足） | [§3.6](#36-上传之后网格里没有新壁纸也没有任何报错) |
| 页面细字看不清 / 想完整看壁纸 | 雾层、遮罩、表面半透明层 | [§3.2](#32-页面文字看不清或想完全露出壁纸) |
| 切换壁纸时闪一下黑屏 | 0.5.9 及更早：队列切视频时的缺陷（0.5.10 已修） | [§3.3](#33-切换壁纸时闪黑) |
| 视频四周有黑边 | 视频自带 letterbox，用「安全放大」裁掉 | [§3.4](#34-视频四周有黑边) |
| 上传的视频显示为黑块 | 浏览器不认这个编码 | [§3.5](#35-上传的视频显示为黑块--黑屏) |
| 放一会儿就掉帧 / 风扇起飞 | 4K 视频 + 模糊滤镜 | [§3.7](#37-掉帧卡顿风扇变响) |
| 网页壁纸黑屏、半天不出画面 | 服务过旧（缺 `webShim` 垫片） | [§3.8](#38-网页壁纸黑屏或很久不出画面) |
| 网页壁纸点不动、音频可视化没声音 | 设计如此：背景层不拦鼠标，浏览器里没有 WE 音频采集 | [§3.9](#39-网页壁纸点不动音频可视化没声音) |
| 场景壁纸放大后发虚、看着不像动态 | WE 工坊预览图本身只有 192×192 | [§3.10](#310-场景壁纸发虚看着不像动态的) |
| macOS 上装上插件后 DSH 窗口拖不动 | 0.5.9 已修的老问题 | [§3.11](#311-macos-桌面端窗口拖不动双击不放大) |
| WE 页签「连不上 WE API 服务」 | 服务没在跑 / 没装 / 端口不一致 | [§4.1](#41-we-页签连不上服务) |
| 列表还在，但和服务上的对不上 | 服务断过，列表是上次缓存，横幅会提示 | [§4.2](#42-列表还在但可能已过期) |
| 退出 DSH 再进来服务就没了 | 服务是从 DSH 客户端内部启动的 | [§4.3](#43-退出-dsh-客户端服务就没了) |
| 双击启动脚本「什么都没发生」 | 跑到了没有向导的静默启动脚本 | [§4.4](#44-双击启动脚本什么都没发生) |
| `[ERROR] Node.js not found in PATH.` | 服务是独立 Node 进程，需要系统里的 Node | [§4.5](#45-error-nodejs-not-found-in-path) |
| 服务找不到 Wallpaper Engine | WE 装在第二个 Steam 库，自动探测不到 | [§4.6](#46-服务找不到-wallpaper-engine) |
| `npm install` 报 `EALLOWREMOTE` 或一直卡住 | npm 12+ 默认 `allow-remote=none`，锁文件指向镜像 | [§4.7](#47-npm-install-报-eallowremote-或一直卡住) |
| 服务起不来 / 8088 被占用 | 端口冲突，或改端口只改了服务 | [§4.8](#48-8088-端口被占用--换端口) |
| 服务里的壁纸和 WE 里不一致 | 服务过旧；**重启不等于升级** | [§4.9](#49-重启不等于升级) |
| WE 里退订 / 删掉的壁纸还在 | 服务过旧或没刷新 | [§4.10](#410-we-里删掉的壁纸还在) |
| 重启电脑后服务不自启 | 自启项没设，或被任务管理器置为「已禁用」 | [§4.11](#411-开机自启不生效) |
| 「同步桌面壁纸」跟的不是我正在看的那台 | 多显示器判定，需服务 0.5.1 + 重启 DSH | [§4.12](#412-同步桌面壁纸显示的不是桌面上那张) |
| 改了 `lib/client.js` 刷新没变化 | 改宿主半 / 插件行变化才需要重启 | [§5.1](#51-改了代码不生效) |
| `.bat` 刷出一片 `'...' is not recognized` | 行尾被检出成 LF，cmd 按字节偏移解析 | [§5.3](#53-bat-刷出一片--is-not-recognized) |

---

## 2. 安装与加载

### 2.1 装完了，但设置 → 壁纸里没有面板

DSH 只在把插件记进 profile 的 **组合层列表** 时才加载它；依赖装上了、列表里没写，插件就不会被激活——表现正是「装完了但没有面板」。

1. 先跑状态检查，看它属于哪种：

   ```powershell
   node .\bin\dsh-wallpaper-bg.js status     # 仓库内
   # 或 npx dsh-wallpaper-bg status
   ```

   - `installed（bundle 层，随 DSH 启动加载）` —— 这一侧正常，问题在别处（看第 3 步）。
   - `installed（依赖已装，但 dsh.profile.bundles 里没有 dsh-wallpaper-bg → 不会被加载；重跑一次 dsh plugin --profile <profile> add dsh-wallpaper-bg 即可补上）` —— 就是本节的情况。
   - `package resolution: NOT RESOLVABLE` —— 从 profile 锚点用 ESM 探测不到本包（探测本身有 15 秒超时，**超时与真解析失败显示不出区别**）。重跑安装 / `install-local.ps1` 重建链接，并确认 `DSH_HOME` 指向的正是当前部署。
   - `patch layer <路径>: absent` 也可能是**补丁层文件读不出来**（CLI 不区分「没有」与「读失败」）；此时手动看一眼该文件。
   - 注意：`status` **无论结果如何都以退出码 0 结束**，不要用退出码判断是否装好。

2. 重跑一次安装命令把列表补上（**带上版本号**，否则可能装到旧版，见 [§2.3](#23-版本比-npm-上的旧--重复-add-不升级)）：

   ```bash
   dsh plugin --profile web add dsh-wallpaper-bg@0.5.11     # 网页版 / 命令行
   dsh plugin --profile desktop add dsh-wallpaper-bg@0.5.11 # 桌面端（等价于插件页面里重装）
   ```

   也可以直接检查 `%DSH_HOME%\profiles\<profile>\package.json`（`DSH_HOME` 默认 `C:\Users\<你>\.dsh`）里 `dsh.profile.bundles` 数组是否含 `dsh-wallpaper-bg`。

3. 列表里已经有了、还是没有面板：确认宿主半（[§0](#0-先做这三件事) 第 1 条）能返回 JSON，然后**重启 DSH**——插件集合在 DSH 启动时组合，改完列表不重启不生效。

### 2.2 整个 profile 起不来：`1 entry did not activate`

完整报错类似：

```
plugin tree failed to load: dsh: 1 entry did not activate
dsh-wallpaper-bg: waiting for service: webServer
```

这是 **0.5.3 之前的宿主半**用硬门控等 `webServer` 服务造成的：在没有 Web 服务的 profile（`headless` / `tui` / 自建 profile，以及终端里新建出来的 desktop profile）里，这一行插件永远停在 pending，DSH 就不启动了。

**解决办法：升级插件**（0.5.3 起改成按需注入：没有 `webServer` 时插件照常激活、什么都不注册）。

如果暂时不能升级，把插件从这个 profile 里移除即可恢复启动：

```bash
dsh plugin --profile <profile> remove dsh-wallpaper-bg
```

### 2.3 版本比 npm 上的旧 / 重复 `add` 不升级

两个独立的原因，别混在一起：

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 重复跑 `dsh plugin … add dsh-wallpaper-bg` 版本纹丝不动 | `add` 转发给 `pnpm add`，pnpm 保留清单里已有的版本范围（停在 `^0.4.1` 就永远是 0.4.x） | 显式写版本或 `@latest`：`… add dsh-wallpaper-bg@latest` / `… add dsh-wallpaper-bg@0.5.11` |
| `@latest` 也装到上一个版本，命令还提示 `(0.5.11 is available)` | pnpm 11 默认 24 小时 `minimumReleaseAge`（供应链保护）：发布未满一天的版本会被跳过 | 三选一：写死版本号；加 `--config.minimumReleaseAge=0`；在 profile 的 `pnpm-workspace.yaml` 里写 `minimumReleaseAgeExclude: [dsh-wallpaper-bg]` |

桌面端的「设置 → 插件」页面走的是同一个 pnpm，所以刚发布的版本同样要等约一天才会出现在那里。

装完想知道现在跑的是哪一版：看 `/dsh-wallpaper-bg/health` 的 `version`（宿主半随进程加载，改完必须重启 DSH 才会变）。

### 2.4 `link:` 安装：路径带空格

`dsh plugin` 是经 shell 转发给 pnpm 的，仓库路径带空格时 spec 会被拆成两个假依赖：

```bash
dsh plugin --profile web add link:E:/My Dir/dsh-wallpaper-bg
# 实际变成 link:E:/My 与 link:Dir/dsh-wallpaper-bg → profile 随后加载失败
```

解决：把仓库放到**无空格路径**，或用仓库自带的安装器（它链接到 `%DSH_HOME%\node_modules`，全程无空格）：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-local.ps1
# 等价于 node .\bin\dsh-wallpaper-bg.js install
```

被拆坏的 profile 需要先把那两个假依赖删掉再重装。

仓库自带的安装器在链接位置被别的东西占用时会明确报错而不是硬覆盖：

```
ERROR: 目标位置已有非本工具内容（foreign:<目标>|plain-dir|broken），请手动处理 <路径>
ERROR: 链接已创建但仍无法从锚点解析，请检查 DSH_HOME 与 profiles 目录
```

按提示手动清掉 `%DSH_HOME%\node_modules\dsh-wallpaper-bg` 再重跑即可；卸载时若发现链接不是自己建的，它只会 `WARN: 链接不属于本工具（…），不动它`——需要你自己判断要不要删。

### 2.5 `desktop` profile 被桌面端独占（报错）

```
profile "desktop" is managed exclusively by the Electron application
```

**这是预期行为，不是故障。** desktop profile 由 Electron 应用自己组合并启动，终端无法启动它。安装 / 卸载请走：

- 桌面端：**设置 → 插件** 里输入 `dsh-wallpaper-bg` 安装 / 停用 / 卸载；
- 终端只改包清单的操作仍然可用：`dsh plugin --profile desktop add dsh-wallpaper-bg`。

仓库自带的 `dsh-wallpaper-bg install` 因此会**跳过** desktop profile 并提示走插件页面，这是设计如此（避免重复挂载）。

### 2.6 装进 `headless` / `tui` / 自建 profile

可以装，也不会再弄坏启动（0.5.3+），但**没有任何作用**：插件只在宿主的 `webServer` 服务存在时才注册路由，没有 Web 界面的 profile 里它静默不生效。

壁纸界面在浏览器页面里，请装进 `web`，或桌面端的 `desktop` profile。

### 2.7 换了端口或地址之后，设置 / 上传的壁纸全没了

插件把设置存在 **localStorage**、把自定义上传存在 **IndexedDB**，两者都绑定**页面 origin**（协议 + 主机 + 端口）。origin 一变，浏览器就当成另一个站点，旧数据还在但读不到——表现就是「设置被重置、上传的壁纸全不见了」。

- 桌面端固定用 **19387** 跑 desktop profile，origin 稳定，重启应用数据都在；
- `dsh web` 如果改了 `--port`、换了主机名（`127.0.0.1` ↔ `localhost` 也算不同 origin）、或从浏览器换到了桌面端，就会看到这个现象。

想找回数据：换回原来的地址（例如 `http://127.0.0.1:3080`）；确认不是被浏览器清理了站点数据（见 [§3.6](#36-上传之后网格里没有新壁纸也没有任何报错)）。

### 2.8 停用 / 卸载插件

| 部署方式 | 停用 | 卸载 |
| --- | --- | --- |
| 桌面端 | 设置 → 插件 → 关掉开关（需重启应用） | 设置 → 插件 → 卸载 |
| `dsh web` / 命令行 | 删除 profile 补丁层里的插件行，或 `dsh plugin --profile web remove dsh-wallpaper-bg` | 同左，外加清理 `%DSH_HOME%\node_modules` 下的链接（`install-local.ps1` 装的那种） |

卸载后页面上的背景层与面板会一起消失；桌面壁纸自始至终不受影响（插件不写桌面壁纸）。

### 2.9 CLI（`dsh-wallpaper-bg`）输出怎么读

`install` / `uninstall` 的常见行：

| 输出 | 含义 | 处理 |
| --- | --- | --- |
| `[patch] created template layer at <路径>` | 顺手创建了模板补丁层 | 正常 |
| `[patch] installed into <路径>` / `already installed in <路径>` | 已写入 / 早已写入（幂等） | 正常 |
| `[skip] desktop: Electron 桌面端独占管理该 profile…` | 按设计跳过 desktop（不算失败，退出码 0） | 桌面端走「设置 → 插件」 |
| `[skip] <profile>: 已作为插件包安装（package.json 的 dsh.profile.bundles 里已有 dsh-wallpaper-bg）…` | 该 profile 已由 bundle 层加载，无需再写用户补丁层 | 正常；卸载请用 `dsh plugin --profile <name> remove …` |
| `[patch] removed from <路径>（已恢复为模板 []，避免空补丁层导致 dsh 启动失败）` | 卸载时把补丁层还原成模板 | 正常 |
| `ERROR: 找不到 profiles/*/cordis.patch.yml；本部署可能没有 profile 补丁层，请改用 --preset 模式` | 这套部署没有 profile 补丁层 | 用 `install --preset`，或直接用 `dsh plugin … add` |
| `ERROR: 没有 profiles/<x>/cordis.patch.yml（可用 profile：…）` | `--profile` 名字不存在 | 先看 `status` 里列出的 profile |
| `unknown command: <cmd>（可用：install / status / uninstall / help）` | 子命令写错 | 见 `dsh-wallpaper-bg help` |

两个容易踩的坑：

- **未知参数会被静默忽略**（只认 `--id` / `--name` / `--we-base` / `--profile` / `--preset`）：把 `--we-base` 拼错时命令照常成功，但地址没改到。
- **有些 `ERROR:` 行不会影响退出码**：卸载路径下的 `ERROR: cannot read/write <路径>`、以及默认安装在没有跳过项时的失败，可能表现为「打印了错误但退出码是 0」或「退出码 1 却没有任何提示」。判断结果请看它到底改没改 profile 清单，别只看退出码。

---

## 3. 界面与渲染

### 3.1 面板能打开，但换哪张壁纸都没有反应

按代价从低到高：

1. **看宿主半**：`/dsh-wallpaper-bg/health` 是否返回 JSON。不是 → 宿主半没挂上，回到 [§2.1](#21-装完了但设置--壁纸里没有面板)；改过 `lib/host.js` 的话先重启 DSH。
2. **看是不是内置壁纸**：内置 10 张是 **Unsplash 远程图片**（`images.unsplash.com`），断网 / 代理拦截 / 证书问题时一张都出不来，而自定义上传照常。验证方式：上传一张本地图片试试——本地能显示、内置不显示，就是网络问题（离线使用请走自定义上传）。
3. **打开 DevTools（F12）看 Console / Network**。下面这些失败在界面上**不会有任何提示**，只能在这里找线索：
   - Console 里插件抛出的 `图片加载失败: <url>`、`视频加载失败: <url>`（这两句不会渲染到面板上）；
   - 网页壁纸的兼容垫片提示（见 [§3.8](#38-网页壁纸黑屏或很久不出画面)）；
   - Network 里对应请求是否 404 / 被拦截。

   插件在加载失败时会**保持当前背景不动**，所以「点了没反应」往往就是这里报错。
4. **看素材本身**：`WE 壁纸库` 的素材由服务只读提供，服务断了会走 [§4.1](#41-we-页签连不上服务)；自定义素材存在 IndexedDB，参见 [§3.6](#36-上传之后网格里没有新壁纸也没有任何报错)。

### 3.2 页面文字看不清，或想完全露出壁纸

这两件事是一对反向需求，插件给了对应的旋钮：

| 想要的效果 | 怎么调 |
| --- | --- |
| 细字更清楚 | 提高「浅色雾层」（浅色外观）或「深色遮罩」（深色外观）——两者随 DSH 主题自动切换，只需调当前主题那一个 |
| 壁纸更清晰（少一层糊） | 降低「背景模糊度」；「背景亮度」调到接近 100% |
| 壁纸完全露出来，界面表面不再半透明 | 主页面标题区的 **「原生背景」开关**：一次清掉雾层 / 遮罩与插件给界面表面加的半透明覆盖，输入框与弹窗仍保留可读底色；关掉即恢复原数值（开关状态会记住） |
| 裁掉壁纸边缘的黑边 | 「安全放大」拉 1–3% |
| 全部回到初始值 | 「恢复默认」 |

注意：**拖动这些滑杆时背景不会重新加载**（0.5.2 起），所以不会有闪烁；如果拖动滑杆时整块背景一闪一闪，那是旧版本，升级即可。

### 3.3 切换壁纸时闪黑

0.5.x 起换壁纸是**双层交叉淡入淡出**：新壁纸先在自己的图层里预加载、解码 / 起播完成，再与旧壁纸叠化约 0.42 秒，旧层淡出结束才移除——切换过程中任何一帧都有画面。队列循环时还会**提前预热下一张**。

**0.5.9 及更早的已知问题（0.5.10 已修）**：播放队列自动切下一张时可能闪一段黑屏，**两个视频之间最明显**。三处细节叠加而成，都在 `lib/client.js`：

1. 旧图层在淡出**开始**的瞬间就被 `releaseVideo()`（`pause` + 摘掉 `src` + `load()`）断源——那一帧 `<video>` 已经没有任何可画的帧，图层只剩自己的近黑底色；
2. 那块近黑底色 `#0b0d12` 原先挂在 `.wbg-layer` 上：新视频从「挂载 + `play()`」到合成器真的出画面可能有几百毫秒（4K 更久），这段时间露出的就是它；
3. 叠化并不总在真的跑：`appendChild` 与「改 `opacity`」落在同一帧时浏览器不会产生过渡（新壁纸是「跳进来」的），而队列预热路径拿到 `readyState` 就立刻叠化，没等首帧真的画出来。

**0.5.10 修复后**：淡出期间只 `pause()`（保留最后一帧，也不再解码，释放推迟到图层移除），近黑底色移到容器 `#dsh-wallpaper-bg` 上让图层保持透明，`crossfade()` 先强制结算一次样式再改 `opacity`，视频路径等 `requestVideoFrameCallback` 上报「首帧已呈现」后才进场（首屏没有可叠化的旧层时仍直接显示，不会凭空来一段从黑淡入）。

改完仍闪黑，按这个顺序自查：

1. F12 → Console 有没有 `图片加载失败: …` / `视频加载失败: …`（素材本身加载不出来，见 [§3.1](#31-面板能打开但换哪张壁纸都没有反应) 第 3 步）；
2. 视频编码浏览器不认（HEVC / 某些 10bit）→ [§3.5](#35-上传的视频显示为黑块--黑屏)；
3. 确认页面跑的是当前代码：浏览器半每次请求从磁盘现读（普通刷新即可），宿主半改动才需要重启 DSH（[§5.1](#51-改了代码不生效)）。

### 3.4 视频四周有黑边

黑边来自**视频文件本身**（letterbox），渲染层的 cover 裁剪保证不自造黑边。把「安全放大」拉到 **2–3%** 就能裁掉。

### 3.5 上传的视频显示为黑块 / 黑屏

- `.mkv` / `.mov` 等文件的 MIME 常常是空的，插件现在会**按扩展名**识别成视频并渲染，同时自动生成首帧缩略图；若某个文件仍然是黑块，多半是**该编码浏览器不支持**（例如 HEVC / 某些 10bit 编码）。
- 判断方法：把同一个视频拖进浏览器窗口单独播放，能不能放；不能放就是编码问题。
- 处理：用 WE 托盘菜单的屏幕录制 / OBS / 任意转码工具导出 **H.264 MP4** 再上传，并优先用 `1920×1080` 而不是 4K（见 [§3.7](#37-掉帧卡顿风扇变响)）。

### 3.6 上传之后网格里没有新壁纸，也没有任何报错

自定义上传存进 **IndexedDB**，而这条路径上的失败**都是静默的**（写入失败被吞掉，界面不弹提示）。常见原因与处理：

| 原因 | 确认方式 | 处理 |
| --- | --- | --- |
| 无痕 / 隐私窗口，或浏览器（或企业策略）禁用了站点数据 | F12 → Application → IndexedDB，看有没有 `dsh-wallpaper-bg` 库 | 换普通窗口；允许该站点存储数据 |
| 素材太大，配额不足（浏览器对每个 origin 有配额，视频尤其容易超） | Console 里可能有 `QuotaExceededError` | 换小一些的文件；删掉不用的旧上传后再传 |
| 磁盘空间不足 | 系统剩余空间 | 清理磁盘 |
| 换了地址 / 端口（origin 变了） | 见 [§2.7](#27-换了端口或地址之后设置--上传的壁纸全没了) | 回到原地址访问 |
| 浏览器「清除站点数据 / 退出时清空」被勾选 | 浏览器设置 | 取消该项，重新上传 |

另外：如果某个上传项**之前能选中、现在点选后背景变成内置壁纸**，说明这条记录读不出来了（IndexedDB 读取失败时会回退到内置图），同样按上表处理。

### 3.7 掉帧、卡顿、风扇变响

按对性能的影响排序：

1. **4K 视频壁纸**：视频层由 GPU 合成缩放（不使用逐帧 canvas），但 4K 解码本身仍吃资源。换成 1080p 版本收益最大。
2. **背景模糊度 > 0**：模糊滤镜会让背景层离开 GPU 合成快路径（4K 视频实测 60fps → 22fps 量级）。不需要模糊就调到 0。
3. **网页壁纸**：帧率由壁纸页面自己决定，宿主无法限帧；复杂的网页 / 场景预览 GIF 会一直占 CPU。
4. **播放队列**：切换时会预热下一张（网络图片提前下载解码、视频提前建 `<video>` 缓冲），这是拿一点带宽换「切换不等待」；不需要循环播放就关掉「循环播放」。
5. 顺带确认没有**多路背景同时在解码**：旧版本切换后有残留解码会一路把帧率拖垮（实测 6 次切换后 59.7 → 12.2 fps），0.5.x 已修，升级即可。

### 3.8 网页壁纸黑屏或很久不出画面

网页类壁纸由服务以只读方式提供，并注入一层 **WE 私有接口垫片**：把 `project.json` 的默认用户属性喂给 `applyUserProperties`、提供音频 / 媒体接口占位、上报「已画出内容」。缺了垫片，只在属性回调里设背景图的壁纸就会只剩角色立在纯黑底上，看起来像一张竖屏壁纸。

1. 确认服务是 **0.5.1**：`http://127.0.0.1:8088/health` 应含 `"webShim": 1`。缺这一项就是服务过旧 → [§4.9](#49-重启不等于升级) 升级。
2. 打开 F12 看 Console：若出现
   `[dsh-wallpaper-bg] 未收到网页壁纸兼容垫片上报：WE API 服务可能是旧版本，网页壁纸可能黑屏或缺少背景。升级后双击 wallpaper-engine-api/重启服务(管理员).bat 即可。`
   就是同一条结论。
3. 网页壁纸自己的脚本报错也会打到 Console：`[dsh-wallpaper-bg] 网页壁纸 <标题> 报错：…`——这是壁纸本身的问题，不是插件。
4. 想直接确认垫片在不在：DevTools 的 console 上下文切到壁纸那个 iframe，执行 `window.__wbgWeShim`，正常返回 `1`；页面源码里也应有一个 `<script data-wbg-we-shim="1">`。
   - 服务只在请求确实来自 iframe / 文档（`sec-fetch-dest` 为 `iframe`/`document`/`frame`/空）且 HTML 里能找到 `<body`/`<html` 时注入；垫片最多等 30 秒（120 × 250ms）绘制上报，超时后插件不再等它、直接叠化——所以「很久不出画面」也会表现为「先黑一段时间再来画面」。
5. 服务 0.3.8 起 `/files` 路由改为流式 + `ETag` / `Last-Modified` / `Range`。如果每次切换网页壁纸都看到资源重新下载，同样是服务过旧。
6. 网页壁纸的个别资源加载不出来（Network 里看 `/files/<id>/...` 的状态码）：

   | 状态码 / 错误 | 含义 |
   | --- | --- |
   | `403 该壁纸未订阅或已本地禁用` | 该壁纸不在 Steam 订阅清单里（服务只读已订阅内容） |
   | `403 路径越界` | 资源路径试图跳出壁纸目录（服务会拒绝） |
   | `404 壁纸目录不存在` / `404 文件不存在` | 目录 / 文件真的没了（壁纸文件不完整，或已被删除） |
   | `400 非法壁纸 ID` / `400 非法路径编码` | 壁纸里写的路径不规范 |
   | `416`（无响应体） | `Range` 请求越界，某一个片段失败 |

   这些都是**服务按只读规则如实拒绝**，不是插件坏了——多数情况下重装 / 重新订阅该壁纸即可。

### 3.9 网页壁纸点不动、音频可视化没声音

都是**设计如此**，不是故障：

- 背景层 `pointer-events: none`——不拦截鼠标，否则整个 DSH 界面就没法点了。所以网页壁纸自带的点击 / 拖拽交互不会生效，只有视觉效果。
- 浏览器里没有 Wallpaper Engine 的音频采集，音频可视化会以静音数据运行。

### 3.10 场景壁纸发虚、看着不像动态的

场景壁纸（手动选中 / 播放队列 / 同步桌面）**一律显示 WE 自带的工坊预览图** `preview.gif`（会动）/ `preview.jpg`，插件不做本地渲染、不采样桌面画面、不产生缓存文件。

- 预览图普遍只有 **192×192** 像素，全屏放大必然发虚——状态行里会实测标出「实测 192×192 像素，全屏放大后必然发虚」。这**不是缓存里的旧图，也不是没生效**。
- 想要 100% 保真的动态画面：用 WE 托盘菜单的屏幕录制（或 OBS）录 30 秒左右导出 MP4，再从「自定义上传」导入，浏览器里用原生 `<video>` 播放。
- 0.4.0 已移除本地场景渲染（`WE_SCENE_RENDER` 开关一并删除），0.5.0 移除了桌面画面捕获：旧端点 `/scene-frame`、`/scene-anim`、`/capture` 一律返回 **404**，这是预期的。历史遗留的 `~/.dsh-wallpaper-bg` 缓存目录可以直接删掉。

### 3.11 macOS 桌面端窗口拖不动、双击不放大

0.5.8 及更早的版本在 macOS 上会出现：装上插件后 DSH 窗口拖不动、双击标题栏也不放大。原因是两个全屏背景层排在所有拖拽区域之后，把整窗拖拽区抹掉了。

**0.5.9 已修**，升级即可。Windows / Linux / 浏览器不受影响。

### 3.12 播放队列不切换 / 循环不动

- 队列需要**开启「循环播放」**才会自动切换；「每张时长」1–10 分钟，两个队列（自定义、WE）共用这个值。
- 队列项被删除（源素材没了）时会留一个「（已删除的壁纸）」占位——把它移出队列，否则会卡在它上面。
- 队列内容 / 开关 / 播放下标都存在 localStorage，刷新后保留；如果重启后队列空了，按 [§3.6](#36-上传之后网格里没有新壁纸也没有任何报错) 检查站点数据是否可用。

---

## 4. WE 壁纸库（可选服务）

前提：**Windows + 本机 Wallpaper Engine + PATH 里有 Node.js**。服务是**独立的 Node 进程**，桌面端自带的运行时管不到它；`wallpaper-engine-api/` 只随**仓库**提供，不在 npm 包里。

### 4.1 WE 页签「连不上服务」

面板会按「从省事到麻烦」给三步（原文）：

> ① 装过、只是没在运行（最常见）：双击 `wallpaper-engine-api\重启服务(管理员).bat`，再点「刷新」；想以后重启电脑 / 关掉窗口都不用管，双击同目录的 `设置开机自启.bat`。
> ② 从没装过：该服务只随仓库提供、不在 npm 包里——先 `git clone https://github.com/nishuoyang/dsh-wallpaper-bg`，进入 `wallpaper-engine-api` 执行 `npm install`，再双击 `启动服务.bat` 走首次运行向导（会写出 `we-api.config`）。首次运行请务必用 `启动服务.bat`：静默脚本 `启动服务-静默.vbs` 没有向导，缺配置时不弹窗、只在 `we-api.log` 里留错误。
> ③ 还是连不上：看 `wallpaper-engine-api\we-api.log` 末尾的报错；改过端口的话把上方基地址改成一致。

补充三点：

- **不需要 WE 壁纸库可以完全忽略这条提示**：内置壁纸与自定义上传都不依赖它。
- 面板显示的错误前缀来自宿主半代理（HTTP **502**），常见有 `WE API 不可达`、`HTTP 404`、`WE API 返回空响应`、`WE API 返回非 JSON 内容: …`、`The operation was aborted due to timeout`（服务 8 秒未响应）。它们都指向同一件事：8088 上没有健康的服务。
- **「刷新」是有意义的**：宿主半对壁纸列表缓存 **5 分钟**、对「当前壁纸」缓存 **10 秒**，服务自己对列表也缓存 **60 秒**（订阅清单 30 秒）。点面板上的「刷新」会带 `refresh=1` 逐层绕过这些缓存；所以**改完服务记得点一下「刷新」，不要靠等**。

### 4.2 列表还在，但可能已过期

如果本次页面会话里**成功加载过一次**列表，之后服务挂掉，面板会在列表上方显示红色横幅：

> ⚠ 连不上 WE API 服务（`<基地址>`）——下方列表是上次的缓存，可能已过期。双击 `wallpaper-engine-api\重启服务(管理员).bat` 后点「刷新」即可恢复；想以后重启电脑 / 关掉窗口都不用管，双击同目录的 `设置开机自启.bat`。注意：别在 DSH 客户端内部（终端 / 工具）启动服务——那样起的进程会随客户端退出一起结束；请在资源管理器里双击脚本。

「壁纸库为空。」或「当前筛选条件下没有壁纸」则是另外两种情况：前者是服务正常但没有可用壁纸（检查 WE 是否装了壁纸、订阅目录是否对），后者把「类型 / 分级」筛选切回「全部」。

### 4.3 退出 DSH 客户端，服务就没了

正常启动的服务**不会**随 DSH 退出而结束：它是独立进程，退出 / 重进客户端、重载窗口都不影响它，只在 Windows 注销 / 关机时结束（下次登录由开机自启项拉起）。

会「一退客户端就没」的只有一种：**从客户端内部启动的**——在 DSH 的终端 / 工具里跑了 `启动服务.bat`、`启动服务-静默.vbs` 或 `node server.js`。DSH 用带 `KILL_ON_JOB_CLOSE` 的 Job Object 管理这类子进程，客户端一退出就一起结束，而且 `we-api.log` 里**不会留下任何报错**，界面上只表现为「连不上服务」。

正确做法：

- 在**资源管理器里双击**脚本（父进程是 `explorer.exe`），或
- 交给开机自启项（[§4.11](#411-开机自启不生效)）。

怀疑服务没了时，先看 `http://127.0.0.1:8088/health` 还在不在。

### 4.4 双击启动脚本「什么都没发生」

那是跑到了**静默启动**（`启动服务-静默.vbs`，或开机自启项）：它没有向导、不开窗口，做的事情等价于 `cmd /c node server.js >> we-api.log 2>&1`，缺 `node_modules` 或 `we-api.config` 时会**完全静默地失败**，唯一痕迹是 `wallpaper-engine-api/we-api.log` 末尾的一段堆栈。

处理：先跑一次 **`启动服务.bat`**（走向导、写出 `we-api.config`，窗口里会打印 `[START] WE API readonly proxy - http://127.0.0.1:8088`）；之后静默启动才可用。想重跑向导：`启动服务.bat /setup`。

静默启动**不做端口预检查**，所以它可能和已经在跑的实例抢 8088：谁先听上谁活，输的那个把 `[WE-API] 端口 … 已被占用` 写进日志就退出，界面上什么都不会出现（[§4.8](#48-8088-端口被占用--换端口)）。

### 4.5 `[ERROR] Node.js not found in PATH.`

服务是 DSH 之外的独立 Node 进程，需要**系统级安装的 Node.js**（`node -v` 能在命令行里跑）——桌面端自带的运行时不算。

处理：装 Node.js ≥ 20 并在**新的**命令行窗口里确认 `node -v` 有输出，再重新双击 `启动服务.bat`。

两点说明：

- 脚本实际只检查 `node` 在不在 PATH（`where node`），**并不校验版本**；报错文本里的「Node.js 20 or newer」只是提示口径，版本太旧会在后续步骤里以别的形式失败。
- 桌面端自带的运行时管不到这个服务，所以「DSH 里能跑」不代表 `node -v` 在系统里能跑。

### 4.6 服务找不到 Wallpaper Engine

- 服务只查注册表里的 Steam 路径和几个常见 Steam 目录（脚本试 `C D E F G H`，服务自己的自动探测只试 `C D E F G`），因此装在**第二个 Steam 库**里的 WE（例如 `D:\SteamLibrary\steamapps\common\wallpaper_engine`）**不会被自动探测到**：脚本会提示 `Wallpaper Engine was not found automatically. Paste its install path.`，此时直接粘贴路径——以下三种都认：
  1. 含 `wallpaper64.exe` / `wallpaper32.exe` 的目录；
  2. `wallpaper64.exe` 的完整路径；
  3. 你的 Steam 目录（脚本会自己往里找）。
- 手动输入**最多 3 次**（回车也算一次）；3 次都错会打印 `[INFO] Gave up after 3 tries - we-api.config was NOT changed.` 并以退出码 0 结束（**不会**改坏已有配置）；输入 `q` 同样安全退出。随时重跑 `启动服务.bat /setup`。
- 路径不对时脚本报 `[ERROR] wallpaper64.exe / wallpaper32.exe not found under: <路径>`；配置写好后服务自己启动时若仍找不到，它会在日志 / 控制台里说清楚：

  ```
  [WE-API] 未找到 Wallpaper Engine。请通过 启动服务.bat 填写安装目录，
  [WE-API] 或设置环境变量 WE_INSTALL_PATH 指向含 wallpaper64.exe 的目录。
  ```

  目录存在但 exe 没了（例如 WE 被移动 / 卸载）则是 `[WE-API] Wallpaper Engine 初始化失败：<原因>` + `当前使用的安装目录：<路径>`，两种情况服务都以**退出码 1** 结束。
- 想跳过向导：`we-api.config` 就是 `server.js` 同目录下的纯 `KEY=value` 文件，自己写好即可：

  ```ini
  WE_INSTALL_PATH=D:\Steam\steamapps\common\wallpaper_engine
  WE_WORKSHOP_PATH=D:\Steam\steamapps\workshop\content\431960
  ```

  - 三个键支持环境变量，且**优先级高于配置文件**：`WE_INSTALL_PATH`、`WE_WORKSHOP_PATH`、`WE_SUBSCRIPTIONS_FILE`。
  - `WEAPI_PORT` **只能来自环境变量**——写在 `we-api.config` 里服务不认（虽然启动脚本的文案看起来像是配置项）；非数字会让服务在监听时直接崩掉。
  - 配置文件里的 `#` 注释、没有 `=` 的行都会被跳过，键名大小写不敏感；**文件不存在或读坏了都是静默的**（服务退回环境变量 → 自动探测），所以「配置改了没生效」先确认文件确实在 `server.js` 旁边、键名拼对。
  - 订阅目录写错只提示 `[WARN] Folder not found: <路径>`，配置照样写入，代价是列表可能为空——之后手改 `we-api.config` 即可。

### 4.7 `npm install` 报 `EALLOWREMOTE` 或一直卡住

仓库的 `wallpaper-engine-api/package-lock.json` 把依赖的 `resolved` 写死在镜像 `registry.npmmirror.com` 上；**npm 12 起默认 `allow-remote=none`**，会拒绝主机与当前配置源不一致的 tarball：

```
EALLOWREMOTE: Fetching packages of type "remote" have been disabled
```

`启动服务.bat` 遇到这种情况会走**有界的三步兜底**（每步都打印原因，三次都失败才提示手动执行）：

```
npm install
npm install --allow-remote=all    # 放行锁文件指向的镜像
npm install --no-package-lock     # 忽略锁文件，改用你 .npmrc 里配置的源
```

手工安装时按同样顺序执行即可。**不要**为了图省事直接删掉锁文件：锁文件里写死的镜像地址让安装不依赖你本机的源配置（本机实测过 `registry.npmjs.org` 连接超时、`registry.npmmirror.com` 0.5 秒返回 200），删了反而更容易卡住。

三次都失败时它以退出码 1 结束，并把下一步直接写出来：

```
[ERROR] npm install failed three times. Check your network / npm registry,
        then run it by hand to see the full error:
            cd /d "<wallpaper-engine-api 目录>"
            npm install
```

依赖检查只看 `node_modules\wallpaper-engine-api\package.json` 在不在，所以**装到一半**（目录建出来了、包不全）会被当成缺失，重新双击 `启动服务.bat` 让它补装即可。

### 4.8 8088 端口被占用 / 换端口

`启动服务.bat` 的端口检查写死在 **8088**，而且排在 Node / 依赖检查**之前**：端口有人听时它会说

```
[INFO] Port 8088 is already in use. The service may already be running.
       Check http://127.0.0.1:8088/health
```

- 不加 `/setup`：再给出 `` To change the settings, stop the running service first, then run: 启动服务.bat /setup ``（或双击 `重启服务(管理员).bat`），然后以退出码 1 结束——不会起第二个实例。
- 加 `/setup`：只重写 `we-api.config`，**不启动服务**，并提醒 `A service is still running with the OLD settings. Restart it to apply them`。

服务自己撞端口时（例如静默启动与已运行的实例抢同一个端口）：

```
[WE-API] 端口 <PORT> 已被占用。请关闭占用程序，或设置环境变量 WEAPI_PORT 换端口。
```

它以退出码 1 结束——**静默启动时这行只进 `we-api.log`，界面上什么都不会出现**。

查占用：

```powershell
Get-NetTCPConnection -LocalPort 8088 -State Listen | Select-Object LocalAddress,OwningProcess
Get-Process -Id <OwningProcess>
```

占用者就是上一次的服务时，双击 `重启服务(管理员).bat` 让它重启：

- 第一步先 `taskkill` 8088 上的进程；结束不掉就自动经 PowerShell 请求管理员权限再试一次。
- **UAC 被拒绝时窗口会直接关掉、屏幕上什么都不打印**，`restart-debug.log` 会停在 `[INFO] relaunching elevated...` ——遇到「双击了但一闪而过」，先看这个文件。
- 成功：`[OK] WE API restarted on port 8088 with the new code.`；10 秒内端口还没起来：`[ERROR] Port 8088 is still not listening. See restart-debug.log and we-api.log.`（**注意它的退出码仍是 0，别用退出码判断**）。
- 它只确认**端口在监听**，**不检查 `/health`**；而且它会启动目录里**每一个 `.vbs`**（目前只有 `启动服务-静默.vbs` 一个）。

**换端口要改三处**：`WEAPI_PORT` 环境变量（只改服务自己）、`启动服务.bat` 与 `重启服务(管理员).bat` 里写死的 8088（含它们的提示文案与预检查，不跟随 `WEAPI_PORT`）、以及插件设置面板里的「WE 基地址」。只改服务端会导致插件连不上，只改插件端会导致服务起不来。

### 4.9 重启不等于升级

`重启服务(管理员).bat` 只做两件事：结束占用 8088 的进程，再通过静默启动器重新拉起 `node server.js`。它**既不 `git pull` 也不 `npm install`**，因此永远拿不到新代码。

升级 = 仓库里 `git pull` + `wallpaper-engine-api` 里 `npm install` + 重启服务。

判断当前服务新旧（`http://127.0.0.1:8088/health`）：

| 字段 | 含义 | 当前应为 |
| --- | --- | --- |
| `version` | 服务版本 | `0.5.1` |
| `webShim` | 有网页壁纸兼容垫片 | `1`（缺 → 网页壁纸黑屏，[§3.8](#38-网页壁纸黑屏或很久不出画面)） |
| `monitorSelect` | 当前壁纸支持指定显示器 | `1`（缺 → 「跟随显示器」不可用，[§4.12](#412-同步桌面壁纸显示的不是桌面上那张)） |
| `weRunning` | 检测到 WE 正在运行 | `true`（`false` 时同步桌面壁纸会拿不到当前壁纸） |
| `mode` | 只读标记 | `readonly` |

`/health` 已不再上报 `desktopCapture`；`/capture`、`/scene-frame`、`/scene-anim` 一律 **404** 是预期行为（[§3.10](#310-场景壁纸发虚看着不像动态的)）。

### 4.10 WE 里删掉的壁纸还在

服务按 Steam 真实订阅清单（`431960_subscriptions.vdf`）过滤：在 WE 里退订 / 本地禁用的壁纸即使文件夹残留也不会列出。列表不对时：

1. 点插件里的**「刷新」**（会绕过宿主 5 分钟与服务 60 秒的列表缓存）。
2. 还是不对，确认服务版本（[§4.9](#49-重启不等于升级)）——旧服务可能还在列残留项。
3. 用了非默认订阅目录 / 非默认 Steam 用户，检查 `WE_SUBSCRIPTIONS_FILE` 是否指到了正确的那份 `.vdf`。
4. 直接问服务要一次原始数据：

   ```
   http://127.0.0.1:8088/api/wallpapers?refresh=1
   ```

   - `count` 是列出的壁纸数，`hiddenUnsubscribed` 是**被订阅清单挡掉的数量**——它大于 0 说明过滤正在生效。
   - 清单**读不到时服务会退化为不过滤**（宁可多列不可少列），此时 `/health` 里的 `subscriptionsFile` 是 `null`，WE 里已退订的残留目录就会重新冒出来。

### 4.11 开机自启不生效

- **没设过**：双击 `设置开机自启.bat`，它写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 下的值 `WE-API 静默启动`（数据是 `"wscript.exe" "<目录>\启动服务-静默.vbs"`），登录时后台静默启动。不需要管理员权限。不设的话，服务只活在「启动它的那个窗口」存续期间——重启电脑或关掉窗口后就没了。
- **设过但任务管理器里显示「已禁用」**：任务管理器 /「设置 → 应用 → 启动」里的「禁用」**不删除** `Run` 值，只把 `HKCU\...\Explorer\StartupApproved\Run` 里同名状态写成 `01`（12 字节 `01…`），登录时会被跳过。重新双击 `设置开机自启.bat` 会把状态归一为「已启用」（写成 `02…`）并回读校验（0.5.7 起；更早的版本会「报成功但实际不启动」）：
  - 归一成功：`[状态] 启动应用记录已置为「已启用」（前两字节 02）。`
  - 回读仍是 `01`：`[警告] 启动状态仍读到「已禁用」（01）：请到「任务管理器 → 启动」里把「WE-API 静默启动」改成「已启用」，否则登录时不会启动。`
  - 注意脚本结尾**无论如何**都会打印 `[成功] 已设置开机自启…` 那一段，所以别只看「成功」两个字，上面的警告行才是结论。
- **怎么验证**：重启后 `http://127.0.0.1:8088/health` 返回 JSON，或在「任务管理器 → 启动」里确认 `WE-API 静默启动` 是「已启用」。
- **取消**：双击 `取消开机自启.bat`（0.5.7 起连同状态记录一起清掉）。它**只取消下次登录自启，不会停止当前正在运行的服务**，也不删除 `<目录>\we-api.log`；删除动作是静默执行的（不检查是否删成功），如果事后注册表里还看得到 `Run` 值，手动删即可。
- **脚本报错**：找不到 `启动服务-静默.vbs`（`[错误] 未找到启动脚本…`）、写注册表失败（`[错误] 写入注册表失败。`）、回读校验失败（`[错误] 注册表写入校验失败。`）都以退出码 1 结束，按提示处理后重跑。
- 两个脚本都引用本目录的 `启动服务-静默.vbs`，**移动过目录后要重新设置一次**；`设置开机自启.bat` 还会顺手清理旧版放在「启动」文件夹里的副本与残留日志。

### 4.12 「同步桌面壁纸」显示的不是桌面上那张

WE 的 `config.json` 把当前壁纸按显示器存成 `selectedwallpapers.Monitor0 / Monitor1 / …`，而这个编号由 WE 自己维护——显示器插拔、切换主屏、笔记本内屏关掉之后，`Monitor0` 常常**不是你正在看的那台**（旧版盲取 `Monitor0`，于是页面一直是「以前那张」，很容易被误判成缓存没清）。

处理：

1. 先看状态行里的**显示器**那一项与判定依据（`自动：最近换过壁纸的那台` / `自动：正在被读取 / 播放的那台` / `自动：默认第一台` / `手动指定`）。
2. 需要服务 **0.5.1+**（`/health` 含 `"monitorSelect": 1`），改完双击 `重启服务(管理员).bat`。
3. 多显示器时状态行会出现**「跟随显示器」下拉**：`自动（推荐）`，或直接钉死某台（选项形如 `Monitor1（视频）· 正在播放`）。下拉旁若提示
   `（当前 dsh 里加载的宿主半是旧版：指定显示器需要重启 dsh 后才生效；在此之前一律按「自动」跟随）`
   说明透传 `monitor` 的宿主半是旧的，**重启 DSH** 即可；在此之前下拉是禁用状态。
4. 状态行一直显示「尚未获取到当前桌面壁纸（WE 未运行或桌面未设置壁纸）」时，检查 `/health` 的 `weRunning` 与 WE 是否真的在跑（同步只读，不会去拉起 WE）。

### 4.13 日志在哪、乱码怎么办

| 文件（都在 `wallpaper-engine-api/` 下，均已 gitignore） | 内容 |
| --- | --- |
| `we-api.log` | 静默 / 开机自启路径写下的服务输出（服务启动横幅、报错堆栈） |
| `restart-debug.log` | `重启服务(管理员).bat` 做了什么：结束进程的尝试、提权、等待端口 |

- 服务没响应时**先看这两个文件**；`[ERROR] port not listening` 表示重启后 8088 仍没起来。
- **交互式 `启动服务.bat` 不写日志**（只在窗口里输出），所以 `we-api.log` 只有在用过静默启动 / 开机自启之后才有内容——它是追加式、**没有时间戳**的，每次启动只写几行横幅，看最后一段即可。
- 看日志末尾就能定性：

  | 日志末尾 | 含义 | 去 |
  | --- | --- | --- |
  | `[WE-API] 未找到 Wallpaper Engine。…` / `Wallpaper Engine 初始化失败：…` | 路径没配对或 WE 被移动 | [§4.6](#46-服务找不到-wallpaper-engine) |
  | `[WE-API] 端口 <PORT> 已被占用。…` | 已有实例在跑，或别的程序占了 8088 | [§4.8](#48-8088-端口被占用--换端口) |
  | `Cannot find module 'wallpaper-engine-api'` + 堆栈 | 依赖没装 / 装了一半 | [§4.7](#47-npm-install-报-eallowremote-或一直卡住) |
  | `'node' is not recognized…` | PATH 里没有 Node | [§4.5](#45-error-nodejs-not-found-in-path) |
  | 以 `[WE-API] 本服务只读，不调用任何设置/播放壁纸的接口…` 结尾 | 服务是活的——问题在插件侧或端口不一致 | [§4.1](#41-we-页签连不上服务) |
  | 文件里什么都没有 | 静默启动连 `cmd` 都没跑起来 | [§4.4](#44-双击启动脚本什么都没发生) |

- **中文显示成乱码**（例如 `鏈湇鍔?`）不是服务故障，是查看器的编码问题：日志是 UTF-8，用 GBK 默认编码的记事本 / 控制台打开就会这样。用 VS Code 打开，或显式指定编码：

  ```powershell
  Get-Content .\wallpaper-engine-api\we-api.log -Encoding UTF8 -Tail 40
  ```

---

## 5. 开发 / 从源码运行

### 5.1 改了代码不生效

| 改了什么 | 怎么生效 |
| --- | --- |
| `lib/client.js`（浏览器半） | 普通刷新页面（**F5**）即可：客户端 bundle 每次请求都从磁盘现读（`cache-control: no-cache`） |
| `lib/host.js`（宿主半）、`bin/` 下的文件 | **必须重启 DSH**：宿主半是 Node 侧 ESM，随进程启动加载一次，进程内不会重新导入（`dsh web` 重启进程，桌面端退出应用再打开） |
| 增删插件行、改 `dsh.client` 声明等插件集合变化 | 同样必须重启 DSH |
| `wallpaper-engine-api/` 下的服务代码 | 重启该服务（`重启服务(管理员).bat`） |

判断当前跑的是哪一版宿主半：`/dsh-wallpaper-bg/health` 里的 `version` 与 `monitorForward`。

### 5.2 本机自测（不需要启动 DSH）

```powershell
node .\verify-host.mjs        # 用最小 ctx 挂载 lib/host.js，拿假 req/res 打真实路由
node .\verify-service.mjs     # 端到端校验 WE API 服务（需服务在 8088 上跑着）
$env:WEAPI_BASE='http://127.0.0.1:8099'; node .\verify-service.mjs   # 指向临时实例
```

`verify-service.mjs` 断言的是**服务版本**（0.5.1），和插件版本是两条线；它会一并校验已移除的端点（`/capture`、`/scene-frame`、`/scene-anim`）确实返回 404。

### 5.3 `.bat` 刷出一片 `'...' is not recognized`

`cmd.exe` 按**字节偏移**而不是按行解析批处理：如果 `.bat` / `.cmd` / `.vbs` 的行尾是裸 LF，它会定位到行中间、开始执行半截命令，于是一片 `'xxx' is not recognized as an internal or external command`，`启动服务.bat` / `重启服务(管理员).bat` 都可能因此起不来。

- 成因是克隆时的 `core.autocrlf=false` / `input`，或在非 Windows 主机克隆后再经共享目录运行。仓库已用 `.gitattributes` 固定 `*.bat` / `*.cmd` / `*.vbs` 为 `text eol=crlf`（仓库内仍存 LF，检出统一为 CRLF）。
- 已踩坑的本地副本：重新 `git pull`（会按新的 `.gitattributes` 重新检出），或手动把行尾转成 CRLF。

### 5.4 `.ps1` 中文乱码 / 解析阶段就失败

Windows PowerShell 5.1 对**没有 BOM** 的 `.ps1` 按 ANSI 解码，脚本里的中文注释与提示会让它在解析阶段就报「字符串缺少终止符」之类的错误。仓库里的 `install-local.ps1` / `scripts/release.ps1` 都已带 UTF-8 BOM；自己新写的脚本请存成「UTF-8 with BOM」，或直接用 PowerShell 7 跑。

### 5.5 批处理里的括号坑（改脚本时）

`( ... )` 块内的 `echo` 行里，未转义的 `(` `)` 会让 CMD 提前闭合代码块并**中止整个脚本**（首次运行向导曾经因此写不出 `we-api.config`）。必须写成 `^(` / `^)`。

---

## 6. 看着像故障，其实是设计如此

| 现象 | 原因 | 怎么确认 |
| --- | --- | --- |
| 场景壁纸只显示预览图、不会真的动起来 | 不做本地渲染 / 不采样桌面，零缓存零开销；预览图 `preview.gif` 本身会动 | 状态行的「实测 W×H 像素」说明；[§3.10](#310-场景壁纸发虚看着不像动态的) |
| 网页壁纸点击、拖拽没反应；音频可视化没声音 | 背景层不拦截鼠标；浏览器没有 WE 的音频采集 | [§3.9](#39-网页壁纸点不动音频可视化没声音) |
| 每次进 WE 页签，分级筛选都回到「非18+」 | 有意为之（默认不展示 18+ 内容） | 面板里的筛选计数 |
| 终端不能启动 desktop profile | 桌面端独占管理 | [§2.5](#25-desktop-profile-被桌面端独占报错) |
| 退出 DSH 后 WE 服务还在跑 | 独立 Node 进程，只在注销 / 关机时结束 | [§4.3](#43-退出-dsh-客户端服务就没了) |
| `/capture`、`/scene-frame`、`/scene-anim` 返回 404 | 相关实现已在 0.4.0 / 0.5.0 移除 | `http://127.0.0.1:8088/health` 不再有 `desktopCapture` |
| 页面显示的还是「以前那张」桌面壁纸 | 多显示器判定取到了另一台 | [§4.12](#412-同步桌面壁纸显示的不是桌面上那张) |
| WE 页签提示连不上服务 | 不需要 WE 壁纸库的话这是无害提示 | 内置壁纸与自定义上传不依赖服务 |
| `node_modules/`、`we-api.config`、`we-api.log` 不在 git 里 | 本机文件 / 生成物，有意 gitignore | `we-api.config` 是每台机器自己的配置 |
| 内置壁纸首次显示较慢 | 内置壁纸是 Unsplash 远程图片，要联网下载 | 断网环境下用自定义上传 |

---

## 7. 准备报 bug 时，请附上这些

1. **部署方式与端口**：桌面端（19387）还是 `dsh web`（默认 3080）。
2. **插件版本**：`http://127.0.0.1:<端口>/dsh-wallpaper-bg/health` 的完整输出（含 `version`、`monitorForward`）。
3. **WE 服务（如涉及）**：`http://127.0.0.1:8088/health` 的完整输出；必要时 `we-api.log` 末尾 40 行。
4. **安装状态**：`dsh-wallpaper-bg status` 的输出。
5. **DevTools Console**（F12）里的报错——很多失败只在这里留痕（[§3.1](#31-面板能打开但换哪张壁纸都没有反应)）。
6. **复现步骤**：从哪个页签、点了什么、期望什么、实际看到什么；界面问题附截图或短录屏最有帮助。
7. 系统与主题（Windows / macOS、浅色 / 深色外观）、是否多显示器。

一键收集（PowerShell，按实际端口改第一行）：

```powershell
$p = 19387
(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$p/dsh-wallpaper-bg/health").Content
try { (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8088/health').Content } catch { "WE API 不可达：$($_.Exception.Message)" }
node .\bin\dsh-wallpaper-bg.js status
Get-Content .\wallpaper-engine-api\we-api.log -Encoding UTF8 -Tail 40
```

报告安全问题时**不要**开公开 issue，走 [`SECURITY.md`](../SECURITY.md)。

---

## 附录 A · 地址与端口速查

| 用途 | 地址 |
| --- | --- |
| 插件宿主半健康检查（桌面端） | `http://127.0.0.1:19387/dsh-wallpaper-bg/health` |
| 插件宿主半健康检查（`dsh web`） | `http://127.0.0.1:3080/dsh-wallpaper-bg/health` |
| WE API 服务健康检查（别名 `/api/health`、`/`） | `http://127.0.0.1:8088/health` |
| 服务返回的壁纸列表（`?refresh=1` 绕过缓存） | `http://127.0.0.1:8088/api/wallpapers?refresh=1` |
| 服务认为的「当前桌面壁纸」（可加 `?monitor=Monitor1`） | `http://127.0.0.1:8088/api/current` |
| 服务提供的壁纸文件（只读，仅限已订阅目录） | `http://127.0.0.1:8088/files/<壁纸ID>/<相对路径>` |
| 插件设置面板 | DSH **设置 → 壁纸** |
| 插件安装 / 停用 | 桌面端 **设置 → 插件**；命令行 `dsh plugin --profile <web\|desktop> …` |

宿主半的其它路由（一般不用手点，排障时可确认是否挂载）：`/dsh-wallpaper-bg/we`（WE API 只读代理，失败返回 **502** + `{"ok":false,"error":"…"}`）、`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 `Range`，缺 `path` 返回 400、文件不存在返回 404）。

服务的所有 JSON 错误都是同一个形状：`{"ok":false,"error":"…"}`，例如 `只读服务，仅支持 GET`（405）、`未知端点: /capture`（404）、`该壁纸未订阅或已本地禁用`（403）。

## 附录 B · 文件与命令速查

| 位置 | 说明 |
| --- | --- |
| `%DSH_HOME%`（默认 `C:\Users\<你>\.dsh`，可用环境变量 `DSH_HOME` 覆盖） | DSH 的配置根目录，下面几条都在它下面；CLI 只认这一个环境变量 |
| `%DSH_HOME%\profiles\<profile>\package.json` | profile 清单；`dsh.profile.bundles` 决定插件是否作为组合层加载 |
| `%DSH_HOME%\profiles\<profile>\cordis.patch.yml` | 用户补丁层（命令行安装方式写入的行） |
| `%DSH_HOME%\node_modules\dsh-wallpaper-bg` | 本地 `link:` / `install-local.ps1` 装出来的链接 |
| `%DSH_HOME%\.agent-presets\<id>\` | 只在 `install --preset`（按会话挂载）模式下用到 |
| `wallpaper-engine-api\we-api.config` | 服务的本机配置（`WE_INSTALL_PATH` / `WE_WORKSHOP_PATH`） |
| `wallpaper-engine-api\we-api.log`、`restart-debug.log` | 服务与重启脚本的日志（UTF-8） |
| `HKCU\...\CurrentVersion\Run` 的值 `WE-API 静默启动` | 开机自启项（[§4.11](#411-开机自启不生效)） |
| `~/.dsh-wallpaper-bg` | 0.4.0 之前的历史缓存目录，现版本不再创建，可直接删除 |

```powershell
node .\bin\dsh-wallpaper-bg.js status     # 逐 profile 报告安装状态（含 bundles 检查）
node .\bin\dsh-wallpaper-bg.js install    # 本地安装（跳过 desktop profile）
node .\bin\dsh-wallpaper-bg.js uninstall  # 卸载
.\install-local.ps1                       # 同上，开发模式 junction 安装
```

## 附录 C · 相关文档

- [`README.zh.md`](../README.zh.md) / [`README.md`](../README.md) —— 功能、安装、设置面板、常见问题（本文是它的排障展开版）
- [`CHANGELOG.md`](../CHANGELOG.md) —— 每个版本修了什么、哪一版引入了什么行为（判断「是不是老版本的已知缺陷」）
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) —— 本地开发、测试脚本、批处理与脚本约定
- [`SECURITY.md`](../SECURITY.md) —— 安全问题的私密报告入口与只读承诺
