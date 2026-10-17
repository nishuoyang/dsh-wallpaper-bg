# 发布流程与 CI

> 适用版本：dsh-wallpaper-bg 0.5.15。本页说明仓库自带的一键发布脚本与两个 GitHub Actions 工作流。

- [scripts/release.ps1](#scriptsreleaseps1)
- [预检与断点续跑](#预检与断点续跑)
- [CI 工作流](#ci-工作流)
- [legacy 目录](#legacy-目录)

## scripts/release.ps1

仓库自带一键发布脚本 `scripts/release.ps1`，固化「版本校验 → 打包预检 → 提交 → 打标签 → 推送 → npm publish → GitHub Release（附 tarball）」：

```powershell
.\scripts\release.ps1 -DryRun              # 先预演：只检查不产生改动
.\scripts\release.ps1 -Version x.y.z       # 改版本号并发布
.\scripts\release.ps1                      # 发布 package.json 里的当前版本
.\scripts\release.ps1 -Resume              # 上次中断后续跑
```

## 预检与断点续跑

预检会拒绝重复发布（本地 / 远端已有标签、npm 上已有该版本），并校验 `CHANGELOG.md` 已写好对应版本条目——Release 说明直接取自该条目。另有 `-SkipNpm` / `-SkipGitHub` / `-SkipPush` / `-Yes` 可选。

`npm publish` 成功后注册表要几分钟才可见（npm 自己会提示 "may take a few minutes"），所以脚本会轮询等待（`-NpmWaitSeconds`，默认 300 秒）而不是查一次就中断；等不到也只警告并继续发 GitHub Release，且 GitHub Release 这一步是幂等的（已存在就补传附件）。

万一流程还是中断了，用 `-Resume` 续跑：它要求工作区干净、标签指向 HEAD，跳过已经成功的步骤（提交 / 打标签 / 推送 / 发布）只补剩下的。

> 发版前请把 `CHANGELOG.md` 里的 `## [未发布]` 改成 `## [x.y.z] - YYYY-MM-DD`——脚本要求存在对应版本条目。

## CI 工作流

`.github/workflows/` 下另有两个工作流，都是**手动 / 按需触发**，用来把 npm 与 GitHub 两侧的关联做实：

| 工作流 | 文件 | 触发 | 作用 |
| --- | --- | --- | --- |
| Publish to npm | `publish-npm.yml` | 手动（`workflow_dispatch`） | 用仓库的 OIDC 身份发布到 npmjs，npm 会自动附带 **provenance** 证明：包页面出现 "Built and signed on GitHub Actions" 徽章，点开直达本仓库 / commit |
| Mirror to GitHub Packages | `publish-github-packages.yml` | GitHub Release 发布后，或手动 | 以 `@nishuoyang/dsh-wallpaper-bg` 之名镜像发一份到 `npm.pkg.github.com`，让仓库右侧的 **Packages** 区块真正列出本包 |

用 `publish-npm.yml` 之前，需要在 npmjs.com 上配一次 trusted publisher（包页面 → Settings → Trusted Publisher → GitHub Actions：`nishuoyang` / `dsh-wallpaper-bg` / `publish-npm.yml`）。配好之后**不需要任何 token**（没有 `NPM_TOKEN` 也不用轮换；想走 token 方式则加一个同名仓库 secret，见工作流文件里的注释）。

它默认只手动触发，是为了绝不与 `release.ps1` 的本地 `npm publish` 抢同一个版本号；想把发布完全搬到 CI，就先 `.\scripts\release.ps1 -SkipNpm` 让本地跳过，再启用工作流里的 `push.tags` 触发。

镜像工作流用自带的 `GITHUB_TOKEN` 发布；首次发布默认可见性是 private，可在包设置里改成 public。注意 GitHub Packages 的 npm 源**即使包是 public，install 时也必须带 token**——所以对外安装始终走 npmjs（`dsh plugin add dsh-wallpaper-bg`，或桌面端插件页里填包名），镜像只为 GitHub 侧展示。

## 配套插件 dsh-wallpaper-engine-api

`dsh-wallpaper-engine-api/` 是独立 npm 包，**不随** `release.ps1` 发布（脚本只处理仓库根的 `dsh-wallpaper-bg`）。它需要单独发版：

```powershell
cd dsh-wallpaper-engine-api
npm test                     # 离线 fixture 验收
npm pack --dry-run           # 检查 files 列表
npm publish --access public
```

发版前把 `dsh-wallpaper-engine-api/CHANGELOG.md` 里的版本条目补齐，并确认 `package.json` 的 `files` 包含 `index.js`、`lib/`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、两个 README 与 LICENSE。主插件通过同源状态路由发现它，两者版本可以独立升级；只有契约（`/dsh-wallpaper-engine-api/status` 的 `base` 字段）变化时才需要同时升级主插件。

## legacy 目录

`legacy/` 目录存放 v0.1.0 之前的动态插件（Cordis dynamic package）时代源码，仅作归档。

---

相关：[安装与升级](installation.md) · [架构与原理](architecture.md) · [故障排查手册](troubleshooting.md)
