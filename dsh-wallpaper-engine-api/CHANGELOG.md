# Changelog

本文件记录 dsh-wallpaper-engine-api 的用户可见变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.1.0] - 2026-10-18

### 新增

- **把 WE 壁纸库服务做成 DSH 插件**：在本机 `127.0.0.1:8088` 打开只读 WE API，随 DSH 启停；不再需要 clone 仓库、`npm install`、`.bat` 启动脚本或开机自启项。
- **同源状态路由** `GET /dsh-wallpaper-engine-api/status`：给 `dsh-wallpaper-bg` 自动发现实际端口、是否复用外部服务、错误原因。
- **端口礼貌处理**：8088 上已有旧 WE API → 直接复用；被无关程序占用 → 自动换到下一个端口 / 系统分配端口，不阻塞 DSH 启动。
- **Steam 库自动发现**：除注册表与常见目录外，还会读 `steamapps/libraryfolders.vdf`，覆盖装在第二个 Steam 库里的 Wallpaper Engine。
- **零运行时依赖**：直接解析 WE 的 `project.json` / `config.json`，不再依赖 `wallpaper-engine-api` npm 包。
- **容错**：缺少 WE、缺 `config.json`、单个 `project.json` 损坏都只反映在 `/health` / 面板错误里，不退出进程、不拖垮 DSH。
- 保留旧服务的全部只读端点与网页壁纸垫片，行为对齐 `wallpaper-engine-api` 0.5.1（`webShim: 1`、`monitorSelect: 1`）。
