# vendor/webwallgl — 内置的 WebGL2 场景渲染器

本目录是**上游第三方库的原样副本**，不是本项目的代码。dsh-wallpaper-bg 用它把 Wallpaper
Engine 的场景类壁纸（`scene.pkg`）在浏览器里用 GPU 实时渲染出来。

| 项 | 值 |
| --- | --- |
| 上游项目 | https://github.com/oneincase/webwallgl |
| npm 包 | [`webwallgl`](https://www.npmjs.com/package/webwallgl) |
| 版本 | **2.1.0** |
| 文件 | `webwallgl.min.mjs`（1,101,176 字节，ESM，零外部依赖） |
| sha256 | `217e54bdb1c3a7041c39bc8dd3fa4aff6333e8c6dcf87244c17504d1df9c2448` |
| 许可证 | MIT（见同目录 `LICENSE`） |
| 上游文档 | 见同目录 `UPSTREAM-README.md` |

## 它是怎么被加载的

宿主半（`lib/host.js`）注册了一条白名单路由：

```
GET /dsh-wallpaper-bg/vendor/webwallgl.min.mjs   → text/javascript（Cache-Control: max-age=86400）
```

客户端（`lib/client.js`）在第一次需要渲染场景壁纸时动态 `import()` 它，然后：

```js
const wp = await lib.mount(layerEl, {
  source: lib.httpSource(weBase + '/files/' + id),   // WE API 服务的只读文件路由
  fps: sceneFps,      // 面板里的「场景帧率上限」
  volume: 0,          // 背景壁纸一律静音起步
  autoQuality: true,  // 软渲染 / 持续掉帧自动降档
})
```

任何一步失败（模块 404、`mount` 拒绝、20 秒没出首帧）都会回退到工坊预览图
（`preview.gif` / `preview.jpg`），并在设置面板里说明原因。

## 升级步骤（改动本目录时请一并更新）

1. `npm pack webwallgl@<新版本>`（或 `npm i webwallgl@<新版本>`）取到新的 `webwallgl.min.mjs`。
2. 覆盖同名文件，并同步更新本文件的**版本 / 字节数 / sha256**（`Get-FileHash -Algorithm SHA256`）。
3. 跑一次冒烟测试：`node .tmp-scene-poc/host-smoke.mjs`（校验路由、MIME、字节一致性、越权 404）。
4. 在真实壁纸上验收：至少一张场景壁纸能在页面里出首帧并稳定在设定帧率附近。

> 本目录只放**原样副本**：不要在这里改渲染器代码。需要改行为请在上游提 issue / PR，或在本插件侧
> （`lib/client.js` 的 `applySceneLive`）做适配。
