# 全新用户安装模拟报告（2026-10-28）

> 目标：站在「从没装过 dsh-wallpaper-bg」的用户视角，分别走一遍 **`dsh web` 网页端**和 **0.2 桌面端**的安装、配置与基本使用，覆盖成功路径和可预期的失败场景，记录问题并在同一个小版本里修掉。
>
> 结论：两种环境的主流程都能从零走通；共记录 **9 个问题 / 改进点**，均在 0.5.17 处理；另有 **2 个已知限制**保留并写入文档。

## 1. 模拟环境

| 项 | 值 |
| --- | --- |
| 系统 | Windows（本机） |
| Node / pnpm | Node 22.22.2 / pnpm 11.5.2（桌面端内置 Node 24.21.0 / pnpm 11.28.5） |
| 网页端 | `dsh` CLI 0.1.1-rc.2，`dsh web --port 3188/3189 --no-open` |
| 桌面端 | DeepSeek Harness 0.2.1-rc.3（`E:\Users\ASUS\AppData\Local\Programs\DeepSeek Harness`） |
| 被测主包 | npm `dsh-wallpaper-bg@0.5.16`（发布版）+ 本地打包的修复候选 |
| 可选插件 | npm `dsh-wallpaper-engine-api@0.1.1` |
| 隔离方式 | `DSH_HOME` 指向项目内 `.tmp-sim/home-*`；桌面端另加 `--user-data-dir` 到 E 盘；**未读写用户真实的 `C:\Users\ASUS\.dsh`** |
| UI 验证 | Edge headless + CDP（网页端）；Electron `--remote-debugging-port`（桌面端） |
| WE 数据 | 本机 8088 上已有一个旧的只读 WE API 服务（319 张壁纸），用于验证「复用外部服务」路径 |

## 2. 网页端（`dsh web`）

### 2.1 安装

```bash
export DSH_HOME=<隔离目录>/home-web
dsh plugin --profile web add dsh-wallpaper-bg@0.5.16
dsh plugin --profile web add dsh-wallpaper-engine-api@0.1.1   # 可选
dsh web --port 3188 --no-open
```

| 检查 | 结果 |
| --- | --- |
| profile 依赖与 bundles | `dsh-wallpaper-bg` / `dsh-wallpaper-engine-api` 均在 `dependencies` 与 `dsh.profile.bundles` 里 |
| 页面脚本注入 | HTML 出现 `/plugins/dsh-wallpaper-bg/client.js` |
| `GET /dsh-wallpaper-bg/health` | `{"ok":true,...,"version":"0.5.16","discoverWeApi":1}` |
| `GET /dsh-wallpaper-engine-api/status` | `status:"external"`，复用 8088 上的旧服务，`base` 正确 |
| 设置 → 壁纸 | 页签、10 张内置壁纸、4 个滑杆、恢复默认均正常 |
| 内置壁纸选择 / 刷新 | 背景切换、`localStorage` 持久化正常 |
| 自定义上传 | 图片入库并应用；刷新后从 IndexedDB 恢复（blob URL 重建） |
| WE 壁纸库 | 319 张、筛选 246、缩略图经 `/asset` 正常；视频壁纸 `readyState=4`、1920×1080、无错误 |
| 页面刷新恢复 WE 视频 | 正常，列表先登记资源再播放 |
| 控制台 | 无异常 / 无报错（仅有 DSH 自身的密码框提示） |

### 2.2 失败场景

