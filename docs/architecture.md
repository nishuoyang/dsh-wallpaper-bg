# 架构与原理

> 适用版本：dsh-wallpaper-bg 0.5.13。本页说明本包的双半结构、组合方式与运行时的加载 / 刷新规则。

- [双半结构](#双半结构)
- [零构建与 CLI](#零构建与-cli)
- [运行时加载规则](#运行时加载规则)
- [仓库结构速览](#仓库结构速览)

## 双半结构

本包是 DSH **静态双半插件**，并作为 **profile 补丁层（bundle）**组合进 DSH 的 host 平面：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| 宿主半（Node） | `lib/host.js` | 注册同源路由：`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 Range）、`/dsh-wallpaper-bg/we`（WE API 只读代理，带缓存，透传 `previewFile` / `previewSize`，`action=current` 时透传「跟随显示器」的 `monitor` 并计入缓存键）、`/dsh-wallpaper-bg/health`（含 `monitorForward` 能力标记） |
| 浏览器半 | `lib/client.js` | 单文件 client bundle（`window.__ModuleLoader__` 工厂形式），注入背景层与遮罩、注册设置面板「壁纸」选项卡；「同步桌面壁纸」只读跟随桌面壁纸，再按类型走普通渲染路径（场景 → 工坊预览图） |
| 组合层 | `cordis.patch.yml` | `dsh.bundle` 补丁：把插件行插入 profile 组合的 host 平面，**随 DSH 启动即生效**（`dsh web` 与桌面端都一样），首次加载页面就带背景 |

两端零构建：`lib/client.js` 是手写的单文件 bundle，无需任何打包工具。

宿主半只在宿主的 `webServer` 服务存在时才注册路由——所以装进 `headless` / `tui` 这类没有 Web 界面的 profile 也无害（插件静默不生效，profile 照常启动）。

安装后，`profiles/<name>/package.json` 的 `dsh.profile.bundles` 里会出现 `dsh-wallpaper-bg`——这一项由 DSH 安装时自己回填，`dsh-wallpaper-bg status` 会检查它。

## 零构建与 CLI

另附 `dsh-wallpaper-bg` CLI（`install` / `status` / `uninstall`）完成一键安装——它面向命令行部署，会**跳过 `desktop` profile**（归 Electron 桌面端独占），桌面端请在**设置 → 插件**里安装，或用 `dsh plugin --profile desktop add dsh-wallpaper-bg`。

`install-local.ps1` 是等价的本地安装脚本：把仓库链接到 `%DSH_HOME%\node_modules`（全程无空格，规避 Windows 下 `dsh plugin` 经 shell 转发 pnpm 时空格被拆词的问题）并写入 profile 补丁层。

## 运行时加载规则

- **浏览器半（`lib/client.js`）**：每次请求都从磁盘现读（`cache-control: no-cache`），改完**普通刷新页面（F5）即可**；
- **宿主半（`lib/host.js`）与 `bin/`**：Node 侧 ESM 模块，随进程启动加载、进程内不会重新导入，改完**必须重启 DSH**（`dsh web` 重启进程，桌面端退出应用再打开）；
- 增删插件行 / 修改 `dsh.client` 声明等插件集合变化同样需要重启；
- 判断当前跑的是哪版宿主半：打开 `<DSH 地址>/dsh-wallpaper-bg/health` 看 `version`（桌面端固定 19387 端口，`dsh web` 默认 3080）。

## 仓库结构速览

| 路径 | 说明 |
| --- | --- |
| `lib/host.js` | 宿主半：同源路由 |
| `lib/client.js` | 浏览器半：单文件 bundle（背景层 + 设置选项卡） |
| `bin/` | `dsh-wallpaper-bg` CLI（`install` / `status` / `uninstall`） |
| `cordis.patch.yml` | `dsh.bundle` 补丁，插入 profile 组合 |
| `install-local.ps1` | 本地 checkout 链接安装 |
| `wallpaper-engine-api/` | 可选：WE 壁纸库服务（只随仓库提供，不在 npm 包里） |
| `verify-host.mjs` / `verify-service.mjs` | 宿主半 / WE 服务的验证脚本 |
| `legacy/` | v0.1.0 之前动态插件（Cordis dynamic package）时代源码，仅作归档 |

---

相关：[安装与升级](installation.md) · [设置与用法](configuration.md) · [WE 壁纸库服务](we-library-service.md) · [发布流程](releasing.md)
