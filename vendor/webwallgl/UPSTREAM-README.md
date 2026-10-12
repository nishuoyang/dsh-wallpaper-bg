# WebWallGL —— 浏览器端 WE 场景壁纸渲染库

**[简体中文](README.md) ｜ [English](README.en.md)**

## 简介

让 Wallpaper Engine 实现再次伟大！！！恭喜你发现宝藏，这是全网复刻程度最高，功能最强，更新最快的 Wallpaper Engine 自研核心库，纯 TypeScript/JS 实现。webwallgl 是一个浏览器端的 Wallpaper Engine「scene」场景、视频、web 网页壁纸渲染库：主要功能是把创意工坊场景包（scene.pkg）在 WebGL 里实时还原，支持图层效果链、粒子、3D 木偶骨骼、文字挂件、脚本沙箱、场景灯光（PBR 直射光）与 HDR 色调映射、音频响应与用户自定义属性热更新；网页类型壁纸经 sandbox iframe + 加载前 WE shim 注入运行。后续版本将加入本库独有效果支持，请敬请期待。下游如果进行了库的引用，麻烦给个 star，非常感谢！

- [GitHub 开源仓库](https://github.com/oneincase/webwallgl)
- [在线版（GitHub Pages）](https://oneincase.github.io/webwallgl/)

- 零运行时依赖，单文件引入（min ESM 约 1075KB / gzip 约 331KB）
- 可 npm 安装，也可 &lt;script> CDN 引入；一页可开多个互不干扰的实例
- 本测试台本身就是库的第一个使用者 —— 你在这里看到的能力都是公共 API

## 能做什么

WebWallGL 是一个「壁纸兼容渲染核心」——凡是需要「动态背景」的地方，都可以塞一个 WebWallGL 实例进去：

- 壁纸软件：桌面壁纸引擎（Tauri / Electron / WebView 壳）的核心渲染器，完整还原 WE 创意工坊场景
- 网页：个人主页、落地页、产品官网的动态背景或全屏 hero 区块
- 各类代码工具：仪表盘、监控大屏、终端（如 GUI 启动器/开发工具）的背景层
- 背景插件：音乐播放器可视化、直播 OBS 背景板、数字标牌、kye/小部件引擎的嵌入渲染源

一句话：万物皆可 Wall。你的应用只负责提供一块 canvas 和场景包的来源，剩下的解析、装配、渲染循环、脚本沙箱、指针与音频，全部交给 WebWallGL。

## 安装

三种引入方式，任选其一（CDN 示例按当前发布版本固定）：

```
// 1) npm + 打包器（推荐）
npm i webwallgl           // 追最新版；锁定测试版用 npm i webwallgl@beta
import { mount, httpSource } from "webwallgl";
```

```
// 2) ESM CDN（jsDelivr，vite/webpack 之外的直引方式）
import { mount, httpSource } from "https://cdn.jsdelivr.net/npm/webwallgl@2.1.0/webwallgl.min.mjs";
```

```
<!-- 3) UMD <script>：暴露全局 WebWallGL -->
<script src="https://cdn.jsdelivr.net/npm/webwallgl@2.1.0/webwallgl.global.min.js"></script>
<script>
  const { mount, httpSource } = WebWallGL;
</script>
```

## 快速开始

一个 canvas + 一个资源来源就是全部。mount() 在首帧真正画出来之后 resolve：

```
<canvas id="wp" style="width:100%;height:400px"></canvas>

import { mount, httpSource } from "webwallgl";

const wp = await mount(document.querySelector("#wp"), {
  source: httpSource("https://cdn.example.com/wallpapers/3122339805"),
  fps: 60,
});

// 首帧之后实例即可用：
wp.pause();
wp.resume();
wp.setProperties({ schemecolor: "0.5 0.2 0.8" });
console.log("实测帧率", wp.stats.fps);
```

画布的 CSS 尺寸就是渲染尺寸：库把 backing store 对齐 clientWidth/clientHeight，容器改大小后画面宽高比自动跟随，不需要手动 resize。

## 挂载目标：canvas 还是容器 div

mount() 的第一个参数收任意 HTMLElement，不限于 canvas。传 canvas 就直接用它；传普通容器（div 等）则库在其内部自建一块铺满的 canvas（带 data-webwallgl 标记，重复挂载会复用同一块，容器若是 position:static 会被改成 relative）。

选哪个不是风格问题——**网页类型壁纸必须传容器**。网页壁纸不走 WebGL，库会把 sandbox iframe 直接 appendChild 进你传的元素；canvas 不能有子元素，传 canvas 会挂不上。如果同一段代码要同时应付场景壁纸和网页壁纸（例如一个通用壁纸播放器），一律传 div 最稳妥：

```
<!-- 通用写法：两类壁纸都能挂 -->
<div id="wp" style="position:relative;width:100%;height:400px"></div>

// 场景壁纸：库在 div 内自建 canvas
// 网页壁纸：库在 div 内挂 sandbox iframe
const wp = await mount(document.querySelector("#wp"), {
  source: httpSource("https://cdn.example.com/wallpapers/2517518192"),
});

// wp.canvas 始终可读：场景路径是那块真 canvas，网页路径是你传入的容器
console.log(wp.canvas);
```

- 类型不用你判断：mount() 先取 project.json，type 为 "web" 走网页路径，其余一律走场景装配
- 网页入口 URL 的解析顺序是 Source.webEntry() → {httpSource 基址}/{project.file 或 index.html}；两者都给不出就抛错
- 网页路径下 fit / renderDpr / features 这些 WebGL 侧选项自然不适用；pause/resume、setVolume、setProperties 仍然有效（同源经 shim 直访转达给作者代码；跨源或 webSandbox: "strict" 时自动改走 postMessage 控制通道，指针/滚轮/音频/媒体同此）

## 资源来源 Source

库对网络只发少量请求（scene.pkg 或松散工程目录里的散装文件，外加可选的 project.json），所以资源抽象只有一个接口、三个内置实现：

| 工厂 | 用途 |
| --- | --- |
| `httpSource(baseUrl, init?)` | HTTP 基址；**自动识别两种场景形态**：包容器（scene.pkg → scenes/scene.pkg → gifscene.pkg 回退）与松散工程目录（按 project.json 的 file 逐文件取） |
| `fileSource(file, project?)` | &lt;input type=file> 或拖拽进来的 .pkg 本地文件 |
| `bytesSource(pkg, project?, key?)` | 已经拿到字节（bundle 内嵌、IndexedDB 缓存、自定义通道） |

```
// 本地文件：拖一个 scene.pkg 进页面即可预览
input.addEventListener("change", () => {
  const src = fileSource(input.files[0]);
  mount(canvas, { source: src });
});
```

- httpSource 必须先试根目录 scene.pkg，且每个 fetch 单独容错 —— WKWebView/自定义协议对缺失路径抛 Failed to fetch 而不是 404，顺序错了会「一片壁纸全坏」
- **形态判定只看 project.json 的 file 后缀**：`.json` → 松散工程目录（WE 编辑器工程/官方内置工程在盘上就是散装目录，无需打包），`.pkg` → 容器；缺失或其它值按容器走。松散入口取不到时**自动回退容器**（真实库里大量条目的 project.json 声明 file: "scene.json" 而盘上只有 scene.pkg）
- 松散形态要求宿主按相对路径提供文件（`GET {mediaBase}/{itemId}/&lt;path>` 这条路由本来就够用，无需新增端点）；贴图缺 .tex 时按 materials/&lt;名>.png|jpg 回退，与源码工程一致
- source.key 参与库内解析缓存：相同 key 的包不会重复解析（暂停/改属性零网络）；松散形态缓存的是已取到的文件字节
- 松散形态的两处已知差异（都只在松散形态、都有诊断可查）：① 没有目录清单 ⇒ 不做「全量预载 pkg 里所有字体」那一手，运行期切到未引用的字体时回落系统字体（本机 17 个松散条目 0 个带 fonts/）；② 脚本 thisScene.createLayer("models/…") 的存在性判定改成「乐观创建 + 异步取回校验」，缺资产时撤销该层并报一条 warn（包形态仍是同步精确判定）
- project 缺失是常态：没有属性表时场景字段用 scene.json 内的快照值

## 挂载选项 MountOptions

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `source（必填）` | `—` | 见上节 Source |
| `fit` | `"cover"` | cover 等比裁切铺满 / contain 等比留边 / stretch 拉伸 |
| `renderDpr` | `0（自动）` | 渲染 DPR：0=跟随设备 devicePixelRatio（Retina/HiDPI 原生清晰）；正数=目标 DPR，可高于设备上报值（宿主 WKWebView 误报 1 时仍能超采样到物理分辨率）。物理最长边封顶 4096，调低省显存。该档位同时决定贴图资源倍率（档位越低，贴图按图层足迹选得越小，见下节「显存与清晰度」） |
| `fps` | `60` | 帧率上限；被上限跳过的帧不计入 stats.fps，掉帧一眼可见 |
| `volume` | `0` | 0..1。默认静音起步（浏览器自动播放策略）；就绪后再设非零音量 |
| `autoplay` | `true` | false 时挂载后保持暂停 |
| `properties` | `{}` | 初始用户属性覆盖值（键为属性名） |
| `pointer / audio / media` | `内置` | 指针跟随 canvas；音频/系统媒体无注入时为占位源（频谱恒静默、「无媒体」快照，壁纸显示作者烘焙的占位外观）；传 null 禁用 |
| `features` | `全开` | 调试开关：models / text / particles / effects / components |
| `webSandbox` | `"legacy"` | 网页壁纸 iframe 沙箱档：legacy = allow-scripts + allow-same-origin（默认，与 WallpaperEM 一致）；strict = 只给 allow-scripts（宿主与壁纸共享 origin 时，防作者脚本以宿主身份调用宿主 API）。strict 下控制/指针/滚轮/音频/媒体自动改走 postMessage 通道，API 面完全一致 |
| `quality` | `全默认` | 渲染质量档位（对标 WE 客户端性能选项）：antiAliasing: "off"（默认）/"fxaa"/"msaa2"/"msaa4"、particles: "high"（默认）/"medium"/"low"/"off"（低/中档按倍率同时缩数量上限与发射率）、postProcessing: "high"（默认）/"medium"/"low"/"off"（低/中档压效果链 FBO 分辨率；off=效果链直通+跳整屏后期层+关 Bloom）。超采样走 renderDpr |
| `videoTexScale` | `0` | 视频纹理上传倍率：`0` = 自动（帧率守门按实测帧率往下压），正数 = 固定（1 = 不压最清晰、0.5 = 半幅）。macOS WKWebView 下逐帧 `texImage2D(视频帧)` 要把像素**同步**取回页面进程，代价随像素数线性（全屏视频层 2570×1446 → 16fps，1285×723 → 29fps，上限 30），全屏视频层只有压尺寸这一条路。**显式值优先于自动下坡**（画质页「视频纹理清晰度」就是它） |
| `autoQuality` | `true` | 自动降档（**只填你没显式指定的键**）：① 探到**软件渲染（无 GPU）**时自动关后处理并把画布 DPR 压到 0.5；② 运行期帧率连续 3 秒低于上限 85% 时把后处理降一档（high→medium→low→off，只降不升，每档间隔 6 秒）；③ 后处理已到底仍不够、且这个场景确实在逐帧传视频纹理时，继续把**视频纹理上传倍率**往下压（1→0.5→0.35：WKWebView 下逐帧 texImage2D 的同步取像素代价随像素数线性，这是唯一的减压手段）。显式的 quality.postProcessing 永远优先；传 false 整体关闭（query ?autoq=0 同效）。实际生效值读 getQuality() |
| `bake` | `true` | 贴图烘焙（B3）：内嵌 PNG/JPEG 的**预缩放缓存**，默认开（传 false / query ?bake=0 关闭）。内嵌图的现状路径是「解全尺寸再缩」，实测大图最贵的就是这一步；命中缓存后只做一次解码（52 张内嵌图实测解码 470ms → 94ms，-80%；端到端 TTFF 热加载 -14%，冷加载与不烘持平），**像素与不烘时逐位一致**（缓存存的是处理完 EXIF 回滚后的最终位图）。未命中走原路径并把结果排进后台队列（首帧后才开跑，不拖慢本次加载）；键 = 壁纸指纹 + 贴图指纹 + 资源档位，窗口缩放不会导致重烘 |
| `onReady / onError / onDiagnostic` | `—` | 回调面；也可之后用 instance.on() 订阅 |

显存与清晰度：显存的大头是纹理与画布/效果链缓冲，两者都随挂载选项自动伸缩，不需要手动管理——

- 贴图按「清晰度 × 图层在屏幕上的实际足迹」自动选分辨率：只要贴图分辨率 ≥ 图层的设备像素足迹，画面与全分辨率素材逐像素一致——省掉的只是过采样。有 mip 链的图直接截链（零重采样），单级大图才重采样
- 压缩纹理（DXT1/3/5、BC7、ETC2）按文件自带的 mip 链直传给 GPU，不解成 RGBA；单通道 R8 走 GL_R8 直传。浏览器不支持对应扩展时自动回退解码路径，观感不变
- 上传完成后立即释放 CPU 侧解码副本（多帧动画 .tex 除外），最坏单墙可省数百 MB
- 白名单不缩：LUT 数据栅格、多帧动画、视频纹理保持原样；法线/蒙版可降但有独立下限。挂载后 window.__memStats() 给出 pkg/解码/上传的分项台账
- window.__memStats().bake 是**贴图烘焙的正式统计**：{ enabled, backend, hits, misses, baked, failed, bytesMB, ms }。backend 如实报缓存落在哪（cache-api = 跨页面/跨启动持久，memory = 仅本页，off = 烘焙已关）；hits/misses 是内嵌图的命中率，baked/bytesMB/ms 是首帧之后后台补烘的量与耗时。诊断文本（bake: …）与这个字段同源
- 低内存设备的推荐组合：清晰度 0.8 + 质量 low（粒子/后处理 low、抗锯齿关）。4K 屏上画布与效果链 FBO 才是大头（随 DPR 平方增长，MSAA4 再 ×4），纹理反而是其次
- 性能与省电：三个杠杆，数字都是本机实测（Apple M5，真 GPU 与 SwiftShader 两档）——
- ① **帧率上限**（fps: 30）：scene 壁纸稳态 CPU 降 25~38%（847 层的实时太阳系 73%→46%、效果链重的 Persona 5 场景 59%→45%），代价是 30fps 的观感；网页壁纸几乎无效（负载在壁纸自己的进程里，实测 89%→89%）
- ② **后处理档位**（quality.postProcessing）：off 稳定省 25~40% CPU，并把掉到 43fps 的场景拉回 60。粒子档**除 off 外基本无效**（1630 live 粒子的场景：high 85.8% / medium 84.9% / off 14.2% —— medium 是安慰剂，off 会让雪/雨/火花整片消失），所以自动降档只走后处理
- ③ **无 GPU（软件渲染）**：后处理 off **加**画布 DPR 0.5 缺一不可 —— 单用 pp=off 是 16fps、单用 DPR 0.5 仍是 0fps、两者同时 46fps。这一对由 autoQuality 在挂载期自动套用（显式指定则不覆盖）
- ④ **视频纹理上传**（WKWebView 专属坑）：WebGL 在 GPU 进程、页面在 WebContent 进程，逐帧 `texImage2D(视频/画布)` 要把像素**同步**取回本进程，代价随该帧像素数线性。实测（macOS 14" XDR，DPR2，画布 2570×1669，fps 上限 30）：上传 2570×1446 时主线程每帧堵 ~40ms（**16~17fps**，后处理从 medium 降到 off 帧率纹丝不动 —— 这条路径不受后处理档影响）、压到 1285×723 → 29fps、899×506 → 30fps（满帧），同一页面同配置在 Chromium 直接满帧。**根因与解**：WebKit 下 `texImage2D(canvas)` 要把位图**同步**取回页面进程（`RemoteNativeImageProxy::platformImage`，实测 3024 宽上传每帧堵主线程 40~80ms），而 `texImage2D(视频元素)` 走加速面 —— 实测同一场景同尺寸**每帧只要 1~2ms**、满分辨率 3024×1701 也能 30fps 满帧（主线程最长停顿 11~12ms），把 fps 上限调到 60 更是 60fps 满帧。所以改成**直传视频元素优先**，直传失败（个别 WebView）才回退离屏 canvas 中转；另外视频纹理按**图层屏幕足迹**封顶（需要多少传多少），并给帧率守门加了第二段下坡（1 → 0.5 → 0.35，仅在直传不可用、后处理又已到底时才介入）

## 实例 API SceneInstance

| 成员 | 说明 |
| --- | --- |
| `pause() / resume() / paused` | 暂停恢复。禁止整包重挂：恢复时视频/音频从暂停点继续 |
| `setFit(fit) / setFps(n) / setVolume(v)` | 热更新，无需重挂载（渲染循环每帧读取） |
| `setRenderDpr(dpr)` | 改 DPR 需重建画布，内部自动重挂（pkg 缓存命中，不重新下载） |
| `setQuality(patch) / getQuality()` | 质量档位热更（部分更新），就地生效不重挂载；换场景/load() 后保持 |
| `setProperties(props)` | 属性热更新：就地改属性表/效果常量/脚本沙箱，不重新拉包 |
| `getProperties()` | 当前生效的扁平化属性值表 |
| `setAudio(src)` | 换音频频谱源（拉模式，每帧一次）；null 回落内置静默占位。换场景不清空。scene 与 web 都生效 |
| `setMedia(src)` | 换系统媒体源（Now Playing）；scene 与 web 共用同一实例，换场景不清空 |
| `media` | 媒体控制面：读 snapshot，以及 skipNext / skipPrevious / play / pause / playPause 反向控制 |
| `pushPointer(u, v, buttons?, mods?)` | 外部指针注入（u/v 为 0..1 归一化；mods 为 ctrl/shift/alt/meta 掩码）。用于窗口收不到鼠标的宿主；scene 与 web 均生效 |
| `pointerLeave()` | 指针离开：只清按键、保留最后位置（清位置会让视差与 xray 明显抽一下） |
| `pushWheel(dx, dy, mode?, mods?)` | 滚轮 / 触摸板注入（仅网页壁纸）。dy 正=内容向下；Mac 触摸板双指捏合映射成 mods 的 ctrl 位 |
| `setOcclusion(payload | null)` | 遮挡推送（V5）：宿主枚举上层窗口矩形（换算到壁纸窗口 CSS 像素）后推入，库按精确可见比例自动分档 —— ≤5% 暂停、≤30% 压帧到 24、≤70% 压到 40，进入立即、退出走对称滞回（各档退出阈 = 本档入阈 + 0.05：0.10/0.35/0.75）并逐级上爬 + 400ms 驻留（分档用遮挡分解的精确比例而非 Lively 式网格覆盖 —— 网格量化误差 ±2 tile 边会越过滞回带，网格只保留为对照读数）；暂停时媒体同步停、可见区外的图层跳过渲染（ROI 裁剪）。null 恢复全量；推送需 ≤2s 心跳，3 秒无推送自动恢复（fail-open）。挂载选项 occlusion 可调阈值，false 关闭 |
| `load(source)` | 换场景，复用同一 canvas 与 WebGL 上下文；首帧后 resolve |
| `release() / restore()` | 释放显存但保留配置（显示器睡眠）/ 用保留的配置重建 |
| `destroy()` | 终态：释放资源、解绑监听，之后实例不可再用 |
| `stats / info` | 实测帧率（{fps, running}，停了会归零而不是冻住；遮挡态另有 occluded / throttled 两个标志位——宿主看门狗据此区分「主动降载」与「故障停帧」）/ 场景基本信息（逻辑分辨率、图层数、是否含模型/粒子/文字） |
| `on(ev, fn)` | 订阅 ready / error / diagnostic，返回取消函数 |

## 用户属性 properties

用户属性就是 WE 里作者暴露给观众的那些设置项（颜色、开关、滑条、下拉），定义在 project.json 的 general.properties。键是属性名（作者自定的，常见形态是 schemecolor、newproperty12 这类），值必须按属性类型给对应的标量：

| 属性类型 | 传什么 | 示例 |
| --- | --- | --- |
| `color` | 字符串 "r g b"，三个 0..1 浮点用空格分隔（不是 #RRGGBB，也不是 0..255） | `"0.5 0.2 0.8"` |
| `bool` | 布尔 | `true` |
| `slider` | 数字，落在作者定义的 min/max 内 | `100` |
| `combo` | 选项值；选项为整数时给 number（整数字符串也认） | `1` |
| `textinput / file / directory` | 字符串 | `"https://…/clock.png"` |

```
// 先看这张壁纸有哪些属性、当前值是什么
console.log(wp.getProperties());
// → { schemecolor: "0 0 0", newproperty12: true, … }

// 再按名字改（只传要改的，其余保持不动）
wp.setProperties({ schemecolor: "0.5 0.2 0.8", newproperty12: false });
```

- 属性名逐壁纸不同，没有跨壁纸通用的名字——先 getProperties() 读一遍再改，不要硬编码猜名字
- 写一个当前场景没有的名字不会报错：值会照样进属性表（换场景后可能被用上），但对当前画面无任何影响——拼错名字的症状是「调了没反应」而不是异常
- setProperties() 是就地热更新：改属性表、效果常量与脚本沙箱，不重新拉包也不重新解析
- 没有 project.json 的壁纸也能跑：此时属性表为空，场景字段一律用 scene.json 里的快照值

## 三类壁纸：scene / video / web

类型不用你判断：mount() 先取 project.json，按其中的 type 分流 —— web 走 sandbox iframe，video / gif / image 走媒体路径，其余一律走场景装配。三类都用同一个 mount()、同一个 SceneInstance，pause/resume、setVolume、stats 等成员通用。

```
// 同一段代码挂任意类型（记得传容器 div，见上一节）
const wp = await mount(document.querySelector("#wp"), {
  source: httpSource("https://cdn.example.com/wallpapers/3789109327"),
});
console.log(wp.info); // { width, height, layerCount, ... }
```

- 视频壁纸的资源地址由 Source.mediaEntry() 给出；httpSource 已实现（读 project.json 的 file 字段拼 {基址}/{file}）
- 放任意视频/图片用 mediaSource()：mediaSource(url) 或 mediaSource(file)，按扩展名自动判类型，无需 project.json
- project.type 若已显式声明则永远优先，嗅探只在它缺失时兜底——有些场景壁纸的 project.file 指向 .mp4（那是场景内的视频纹理素材，不是「这张壁纸是个视频」）
- 媒体壁纸需要 WebGL2；不可用时走 onError 交给调用方决定，库不自作主张换 DOM 渲染
- pause/resume、setVolume、setFps、setFit 对媒体壁纸同样生效（setVolume 直接控制 &lt;video> 的 volume 与 muted）

```
import { mount, mediaSource } from "webwallgl";

// 远程视频：按扩展名判类型，签名 URL 的 ?query 会被正确剥掉
await mount(box, { source: mediaSource("https://cdn/clip.mp4?token=…") });

// 本地导入：拖拽或 <input type=file> 进来的视频/图片
input.addEventListener("change", async () => {
  const wp = await mount(box, { source: mediaSource(input.files[0]) });
  // destroy() 时库会自动 revoke 内部创建的 objectURL
});

// 扩展名不可靠时显式指定
mediaSource(streamUrl, { type: "video" });
```

## 系统媒体（Now Playing）与反向控制

「正在播放」类壁纸要读歌名、歌手、进度、封面配色与歌词，部分还带上一曲/下一曲/播放暂停按钮。这些统一由一个 MediaSource 提供 —— **scene 与 web 壁纸共用同一个实例**，宿主只需维护一套 driver，两类壁纸看到同一份数据。

```
import { mount, createMediaSource } from "webwallgl";

// 只给你拿得到的字段，其余（配色、歌词行、trackIndex）由库补齐
const media = createMediaSource(
  { title: "夜航星", artist: "相位迁移", playing: true,
    position: 30, duration: 212,
    lyrics: [[0, "第一句"], [20, "第二句"]] },
  // 反向控制：壁纸里的按钮会调到这里，你转发给真实播放器
  { skipNext: () => player.next(),
    playPause: () => player.toggle() },
);

const wp = await mount(box, { source, media });

// 系统 Now Playing 变化时更新（歌词行会按 position 自动重算）
media.set({ title: "下一首", position: 0 });

// 也可以挂载后再装／换／撤
wp.setMedia(media);
wp.setMedia(null);        // 回落「无媒体」占位

// 宿主侧也能读快照与发控制指令
console.log(wp.media.snapshot.title);
wp.media.playPause();
```

- 五个配色字段必须是可链式调用的颜色对象（脚本会写 c.subtract(o).multiply(t).add(o)，给普通数组会 TypeError 熔断整个脚本）——用 createMediaSource 构造即自动满足；要手工构造时用导出的 mediaColor(r, g, b)，它接受 0..1 分量、{x,y,z} 或数组，返回带完整链式方法的对象
- 控制方法全是可选的：只提供元数据、不支持控制时，壁纸里的按钮点了静默无效，不会报错
- setMedia 换场景不清空，装一次对之后所有场景生效
- 视频壁纸的音频频谱会自动从 &lt;video> 取（音条能跟着视频里的音乐动），宿主已用 setAudio 显式注入时则不接管

## 注入指针与音频

壁纸宿主常常拿不到浏览器天然的输入：桌面壁纸叠在桌面 underlay 层，鼠标与滚轮事件被系统的桌面窗口吃掉；音频频谱也得由宿主自己采集。这几条通道都由实例方法喂进来。

```
// 指针：u/v 是 0..1 归一化坐标，buttons 同 MouseEvent.buttons
wp.pushPointer(0.5, 0.5, 0);   // 悬停在正中
wp.pushPointer(0.5, 0.5, 1);   // 按下左键
wp.pointerLeave();             // 鼠标移出（只清按键，保留最后位置）

// 滚轮 / 触摸板（仅网页壁纸）：dy 与 DOM deltaY 同向；mode 0=像素 1=行 2=页
wp.pushWheel(0, 100, 0, 0);    // 双指向下滚一格
wp.pushWheel(0, -50, 0, 1);    // Mac 双指捏合 = ctrl 位（mods bit0）

// 音频：拉模式，渲染循环每帧调一次 snapshot()
let latest = { left: new Float32Array(64), right: new Float32Array(64) };
wp.setAudio({ snapshot: () => latest });

// 例：订阅宿主的频谱推送后更新 latest
evtSource.onmessage = (e) => { latest = JSON.parse(e.data); };

wp.setAudio(null);             // 撤源，回落静默占位
```

- 指针注入与 canvas 自身的 DOM 监听并存，谁后写谁赢；scene 与 web 壁纸都生效，媒体壁纸没有指针概念，调用静默无效
- pushWheel 只对网页壁纸生效：场景壁纸没有滚轮 API（实测 194 张场景壁纸零消费）。网页侧会同时合成现代 wheel 与旧式 mousewheel——语料里唯一真正用滚轮的 360° 全景（3406740580）只听旧式，而 three.js OrbitControls 只听现代；不发 DOMMouseScroll，否则同一滚动会被处理两遍
- Mac 触摸板：双指滚动直接喂像素级 delta（mode=0）；双指捏合按浏览器约定映射成 ctrl+滚轮（mods bit0），OrbitControls / pano2vr 都靠它区分缩放与滚动
- 音频契约：left/right 各 64 段、值域 0..1。段数不足补零、超出截断；32/16 段降采样与响度、静音判定由库派生
- snapshot() 返回 null（或抛错）表示本帧无数据，引擎自动回落内置静默占位——宿主采集还没就绪时不必特殊处理
- setAudio 换场景不清空：装一次对之后 load() 的所有场景都生效
- 音频注入对 scene 与 web 壁纸都生效：网页侧经 iframe shim 的音频泵收到同一份数据；两个泵都逐帧选源，所以 mount() 之后再 setAudio 同样有效

## 事件与诊断

```
const off = wp.on("diagnostic", (msg, level) => {
  // level: "info" | "warn" | "error"
  console[level === "error" ? "error" : "log"]("[wp]", msg);
});
wp.on("error", (err) => showError(err));
wp.on("ready", (info) => {
  // info: { width, height, layerCount, hasModels, hasParticles, hasText }
});
```

级别由库自己声明（不是从文案里猜的）：`error` = 壁纸挂不上或已经死了、需要调用方介入（挂载失败、渲染循环终止、首帧超时、无容器 / 缺 src / WEBGL2 不可用）；`warn` = 画面受影响或有损降级、壁纸仍在跑（脚本没跑起来、资源缺失或解码失败、效果与贴图回退或跳过、文字被裁切、自动降档）；`info` = 过程与统计（尺寸、计数、命中、正常完成）。同一个级别也随旧的 `/diag` 像素上报发出（`/diag?msg=…&lvl=&lt;level>`），走中间件或内容服务器的宿主不必再对文案做关键字匹配。

库不自带降级页，也不向任何服务器上报：诊断与错误全部经回调交给你，渲染失败的兜底（提示、换壁纸、卸载实例）由调用方决定。

## 一页多实例

```
const a = await mount(c1, { source: httpSource(urlA) });
const b = await mount(c2, { source: httpSource(urlB) });
b.pause(); // 不影响 a
```

- 每个实例持独立的 Runtime：配置、帧率计、WebGL 上下文、属性表互不可见
- 指针事件挂在各自的 canvas 上，归一化坐标相对画布，不会截获整页输入
- 注意 WebGL 上下文数量：浏览器一般允许同页 8~16 个，超出会丢最旧的上下文

## 生命周期与缓存

- 解析后的 scene.pkg 按 source.key 缓存（最多 2 份）：暂停恢复、改属性、setRenderDpr 重挂都不重新下载
- release() 后 stats.running 变 false、读数归零 —— 停住的读数不该冻在最后一个值上
- destroy() 之后 canvas 归还给你，库不再碰它；可以再 mount() 一个新实例
- load() 换场景会把实例恢复成播放态（即使换之前是暂停的），要保持暂停就在 load() 之后再 pause() 一次
- load() 会重新套用挂载时传入的 properties，此前用 setProperties() 改的值不会延续到新场景——属性名本就是逐场景定义的，要沿用得自己在 load() 之后再设一次

## 故障排查

- 黑屏且 onError 报 WEBGL2_UNAVAILABLE：环境没有 WebGL2，库不做软件回退
- HTTP 404 加载失败：确认 httpSource 指向的目录里真的有 scene.pkg（三种布局会依次尝试，全部失败才报错）；源码工程（project.json 的 file 以 .json 结尾）则要确认该 json 与它引用的 materials/、models/、shaders/ 等文件都在同一目录下
- 松散工程渲染结果与打包版不一致：先确认形态判定的走向 —— project.json 的 file 以 .json 结尾就走松散、取不到入口才回退 scene.pkg；测试台/调试页加 `?form=pkg` 或 `?form=loose` 可强制单臂做 A/B（诊断里会打出 scene form: …）；本仓 `node scripts/verify-loose.mjs --headless` 会跑两形态的图层指纹与请求对照
- Failed to fetch 且无状态码：自定义协议/WKWebView 对缺失路径的行为，属正常容错路径，看最后一条错误即可
- stats.fps 为 0 但画面在动：读数是「真正提交渲染」的帧，标签页被遮挡时浏览器会暂停 rAF，属预期
- stats 报 occluded/throttled：遮挡分档在起作用（宿主推过 setOcclusion）。occluded=true 是遮挡暂停（画面停在最后一帧，撤载荷自动恢复，不需要 resume()）；throttled=true 是遮挡降帧（帧率上限被压低）。要复现/排查就开测试台工具条的「遮挡模拟」：HUD 实时显示档位、ROI 块数/面积（渲染器回报的精确分解）与图层剔除 c/g（分母 = 参与闸门的图层数），外加 tile 口径的覆盖率对照读数（对标 Lively 的 Grid Detection Overlay）。拖动遮挡窗可观察「ROI 面积 ≈ 可见面积」（吞洞会表现为 ROI 面积远超可见）
- 有声音但延迟起播：自动播放策略要求用户交互后才允许出声，volume 默认 0 正是为此
- 网页壁纸无音频/属性：入口 HTML 必须同源或 CORS 可读，库才能改写注入 WE shim；跨域不可读时会退回裸 iframe（无官方 API）。webSandbox: "strict" 不属此列：shim 照常注入、API 齐全，只是控制/音频/媒体走 postMessage 通道
- 网页壁纸相对资源 404：依赖 &lt;base href> 指回原站点目录；依赖 location.href 拼路径的壁纸在 blob 加载下可能异常

## 版本更新说明

当前版本 2.1.0（自 2.0.2 起 61 个提交）。这一版主线是「官方内置示例工程全量兼容」「引擎加固」与「松散目录形态」：官方 19 个内置源码工程（defaultprojects）从素模/错色恢复到官方画面，解析器与生命周期补上失控边界，场景壁纸不再需要打包 scene.pkg 也能装载。

- 官方内置示例工程全量兼容（F1–F50）：源码工程装载链、模型层走材质 shader + 多槽贴图、场景级相机路径与 usershadervalues 绑定、arsenal 的贴图/材质/光照链、引擎内置 shader 三档识别（工坊包里没有也能挂）、内置 generic shader 的逐像素复刻、粒子材质自带 shader + colorrandom 逐分量随机 —— eagleflag、fantasticcar、shimmering_particles、arsenal、ricepod 等从素模/错色恢复到官方画面。
- 深度与遮挡重做：层间深度持久化并按材质 depthtest/depthwrite 逐网格设置、贴着相机的壳不参与深度、混合 pass 不写深度、真 3D 模型帧内共享深度、透明像素不写深度 + 子网格按材质排序 —— neon_sunset 太阳外围黑方块、3477054430 城市盖住猫/树黑方块、3254178774 模型炸成碎三角不再复现。
- 引擎加固：素材可控字段的解析闸门（几十字节的畸形 .tex 不再把解析器拖到 OOM）、GL 资源登记表（卸载后资源确定性归零）、上下文丢失从静默冻结变成可见事件、实例终态与代际令牌（destroy 不再复活、多实例的调试面互不误删）、四条静默失败路径接一次性诊断。
- 松散目录形态：project.json 的 file 以 .json 结尾即按源码工程装载（materials/、models/、shaders/ 等按名取文件），无需打包 scene.pkg；测试台/调试页可加 ?form=pkg 或 ?form=loose 强制单臂做 A/B。
- 交互与文字：命中门槛改为祖先可见性 —— 隐形 Solid 点击区（3810092560 点击互动）照常可点；anchor:none 按文字对齐贴 origin，修 3509578940 文字时钟被剪贴蒙版抹掉，以及 3694771168 周几盒偏移与时钟黑字。
- Web 壁纸与宿主控制：相对 URL 逃出站点根时按官方语义夹回根（3650874083/3650880224 Blue Archive spine 整页黑屏）、站点根夹住支持宿主声明、__wp.setMediaControl 控制反转 + 媒体按钮点击推断（3794460976 音乐控制接入）、applyUserProperties 按官方字母序下发（corsair_collection 白屏）。
- 性能与内部收敛：粒子三线性插值的单元格角点缓存 —— 重粒子场景稳态 fps 25.6 → 29.5（+15.2%）；mulberry32 / parsePkg / linkProgram / mat4Mul 各四份拷贝分别收敛为一份。

每一次变化的症状、根因、影响面数字与验证方式都写在对应的提交信息里，完整历史见 GitHub 仓库的提交记录与 Release。

## 版权与合规

库代码 MIT。Wallpaper Engine 创意工坊素材（scene.pkg、贴图、音视频）版权归各自作者所有：请仅指向你自己拥有或已获授权的素材，不要把他人作品打包进你的产品或公网分发。

## 赞赏作者

如果这个渲染核心帮到了你的项目，欢迎请作者喝杯咖啡。扫描二维码即可赞赏，金额随意。

| 微信支付 | 支付宝 |
| --- | --- |
| ![微信支付赞赏码](https://raw.githubusercontent.com/oneincase/webwallgl/main/imgs/wechat.png) | ![支付宝赞赏码](https://raw.githubusercontent.com/oneincase/webwallgl/main/imgs/alipay.png) |