| 场景 | 构造方式 | 结果 |
| --- | --- | --- |
| WE 未安装 / 端口空 | `base=http://127.0.0.1:18088` | 502；提示「无法连接 WE API（…）：服务未启动或端口不对；如需 WE 壁纸库，请安装 dsh-wallpaper-engine-api 插件」 |
| 已加载过列表后服务断开 | 面板里把地址改成 18088 再刷新 | 顶部横幅提示缓存可能过期，显示「18088，上次成功 8088」，并给出 `/dsh-wallpaper-engine-api/status` 入口 |
| 从没成功加载过 | 预置 `weBase=18088` 后打开 WE 页签 | 显示完整三步排查（装插件 / 看 status / 手动服务），无 `[object Object]` |
| 资源路径缺失 | `/asset` 不带 `path` | 400「缺少 path 参数」 |
| 清单外文件 | `/asset?path=C:\Windows\win.ini` | 403「该文件不在当前 WE 壁纸清单里…」（修复前会返回 200 和文件内容） |
| 未知路由 | `/dsh-wallpaper-bg/zzz` | 404「未知路由」 |
| 不支持的上传类型 | 上传 `test-note.txt` | 面板列出文件名并说明只收图片 / 视频 |
| 损坏图片 | 上传 `broken.png`（内容不是 PNG） | 面板提示「无法解码，文件可能损坏或编码不受支持」，不会入库 |
| 空文件 | 0 字节文件 | 被拦下并提示「（空文件）」 |
| 错误包名 | `dsh plugin --profile web add dsh-wallpaper-bgx` | pnpm 报 `ERR_PNPM_FETCH_404`，信息明确 |
| 不存在的 profile | `dsh --profile nope` | 明确报 `profile "nope" does not exist; create it with 'dsh plugin --profile nope add <package>'`（附调用栈） |

## 3. 桌面端（0.2.1-rc.3）

### 3.1 安装

按真实用户路径走了两条：

1. **应用内插件页**：首次启动应用（空 `DSH_HOME`）会初始化 `desktop` profile（bundles 含 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app`）；设置 → 插件 → 已安装插件能看到 `dsh-wallpaper-bg`，描述与启用开关正常。
2. **桌面端自带 CLI**：完全退出应用后执行
   `resources/runtime/cli/bin/dsh.cmd plugin --profile desktop add dsh-wallpaper-bg@0.5.16`，依赖与 bundles 正确写入；重启应用后插件生效。

| 检查 | 结果 |
| --- | --- |
| 应用启动 | 成功；渲染页 URL 为 `dsh-app://app/` |
| 内部 Web 服务 | 端口为随机值（本次 51272 / 63908 / 56220，每次重启都变），不是 19387 |
| `GET /dsh-wallpaper-bg/health` | 在随机端口上返回 200 JSON |
| 壁纸层 | `.wbg-layer` 注入，内置壁纸显示 |
| 设置 → 壁纸 | 面板完整；10 张缩略图最终全部加载 |
| 选择壁纸 + 重启 | `localStorage` 中 `builtin-2` 保留，背景恢复；渲染页 origin 固定 `dsh-app://app` |
| 插件页 | 列出 `dsh-wallpaper-bg`，可启用 / 停用 |
| 控制台 | 无异常 |

### 3.2 失败场景

| 场景 | 结果 |
| --- | --- |
| 空 `DSH_HOME` 下先用**桌面端自带 CLI**装插件 | 明确提示 `Open DeepSeek Harness Desktop once to initialize its profile, then fully quit it...`，退出码 1 |
| 空 `DSH_HOME` 下先用**旧版全局 dsh 0.1.x** 装插件 | 生成了缺少 `@deepseek-ai/dsh-web-app` 的 desktop profile；应用启动报 `Cannot read properties of undefined (reading 'authenticatedUrl')`。已写入文档提醒 |
| 桌面端插件页在未登录时 | 先显示登录 / API Key 欢迎页；这是 DSH 自身首次启动流程，可「稍后配置」进入主界面 |

## 4. 记录的问题与处理

