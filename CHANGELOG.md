# Changelog

本文件记录 dsh-wallpaper-bg 的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.1.0] - 2026-08-13

首个正式版：由动态插件形态重构为可常驻的 DSH 静态双半插件包。

### 新增

- 静态双半包结构：宿主半 `lib/host.js` + 浏览器半 `lib/client.js`（单文件 bundle，零构建）
- **`dsh-wallpaper-bg` CLI**：`install`（一键：ESM 权威解析探测 + 必要时建立 `.dsh\node_modules` 链接 + 复制 standard 预设并追加带标记的插件行）、`status`、`uninstall`
- 宿主路由：`/dsh-wallpaper-bg/health`、`/dsh-wallpaper-bg/we`（WE API 只读代理，5 分钟列表 / 10 秒当前壁纸缓存）、`/dsh-wallpaper-bg/asset`（本地文件流式代理，支持 Range，大视频不再整读内存）
- 三种壁纸来源：内置 10 张 Unsplash / 自定义上传（IndexedDB）/ WE 壁纸库（只读）
- 三种渲染：图片、视频（canvas + 30 FPS 上限 + cover 裁剪无黑边）、场景（官方预览图回退，GIF 保持动画）
- 四项调节：遮罩透明度、背景模糊度、背景亮度、安全放大（0–10% 裁边）
- 同步桌面壁纸开关（只读，30 秒轮询）
- 界面表面半透明化（主题 token 覆写，随 fiber 卸载自动恢复）
- 设置持久化（localStorage），并自动迁移旧端口 8080 → 8088
- `wallpaper-engine-api/` 本机只读服务（静默启动 + 开机自启脚本）

### 变更

- 安装方式：推荐 `npm install -g dsh-wallpaper-bg` + `dsh-wallpaper-bg install` 一键完成；也支持官方 `dsh plugin --profile web add` 装包 + 手动预设行
- 动态插件时代源码归档至 `legacy/`

### 修复

- 预设行下宿主半的服务获取方式：硬注入 `['config', 'webServer']`（读 `ctx.config` 必须声明 config 注入；宿主服务要走 inject——standing scope 下 `ctx.get('webServer')` 实测取不到，会导致路由静默缺失，标准预设行 dsh-tool-bash 同样硬注入 shell 等宿主服务）
- 安装位置误判：profile 启动的部署锚点是 `%USERPROFILE%\.dsh\profiles\web`（全局 npm 根不在其解析链上）
- 视频窗口化时右侧/底部黑边（画布位图拉伸 → 视口像素一一对应 + cover 源裁剪）
- 场景壁纸 `filepath` 缺失时无法回退缩略图
