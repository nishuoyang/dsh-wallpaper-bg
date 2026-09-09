// 场景帧渲染 worker: 把 SceneRenderer 的同步 CPU 渲染移到 worker 线程,
// 避免阻塞 DSH 主进程事件循环 (大型壁纸渲染数秒~数十秒).
// 三种模式: 单帧 (time) / 多帧动画 APNG (times) / 逐帧写盘做视频烘焙 (times + framesDir)
import fs from 'node:fs'
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads';
import { SceneRenderer, encodePng } from './scene-renderer.js';
import { encodeApng, encodeIdat } from './apng-encode.js';
import { preloadGlsl } from './we-renderer/glsl/parser-loader.js';

const { src, width, height, time, times, weAssetsDir, frameDelayMs, videoFrames, autoTime, framesDir, sigWidth } = workerData;

// 预载可选 GLSL 解析器（第三方 workshop shader 效果）：装了才启用，
// 未装则渲染器照常输出，只是跳过未内置实现的效果（不报错）。
const glsl = await preloadGlsl();

try {
  // 单帧模式 (静态帧缓存)
  if (!times || !times.length) {
    const renderer = new SceneRenderer(src, { width, height, time, weAssetsDir, videoFrames, log: () => {} });
    // 静态帧时刻选择: 默认时刻落在眨眼闭眼相位时换一个睁眼时刻 (autoTime !== false)
    let stillTime = time;
    if (autoTime !== false) {
      stillTime = renderer.pickStillTime(time);
      if (stillTime !== time) renderer.setTime(stillTime);
    }
    const canvas = renderer.render();
    // 空帧门禁统计: 与 clearcolor 差异 < 0.05% 视为空白
    const cc = renderer.scene && renderer.scene.general && renderer.scene.general.clearcolor;
    const ccv = typeof cc === 'string' && cc.trim() ? cc.trim().split(/\s+/).map(Number) : [0, 0, 0];
    const cr0 = (ccv[0] || 0) * 255, cg0 = (ccv[1] || 0) * 255, cb0 = (ccv[2] || 0) * 255;
    const step = 8;
    let diff = 0, checked = 0;
    for (let y = 0; y < canvas.h; y += step) {
      for (let x = 0; x < canvas.w; x += step) {
        const i = (y * canvas.w + x) * 4;
        checked++;
        if (Math.abs(canvas.data[i] - cr0) > 24 || Math.abs(canvas.data[i + 1] - cg0) > 24 || Math.abs(canvas.data[i + 2] - cb0) > 24) diff++;
      }
    }
    const png = encodePng(canvas.w, canvas.h, canvas.data);
    parentPort.postMessage({ ok: true, png, diff, checked, stillTime }, [png.buffer]);
  } else if (framesDir) {
    // 视频烘焙模式: 逐帧写 PNG 到磁盘 (不把整段动画留在内存), 同时算每帧缩略签名
    // (32×18 RGB 均值), 交给主线程做「循环点检测」——找一个与首帧几乎相同的帧作为
    // 循环终点, 循环播放时不会看到跳变。
    const renderer = new SceneRenderer(src, { width, height, time: times[0], times, weAssetsDir, videoFrames, log: () => {} });
    const sw = Math.max(8, Number(sigWidth) || 32);
    const sh = Math.max(4, Math.round(sw * (height / Math.max(1, width))));
    const sigs = [];
    for (let i = 0; i < times.length; i++) {
      renderer.setTime(times[i]);
      const canvas = renderer.render();
      const png = encodePng(canvas.w, canvas.h, canvas.data);
      fs.writeFileSync(path.join(framesDir, 'f_' + String(i).padStart(5, '0') + '.png'), png);
      // 盒式降采样签名 (步进采样即可, 只用于帧间相似度比较)
      const sig = new Uint8Array(sw * sh * 3);
      const xStep = canvas.w / sw, yStep = canvas.h / sh;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const px = Math.min(canvas.w - 1, Math.floor((x + 0.5) * xStep));
          const py = Math.min(canvas.h - 1, Math.floor((y + 0.5) * yStep));
          const o = (py * canvas.w + px) * 4;
          const k = (y * sw + x) * 3;
          sig[k] = canvas.data[o]; sig[k + 1] = canvas.data[o + 1]; sig[k + 2] = canvas.data[o + 2];
        }
      }
      sigs.push(Array.from(sig));
      parentPort.postMessage({ progress: true, done: i + 1, total: times.length });
    }
    parentPort.postMessage({ ok: true, frames: times.length, sigWidth: sw, sigHeight: sh, sigs });
  } else {
    // 多帧模式: 复用单个 SceneRenderer (每帧只换 time), 避免每帧重读 pkg/重解码纹理
    // (大型 pkg 如 336MB 场景, 逐帧重建 = 每帧整包读取 + 全部纹理解码)
    // 传 times → staticFrame=false → 动画启用效果降采样加速 (sf38); 静态帧不降采样
    const renderer = new SceneRenderer(src, { width, height, time: times[0], times, weAssetsDir, videoFrames, log: () => {} });
    const frames = [];
    const total = times.length;
    for (let i = 0; i < total; i++) {
      renderer.setTime(times[i]);
      const canvas = renderer.render();
      // 立即压缩 → 释放原始帧 (4K 多帧峰值: 全帧 rgba 可达数 GB; 压缩后仅存 IDAT)
      frames.push({ idat: encodeIdat(width, height, canvas.data), delayMs: frameDelayMs || 100 });
      // 逐帧进度上报 (宿主 scene-anim 渲染进度条)
      parentPort.postMessage({ progress: true, done: i + 1, total });
    }
    const apng = encodeApng(width, height, frames);
    parentPort.postMessage({ ok: true, apng }, [apng.buffer]);
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
}
