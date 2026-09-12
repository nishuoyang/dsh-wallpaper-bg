// 重建后的 WE API 服务验收：列表字段 / 场景帧（受 WE_SCENE_RENDER 开关控制）/
// 网页文件路由（ETag·Range·垫片·Referer 兜底）
const BASE = 'http://127.0.0.1:8088';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); } else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); } };

const health = await (await fetch(BASE + '/health')).json();
console.log('health:', JSON.stringify(health).slice(0, 200));
ok('health version 0.3.1', health.version === '0.3.1');
ok('health webShim', health.webShim === 1);
ok('health sceneRender is 0 or 1', health.sceneRender === 0 || health.sceneRender === 1, `sceneRender=${health.sceneRender}`);
const SCENE_RENDER_ON = health.sceneRender === 1;
if (SCENE_RENDER_ON) {
  ok('health puppetAnim', health.puppetAnim === 2);
  ok('health sceneAnim', health.sceneAnim === 1);
  ok('health sceneFrameCache path', typeof health.sceneFrameCache === 'string' && health.sceneFrameCache.length > 0);
} else {
  ok('health puppetAnim 0 when render off', health.puppetAnim === 0);
  ok('health sceneAnim 0 when render off', health.sceneAnim === 0);
  // 默认关：不报告缓存目录路径（服务没有创建 ~/.dsh-wallpaper-bg）
  ok('health sceneFrameCache null when render off', health.sceneFrameCache === null);
}

const list = await (await fetch(BASE + '/api/wallpapers')).json();
ok('list count > 0', list.wallpapers.length > 0, `${list.wallpapers.length} items`);
ok('list sceneRender matches health', (list.sceneRender === 1) === SCENE_RENDER_ON, `sceneRender=${list.sceneRender}`);
const scene = list.wallpapers.find((w) => w.type === 'scene');
const web = list.wallpapers.find((w) => w.type === 'web');
const video = list.wallpapers.find((w) => w.type === 'video');
ok('scene hasFrame true', scene && scene.hasFrame === true, scene && scene.id);
ok('scene previewFile absolute', !!(scene && scene.previewFile && /^[A-Za-z]:\\/.test(scene.previewFile)));
ok('video hasFrame false', video && video.hasFrame === false);

// 场景帧（开关关闭时：403 + 不建缓存；开启时：完整渲染契约）
if (!SCENE_RENDER_ON) {
  const rd = await fetch(`${BASE}/scene-frame/${scene.id}?w=640&t=2.5`);
  ok('scene-frame 403 when render off', rd.status === 403, `error=${(await rd.json()).error}`);
  const ad = await fetch(`${BASE}/scene-anim/status`);
  ok('scene-anim/status 403 when render off', ad.status === 403);
  const as = await fetch(`${BASE}/scene-anim/${scene.id}?w=1920&fps=24&dur=4`);
  ok('scene-anim 403 when render off', as.status === 403, `status=${as.status}`);
} else {
const r1 = await fetch(`${BASE}/scene-frame/${scene.id}?w=640&t=2.5`);
ok('scene-frame 200', r1.status === 200, `mode=${r1.headers.get('x-scene-mode')} bytes=${(await r1.arrayBuffer()).byteLength}`);
ok('scene-frame still-time header', r1.headers.get('x-scene-still-time') !== null, `still=${r1.headers.get('x-scene-still-time')}`);
const r1b = await fetch(`${BASE}/scene-frame/${scene.id}?w=640&t=2.5&auto=0`);
ok('scene-frame auto=0 keeps t', r1b.status === 200 && r1b.headers.get('x-scene-still-time') === '2.50', `still=${r1b.headers.get('x-scene-still-time')}`);
const r2 = await fetch(`${BASE}/scene-frame/999999999`);
ok('scene-frame unknown id 404', r2.status === 404);
const r3 = await fetch(`${BASE}/scene-frame/3025895136?w=640`);
ok('scene-frame render 200', r3.status === 200, `mode=${r3.headers.get('x-scene-mode')}`);
// 眨眼场景: 默认时刻闭眼 → 自动换到睁眼时刻 (3422426571 小鸟游星野)
const r4 = await fetch(`${BASE}/scene-frame/3422426571?w=640&t=2.5&refresh=1`);
const still4 = Number(r4.headers.get('x-scene-still-time'));
ok('blink scene picks open-eye time', r4.status === 200 && still4 > 0 && Math.abs(still4 - 2.5) > 0.05, `still=${still4}`);

// 退化帧门禁 + 负缓存：3562086244 渲染出来是「白底 + 少量文字」的退化帧，
// 应被门禁拦下（422 → 插件端回退工坊预览图），且第二次请求走负缓存秒回。
const r5t0 = Date.now();
const r5 = await fetch(`${BASE}/scene-frame/3562086244?w=2560&t=2.5&refresh=1`, { signal: AbortSignal.timeout(120000) });
const r5ms = Date.now() - r5t0;
ok('degenerate frame rejected', r5.status === 422, `${(r5ms / 1000).toFixed(1)}s ${(await r5.text()).slice(0, 80)}`);
const r6t0 = Date.now();
const r6 = await fetch(`${BASE}/scene-frame/3562086244?w=2560&t=2.5`);
const r6ms = Date.now() - r6t0;
ok('degenerate negative-cached', r6.status === 422 && r6ms < 2000, `repeat ${r6ms}ms`);

// 场景动画烘焙（/scene-anim）：状态查询 + 已烘焙视频（本机已烘焙 3422426571 小鸟游星野）
const animQ = 'w=1920&fps=24&dur=4';
const a1 = await fetch(`${BASE}/scene-anim/3422426571?${animQ}`);
const a1j = await a1.json();
ok('scene-anim status 200', a1.status === 200 && a1j.ok === true, `state=${a1j.state}`);
ok('scene-anim baked state', a1j.state === 'done' && !!a1j.meta && a1j.meta.frames > 0,
  `frames=${a1j.meta && a1j.meta.frames} dur=${a1j.meta && a1j.meta.durationSec}s ${a1j.meta && a1j.meta.width}px`);
const a2 = await fetch(`${BASE}/scene-anim/3422426571/video.mp4?${animQ}`);
const a2buf = await a2.arrayBuffer();
ok('scene-anim video 200', a2.status === 200 && a2.headers.get('content-type') === 'video/mp4' && a2buf.byteLength > 100000,
  `${(a2buf.byteLength / 1048576).toFixed(1)}MB`);
const a3 = await fetch(`${BASE}/scene-anim/3422426571/video.mp4?${animQ}`, { headers: { Range: 'bytes=0-99' } });
ok('scene-anim video range 206', a3.status === 206 && (await a3.arrayBuffer()).byteLength === 100);
const a4 = await fetch(`${BASE}/scene-anim/999999999?${animQ}`);
ok('scene-anim unknown id 404', a4.status === 404);
const a5 = await fetch(`${BASE}/scene-anim/status`);
const a5j = await a5.json();
ok('scene-anim job list', a5.status === 200 && Array.isArray(a5j.jobs), `${a5j.jobs ? a5j.jobs.length : 0} jobs`);
}

