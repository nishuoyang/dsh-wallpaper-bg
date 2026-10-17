# 安装、升级与本地开发

> 适用版本：dsh-wallpaper-bg 0.5.14。本页是 README「安装」章节的完整版：桌面端 / 命令行两种装法、升级机制、本地开发链接方式，以及安装后的验证手段。

- [前提条件](#前提条件)
- [桌面端安装（无需命令行）](#桌面端安装无需命令行)
- [命令行 / 网页版安装（`dsh web`）](#命令行--网页版安装dsh-web)
- [升级（为什么只跑 `add` 不会升级）](#升级为什么只跑-add-不会升级)
- [安装后验证](#安装后验证)
- [本地开发：改了代码为什么不生效](#本地开发改了代码为什么不生效)

## 前提条件

- **DeepSeek Harness 桌面端（0.2 预览版或更新）**——插件本体不需要额外装任何东西：桌面端自带 Node.js / pnpm 运行时，**无需自装 Node**；
- **或者命令行方式**（`dsh web`）：Node.js ≥ 20（`node -v` 检查）+ 能正常启动的 DeepSeek Harness；
- 可选的「WE 壁纸库」来源另有前提：Windows + 本机 Wallpaper Engine + 配套插件 `dsh-wallpaper-engine-api`（一条命令，见下）。不再需要 clone 仓库、`npm install`、`.bat` 或开机自启，详见 [WE 壁纸库服务](we-library-service.md)。

## 桌面端安装（无需命令行）

0.2 桌面端自带插件管理页面，装本插件完全不用开终端：

1. 打开**设置 → 插件**，在安装框里输入包名 `dsh-wallpaper-bg`；
2. 确认安装，按应用提示**重启桌面端**（或重载窗口）——插件集合在 DSH 启动时组合生效；
3. 打开**设置 → 壁纸**，挑一张壁纸即可。

桌面端会把它装进自己的 `desktop` profile，并在同一个页面里列出（可停用 / 卸载，也能看插件介绍与来源）。桌面端用固定端口（19387）提供该 profile，页面 origin 不会变，所以自定义上传（IndexedDB）和各项设置（localStorage）重启应用后都保留。

想用 **WE 壁纸库**来源的话，在同一个插件页面再装 `dsh-wallpaper-engine-api`（命令行等价：`dsh plugin --profile desktop add dsh-wallpaper-engine-api`）。它随 DSH 启停，不需要单独启动服务或设开机自启。

如果已把桌面端提供的 `dsh` 命令装进 PATH（应用内有该选项），等价命令是：

```bash
dsh plugin --profile desktop add dsh-wallpaper-bg
dsh plugin --profile desktop add dsh-wallpaper-engine-api   # 可选：WE 壁纸库
```

> `desktop` profile 归 Electron 应用独占：在终端里启动它会被拒绝（`profile "desktop" is managed exclusively by the Electron application`）。这是**预期行为**——安装 / 卸载请走插件页面（或 `dsh plugin --profile desktop …`，这条是能用的），应用启动时会自己组合并加载插件。本包自带的安装器 `dsh-wallpaper-bg install` 同样会跳过 `desktop` profile（原因相同），并提示改用插件页面。

## 命令行 / 网页版安装（`dsh web`）

```bash
dsh plugin --profile web add dsh-wallpaper-bg
dsh plugin --profile web add dsh-wallpaper-engine-api   # 可选：WE 壁纸库
```

> 本地开发建议直接链接仓库（两个 profile 都支持 link 形式）：
> `dsh plugin --profile web add link:<仓库绝对路径>`（桌面端则用 `--profile desktop`）—— 之后改 `lib/client.js` / `lib/host.js` 只需普通刷新页面即可生效，无需重启服务。
>
> Windows 下仓库路径**不能带空格**：`dsh plugin` 是经 shell 转发给 pnpm 的，带空格的 spec 会被拆成两个假依赖（`link:E:/My` + `link:Dir/plugin`），该 profile 随后直接加载失败。请把仓库放到无空格路径，或直接运行 `install-local.ps1` / `dsh-wallpaper-bg install`——它把仓库链接到 `%DSH_HOME%\node_modules`（全程无空格）并写入 profile 补丁层。

## 升级（为什么只跑 `add` 不会升级）

`dsh plugin … add` 转发给 `pnpm add`，而 pnpm 会保留 profile 清单里已有的版本范围：对已安装的插件重复执行安装命令不会产生任何变化，停在 `^0.4.1` 的 profile 永远不会自己走到 0.5.x。要升级请显式指定版本：

```bash
dsh plugin --profile web add dsh-wallpaper-bg@latest    # 升到最新发布版
dsh plugin --profile web add dsh-wallpaper-bg@0.5.14     # 或锁定某个具体版本
```

> **pnpm 11 只安装「发布满一天」的版本。** pnpm 11 默认开启 24 小时的 `minimumReleaseAge`（供应链保护）：某版本发布后约一天内，`dsh plugin … add dsh-wallpaper-bg` 只会解析到**上一个版本**，并打印 `(0.5.14 is available)`；`@latest` 同样受这个门槛限制。想立刻装上刚发布的版本，可以：写死版本号（`dsh-wallpaper-bg@0.5.14`）、加 `--config.minimumReleaseAge=0`，或在 profile 的 `pnpm-workspace.yaml` 里把本包排除：
>
> ```yaml
> minimumReleaseAgeExclude:
>   - dsh-wallpaper-bg
> ```
>
> 桌面端的插件页面走的是同一个 pnpm，所以刚发布的版本也要等约一天才会出现在那里。

## 安装后验证

- **界面里**：**设置 → 插件** 能看到 `dsh-wallpaper-bg`、**设置 → 壁纸** 能打开面板。
- **宿主半是否挂载**：浏览器打开 `<DSH 地址>/dsh-wallpaper-bg/health`，返回 JSON 即已挂载——`dsh web` 默认端口 3080（`http://127.0.0.1:3080/dsh-wallpaper-bg/health`），桌面端固定 19387（`http://127.0.0.1:19387/dsh-wallpaper-bg/health`）。0.5.14 起该响应含 `"discoverWeApi": 1`，表示会自动发现 WE API 插件的端口。
- **WE 壁纸库（可选）**：装了配套插件时，`<DSH 地址>/dsh-wallpaper-engine-api/status` 应返回 JSON，`base` 是实际 WE API 地址；打开它的 `/health` 能看到 `weInstallPath` / `workshopPath`。
- **是否真的作为组合层加载**：`profiles/<name>/package.json` 的 `dsh.profile.bundles` 里要有 `dsh-wallpaper-bg`——`dsh-wallpaper-bg status` 也会报这一点（在 bundles 里显示 `installed（bundle 层…）`，只装了依赖、没进 bundles 时会明确提示重跑一次 `add`）。这一项由 DSH 安装时自己回填；版本刚发布不久、注册表还在传播时偶尔会漏写，重跑 `dsh plugin --profile web add dsh-wallpaper-bg@<版本>` 即可补上。

装进 `headless` / `tui` / 自建 profile 是可以的，而且无害：插件只在宿主的 `webServer` 服务存在时才注册路由，没有 Web 界面的 profile 会照常启动、插件静默不生效（这个修复之前，这类 profile 会直接以 `1 entry did not activate` 启动失败）。不过装在那种 profile 里没有意义——壁纸界面在浏览器页面里——请装进 `web`，或桌面端的 `desktop` profile。

## 本地开发：改了代码为什么不生效

分两半看：

- 只改 `lib/client.js`（浏览器半）时**普通刷新页面（F5）即可**——客户端 bundle 每次请求都从磁盘现读（`cache-control: no-cache`）；
- 改 `lib/host.js`（宿主半）或 `bin/` 之后**必须重启 DSH**（宿主半是 Node 侧 ESM 模块，随进程启动加载、进程内不会重新导入）——`dsh web` 重启进程，桌面端退出应用再打开。增删插件行 / 修改 `dsh.client` 声明等插件集合变化同样需要重启。

判断当前跑的是哪版宿主半：打开 `<DSH 地址>/dsh-wallpaper-bg/health` 看 `version`（桌面端固定 19387 端口）。

---

相关：[WE 壁纸库服务](we-library-service.md) · [设置与用法](configuration.md) · [架构与原理](architecture.md) · [故障排查手册](troubleshooting.md)
