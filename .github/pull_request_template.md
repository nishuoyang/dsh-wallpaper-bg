<!-- Thanks for the PR! Please fill in what applies — delete the sections that don't. -->
<!-- 感谢提交 PR！按需填写，用不到的段落删掉即可。 -->

## What does this change? / 改了什么

<!-- A short summary. Link the issue it closes, if any: Closes #123 -->
<!-- 简要说明；有关联 issue 请写 Closes #123 -->

## Why? / 为什么

<!-- The problem this solves. "What" without "why" is hard to review. -->
<!-- 解决什么问题 —— 只说改了什么、不说为什么，评审会很吃力 -->

## How was it tested? / 怎么验证的

<!-- e.g. `node verify-service.mjs` output, manual steps in 设置 → 壁纸, screenshots / recordings -->
<!-- 例如 verify-service.mjs 的输出、设置 → 壁纸 里的手动步骤、截图或录屏 -->

- [ ] Ran it locally / 本地跑过：

## Checklist / 自查

- [ ] Focused diff — unrelated changes are in a separate PR / 改动聚焦，无关修改另开 PR
- [ ] `CHANGELOG.md` has an entry for user-visible changes (or this PR is docs/internal only) / 用户可见改动已写 CHANGELOG（或本 PR 只涉及文档/内部工具）
- [ ] `README.md` and `README.en.md` kept in sync / 中英文文档已同步
- [ ] Read-only promise preserved: no wallpaper changes, nothing written into the Wallpaper Engine install, service stays on `127.0.0.1` / 未破坏只读承诺
- [ ] No `node_modules/`, `we-api.config`, `we-api.log` or caches committed / 没有提交 node_modules 与本机文件
- [ ] Windows batch: `(` `)` inside `( ... )` blocks escaped as `^(` / `^)` / 批处理里的括号已转义