// 网页文件路由
if (web) {
  const idx = web.entry || 'index.html';
  const url = `${BASE}/files/${web.id}/${idx.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
  const h = await fetch(url, { headers: { 'sec-fetch-dest': 'iframe' } });
  const body = await h.text();
  ok('web index 200', h.status === 200, `bytes=${body.length}`);
  ok('web shim injected', body.includes('__wbgWeShim'), `etag=${h.headers.get('etag')} cache=${h.headers.get('cache-control')}`);
  ok('web cache-control no-cache', h.headers.get('cache-control') === 'no-cache');
  const etag = h.headers.get('etag');
  const h304 = await fetch(url, { headers: { 'if-none-match': etag } });
  ok('web conditional 304', h304.status === 304);

  // Range 支持（静态资源；HTML 因注入垫片会改变长度，按整体发送）
  const assetUrl = `${BASE}/files/${web.id}/index.html`;
  const hr0 = await fetch(assetUrl, { headers: { Range: 'bytes=0-99' } });
  ok('web html served whole (injected)', hr0.status === 200 && (await hr0.arrayBuffer()).byteLength > 100);
  // 找一个同目录的静态资源来验 Range
  const probe = await fetch(`${BASE}/files/${web.id}/`);
  const names = [...(await probe.text()).matchAll(/"([^"]+\.(?:png|jpg|jpeg|gif|webp|mp3|ogg|wav|js|css|woff2?|ttf))"/gi)].map((m) => m[1]);
  if (names.length) {
    const a = `${BASE}/files/${web.id}/${names[0].split(/[\\/]/).map(encodeURIComponent).join('/')}`;
    const hr = await fetch(a, { headers: { Range: 'bytes=0-99' } });
    ok('asset range 206', hr.status === 206, `${names[0]} len=${(await hr.arrayBuffer()).byteLength}`);
  } else {
    console.log('  (no static asset listed to test Range)');
  }

  // Referer 兜底：/files/assets/... 形式（首段非数字）
  const hr2 = await fetch(`${BASE}/files/assets/definitely-missing.png`, { headers: { Referer: `http://127.0.0.1:8088/files/${web.id}/index.html` } });
  ok('referer fallback handled (404 file, not 400 id)', hr2.status === 404, `status=${hr2.status}`);
} else {
  console.log('  (no web wallpaper to test)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
