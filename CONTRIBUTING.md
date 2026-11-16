# Contributing to dsh-wallpaper-bg

Thanks for your interest! This is a small, single-maintainer project — bug reports, feature ideas and pull requests are all welcome. Chinese and English are equally fine.

> 中文版在下方 → [参与贡献](#参与贡献)

## Ways to contribute

| | |
| --- | --- |
| **Bug report** | Use the [bug report form](.github/ISSUE_TEMPLATE/bug_report.yml). Environment details are usually what makes a bug reproducible. |
| **Feature request** | Use the [feature request form](.github/ISSUE_TEMPLATE/feature_request.yml). Describing the problem you want solved helps more than the solution alone. |
| **Pull request** | Small, focused diffs get reviewed and merged much faster. For anything large, open an issue first so we can agree on the approach before you write code. |
| **Docs** | [`README.md`](README.md) (Chinese) and [`README.en.md`](README.en.md) (English) are kept in sync — please update both. |

Found a security problem? **Do not open a public issue** — see [`SECURITY.md`](SECURITY.md).

Everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requirements: Windows + Node.js ≥ 20 for the WE API service; the DSH plugin itself is platform-independent. Windows is also what the `.bat` / `.vbs` scripts are for.

```powershell
git clone https://github.com/nishuoyang/dsh-wallpaper-bg
cd dsh-wallpaper-bg

# dev-install the plugin into your local DSH (junction — edits take effect immediately)
powershell -ExecutionPolicy Bypass -File .\install-local.ps1

# optional: the read-only Wallpaper Engine service behind the "WE library" source
cd wallpaper-engine-api
npm install
# then double-click 启动服务.bat once — the first run writes we-api.config
```

There is no build step: `lib/host.js` and `lib/client.js` are shipped as-is.

## Testing

Please actually run what you changed, and say so in the PR description.

- **WE API service** — with the service up on `127.0.0.1:8088`, `node verify-service.mjs` runs the end-to-end contract checks (wallpaper list fields, `/api/current`'s monitor resolution and `?monitor=` override, the web-wallpaper file route with ETag / Range, and the removed endpoints — `/capture`, `/scene-frame`, `/scene-anim` — returning `404`). Note that it asserts the **service** version (`0.5.1`), which is versioned separately from the plugin version. Use `WEAPI_BASE=http://127.0.0.1:8099` to point it at a throwaway instance instead of the live one.
- **Plugin host half** — `node verify-host.mjs` mounts `lib/host.js` with a minimal `ctx` and drives its real routes with fake `req` / `res` (no DSH needed): `/health` capability flags, `monitor` forwarding plus per-monitor caching on `/we?action=current`, the wallpaper list, and the `/asset` proxy.
- **Plugin UI** — switch sources in 设置 → 壁纸 and describe what you saw. Screenshots or a short recording are very welcome for UI changes.
- **Batch scripts** — double-click the `.bat` you touched, including the first-run wizard path (run `启动服务.bat` with no `we-api.config` present).

## Ground rules

- **Keep the read-only promise.** The project never sets or changes your desktop wallpaper, never writes into the Wallpaper Engine installation, and the local service binds to `127.0.0.1` only. PRs that break this will not be merged.
- **Don't commit `node_modules/`** or generated caches (`~/.dsh-wallpaper-bg`).
- **`we-api.config` and `we-api.log` are per-machine files** — never commit them, not even as examples.
- **Windows batch gotcha** — inside a `( ... )` block an unescaped `(` or `)` in an `echo` line makes CMD close the block early and abort the whole script. Escape them as `^(` / `^)`. This has bitten us before ([#1](https://github.com/nishuoyang/dsh-wallpaper-bg/pull/1)).

## Changelog

User-visible changes need an entry in [`CHANGELOG.md`](CHANGELOG.md), in Chinese, matching the existing sections. Changes that only touch docs or internal tooling can skip it — but please say so in the PR.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), with Chinese subject lines (the house style):

```
feat: 播放队列、视频支持与双语文档（v0.3.3）
fix(release): 发布脚本 Run 丢参数 / stderr 误判失败 / Release 附件缺失
chore: 新增一键发布脚本 scripts/release.ps1
```

## Releases

Maintainers only. Add the `## [x.y.z] - YYYY-MM-DD` entry to `CHANGELOG.md` first — the script refuses to release without it and uses that entry verbatim as the GitHub Release notes.

```powershell
.\scripts\release.ps1 -DryRun -Version x.y.z   # rehearse: checks only, no changes
.\scripts\release.ps1 -Version x.y.z           # bump → commit → tag → push → npm → GitHub Release
```

An interrupted run is resumed with `.\scripts\release.ps1 -Resume`. All flags are documented in the script header.

---

# 参与贡献

感谢关注！这是一个单人维护的小项目，issue、PR 都欢迎，中文英文都可以。

> English version above ↑

## 你能帮上忙的地方

- **报 bug** —— 用 [bug 模板](.github/ISSUE_TEMPLATE/bug_report.yml)，环境信息填得越全，定位越快。
- **提需求** —— 用 [feature 模板](.github/ISSUE_TEMPLATE/feature_request.yml)，说清楚你想解决的问题，比直接给方案更有用。
- **提 PR** —— 改动越小越聚焦，合得越快；要做大改动请先开 issue 对一下思路，别写完再返工。
- **文档** —— [`README.md`](README.md)（中文）和 [`README.en.md`](README.en.md)（英文）要保持同步，改一个记得改另一个。

发现安全问题**不要**开公开 issue，走 [`SECURITY.md`](SECURITY.md)。参与本项目请遵守[行为准则](CODE_OF_CONDUCT.md)。

## 本地开发

需要 Windows + Node.js ≥ 20（仅 WE API 服务需要，插件本身不分平台；`.bat` / `.vbs` 脚本是 Windows 专属）。

```powershell
git clone https://github.com/nishuoyang/dsh-wallpaper-bg
cd dsh-wallpaper-bg

# 把插件以开发模式装进本机 DSH（junction，改完立刻生效）
powershell -ExecutionPolicy Bypass -File .\install-local.ps1

# 可选：支撑「WE 壁纸库」来源的只读服务
cd wallpaper-engine-api
npm install
# 然后双击一次 启动服务.bat，首次运行会写入 we-api.config
```

没有构建步骤：`lib/host.js` 和 `lib/client.js` 就是发布产物。

## 测试

请真的跑一遍你改的东西，并在 PR 描述里写清楚。

- **WE API 服务** —— 服务跑在 `127.0.0.1:8088` 上时，`node verify-service.mjs` 做端到端契约校验（列表字段、`/api/current` 的显示器判定与 `?monitor=` 覆盖、网页文件路由的 ETag / Range、已移除端点 `/capture` / `/scene-frame` / `/scene-anim` 一律 `404`）。注意它断言的是**服务版本**（`0.5.1`），服务版本和插件版本是两条线；用 `WEAPI_BASE=http://127.0.0.1:8099` 可以指向临时实例而不是正在用的那一份。
- **插件宿主半** —— `node verify-host.mjs` 用最小 `ctx` 挂载 `lib/host.js`，拿假 `req` / `res` 打真实路由（不需要 DSH）：`/health` 能力位、`/we?action=current` 的 `monitor` 透传与按显示器分缓存、壁纸列表、`/asset` 代理。
- **插件界面** —— 在 设置 → 壁纸 里切一遍来源，说明你看到的现象；界面改动请附截图或短录屏。
- **批处理** —— 双击你改过的 `.bat`，包括首次运行向导那条路径（在没有 `we-api.config` 的情况下跑 `启动服务.bat`）。

## 底线

- **别破坏只读承诺**：本项目不设置、不更换桌面壁纸，不写入 Wallpaper Engine 安装目录，本地服务只监听 `127.0.0.1`。破坏这一点的 PR 不会被合并。
- **不要提交 `node_modules/`** 和生成的缓存（`~/.dsh-wallpaper-bg`）。
- **`we-api.config` / `we-api.log` 是本机文件**，连示例都不要提交。
- **批处理的括号坑**：`( ... )` 块内的 `echo` 行里，未转义的 `(` `)` 会让 CMD 提前闭合代码块并中止整个脚本，必须写成 `^(` / `^)`。这个坑踩过（[#1](https://github.com/nishuoyang/dsh-wallpaper-bg/pull/1)）。

## 更新日志

用户可见的改动要在 [`CHANGELOG.md`](CHANGELOG.md) 里加条目，用中文，格式照现有章节。只改文档或内部工具可以不加，但请在 PR 里说明。

## 提交信息

[Conventional Commits](https://www.conventionalcommits.org/)，主题用中文（本仓库习惯）：

```
feat: 播放队列、视频支持与双语文档（v0.3.3）
fix(release): 发布脚本 Run 丢参数 / stderr 误判失败 / Release 附件缺失
chore: 新增一键发布脚本 scripts/release.ps1
```

## 发布

仅维护者。先在 `CHANGELOG.md` 里写好 `## [x.y.z] - YYYY-MM-DD` 条目 —— 没有条目脚本会拒绝发布，而 GitHub Release 说明直接取自该条目。

```powershell
.\scripts\release.ps1 -DryRun -Version x.y.z   # 先预演：只检查不产生改动
.\scripts\release.ps1 -Version x.y.z           # 改版本号 → 提交 → 打标签 → 推送 → npm → GitHub Release
```

中断了用 `.\scripts\release.ps1 -Resume` 续跑，全部参数见脚本头部注释。
