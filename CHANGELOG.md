# Changelog

本文件记录 dsh-wallpaper-bg 的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

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