| # | 严重度 | 问题 | 证据 | 处理 |
| --- | --- | --- | --- | --- |
| 1 | 高 | `/asset` 可读任意本地文件 | `GET /asset?path=C:\Windows\win.ini` 返回 200 + 文件内容 | 改为「WE 清单白名单」：只登记 `/we` 返回的 `filepath` / `thumbnail` / `previewFile`，30 分钟过期；清单外 403 |
| 2 | 中 | WE 错误横幅显示 `[object Object]` | 把 `<code>` 元素拼进字符串，React 转成 `[object Object]`，排查入口不可见 | 改为独立 React child；有缓存 / 无缓存两处都修 |
| 3 | 中 | 修改基地址后错误横幅仍显示旧地址 | 输入 18088，横幅显示 8088 | 显示「本次请求地址，上次成功 …」；「已自动发现」只在真发现时出现 |
| 4 | 中 | 宿主半网络错误只有 `fetch failed` | `/we?base=18088` 返回 `{"error":"fetch failed"}` | 翻译 ECONNREFUSED / 超时 / ENOTFOUND / ECONNRESET，附基地址与下一步 |
| 5 | 中 | 文档称桌面端固定 19387 | 0.2.1-rc.3 实际用 `--port 0`，本次随机端口 51272/63908/56220 | README / 安装 / 架构 / 故障排查 / WE 文档统一改为「0.2.0-rc.2 及更早 19387；0.2.1+ 见启动日志」；并纠正「端口稳定所以数据保留」为「渲染页 origin 固定 `dsh-app://app`」 |
| 6 | 中 | 桌面端 CLI 首次使用缺少前提说明 | 空 home 下桌面端 CLI 明确报错；旧全局 CLI 会生成坏 profile | 安装文档补「先打开一次桌面端初始化 profile，再完全退出」与旧版全局 CLI 的风险 |
| 7 | 中 | 自定义上传不校验内容 | 任意文件都会入库；损坏图片选中后黑屏且无提示 | 上传前按 MIME / 扩展名 / 空文件过滤，并用 Image / video metadata 真正解码一次；失败列出文件名与原因 |
| 8 | 低 | CLI 帮助仍在教 clone + npm install + .bat | `--help` / `status` / 安装完成提示共 4 处 | 改为安装 `dsh-wallpaper-engine-api` 插件（随 DSH 启停） |
| 9 | 低 | `verify-host.mjs` 固定挂 1 项 | 「auto 与指定显示器是两份缓存」断言把 auto 缓存命中误判为失败 | 改为「指定显示器首次不复用 auto 缓存」+「auto 缓存仍命中」两条断言；18/18 通过 |

### 保留的已知限制

- **内置壁纸依赖 Unsplash**：冷启动时 10 张缩略图约 5 秒才全部加载，期间是空白卡片（有标题，无骨架屏）。断网时内置壁纸不可用，建议用自定义上传。未在 0.5.17 改，避免为一张远程图引入本地打包体积。
- **设置面板在亮壁纸上的对比度**：面板仍使用半透明表面（layer-2 × 遮罩），亮壁纸下左侧导航文字对比度偏低。这是「界面半透明」的物理上限；改遮罩会连带影响侧栏 / 上传遮罩，故保留现状。

## 5. 回归结果

| 测试 | 结果 |
| --- | --- |
| `node verify-host.mjs` | 18 passed, 0 failed |
| `node verify-integration.mjs` | 7 passed, 0 failed |
| `node verify-service.mjs` | 29 passed, 0 failed |
| `dsh-wallpaper-engine-api`: `node test/run.mjs` | 13 passed, 0 failed |
| `node --check lib/client.js` / `lib/host.js` / `bin/dsh-wallpaper-bg.js` | 通过 |
| 网页端 UI（选择 / 上传 / WE / 错误态） | 通过 |
| 桌面端 UI（插件页 / 壁纸面板 / 重启持久化） | 通过 |

## 6. 发布

上述 9 项修复进入 **0.5.17**；`CHANGELOG.md` 的「未发布」条目已按本报告整理。可选插件 `dsh-wallpaper-engine-api` 本轮未发现需要改代码的问题，版本保持 0.1.1。
