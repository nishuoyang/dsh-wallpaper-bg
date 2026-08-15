# legacy/ — 动态插件时代归档

本目录保存 v0.1.0 之前以 **DSH 动态 Cordis 插件**（`cordis_define`/`cordis_run`）形态运行的源码，仅作历史归档，不再维护。

- `src/` — 动态插件时代源码（TypeScript，当时不参与构建）
- `README.dynamic-plugin.md` — 当时的项目说明
- `package.dynamic.json` — 当时的 package.json
- `tsconfig.json` — 当时的类型检查配置

v0.1.0 起，插件本体是仓库根目录的**静态双半包**（`lib/host.js` + `lib/client.js`），
安装与使用方式见根目录 [README](../README.md)。
