// 旧版独立 WE API 服务（wallpaper-engine-api/server.js）的验收：列表字段 / 当前壁纸的显示器判定 /
// 网页文件路由（ETag·Range·垫片·Referer 兜底），以及「已移除」的端点（/scene-frame、/scene-anim、/capture 一律 404）。
//
// 注意：0.5.14 起推荐用配套插件 dsh-wallpaper-engine-api；它的等价验收在
// dsh-wallpaper-engine-api/test/run.mjs（离线 fixture，npm test），不需要启动任何独立服务。
//
// 用法：node verify-service.mjs                       （默认 127.0.0.1:8088）
//       WEAPI_BASE=http://127.0.0.1:8099 node verify-service.mjs
const BASE = (process.env.WEAPI_BASE || 'http://127.0.0.1:8088').replace(/\/+$/, '');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`); } else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); } };

const health = await (await fetch(BASE + '/health')).json();
console.log('health:', JSON.stringify(health).slice(0, 220));
ok('health version 0.5.1', health.version === '0.5.1');
ok('health webShim', health.webShim === 1);
ok('health monitorSelect (当前壁纸支持指定显示器)', health.monitorSelect === 1);
ok('health has no desktopCapture field (capture removed)', health.desktopCapture === undefined);
ok('no sceneRender field (renderer removed)', health.sceneRender === undefined);

const list = await (await fetch(BASE + '/api/wallpapers')).json();
ok('list count > 0', list.wallpapers.length > 0, `${list.wallpapers.length} items`);
ok('list has no sceneRender field (renderer removed)', list.sceneRender === undefined);
const scene = list.wallpapers.find((w) => w.type === 'scene');
const web = list.wallpapers.find((w) => w.type === 'web');
const video = list.wallpapers.find((w) => w.type === 'video');
ok('scene previewFile absolute', !!(scene && scene.previewFile && /^[A-Za-z]:\\/.test(scene.previewFile)));
ok('scene has no hasFrame field (renderer removed)', scene && scene.hasFrame === undefined);
ok('video item present', !!video);

// 当前桌面壁纸：必须明确「跟随哪台显示器」以及为什么（monitor / monitorSource），
// 并列出所有显示器供插件端做下拉（旧实现盲取 Monitor0，多屏用户会跟到另一台屏的旧壁纸）
const cur = await (await fetch(BASE + '/api/current')).json();
console.log('current:', JSON.stringify({ monitor: cur.monitor, source: cur.monitorSource, title: cur.current && cur.current.title, type: cur.current && cur.current.type }).slice(0, 200));
const SOURCES = ['manual', 'changed', 'live', 'first', 'none'];
ok('current ok', cur.ok === true);
ok('current.monitorSource valid', SOURCES.includes(cur.monitorSource), `source=${cur.monitorSource}`);
ok('current.monitors is array', Array.isArray(cur.monitors));
if (Array.isArray(cur.monitors) && cur.monitors.length) {
  ok('monitors[] entries have key/title/type/selected', cur.monitors.every((m) => typeof m.key === 'string' && 'title' in m && 'type' in m && typeof m.selected === 'boolean'));
  const chosen = cur.monitors.filter((m) => m.selected);
  ok('exactly one monitor selected', chosen.length === 1, `selected=${chosen.map((m) => m.key).join(',')}`);
  ok('current 与选中的显示器一致', !!cur.current && chosen.length === 1 && String(cur.current.title) === String(chosen[0].title), `monitor=${cur.monitor}`);
  if (cur.current && cur.current.type === 'scene') {
    const ps = cur.current.previewSize;
    ok('scene previewSize parsed (GIF/PNG/JPEG)', !!ps && ps.w > 0 && ps.h > 0, ps ? `${ps.w}x${ps.h}` : 'null');
  }
  // 显式指定显示器：manual 优先级最高，且必须真的换到那台
  const key0 = cur.monitors[0].key;
  const forced = await (await fetch(`${BASE}/api/current?monitor=${encodeURIComponent(key0)}`)).json();
  ok('monitor=<key> → manual 且切到该显示器', forced.monitorSource === 'manual' && forced.monitor === key0, `monitor=${forced.monitor}`);
  const num = /^Monitor(\d+)$/.exec(cur.monitors[cur.monitors.length - 1].key);
  if (num) {
    const byIndex = await (await fetch(`${BASE}/api/current?monitor=${num[1]}`)).json();
    ok('monitor=<数字> 也接受', byIndex.monitor === cur.monitors[cur.monitors.length - 1].key, `monitor=${byIndex.monitor}`);
  }
  const bogus = await (await fetch(`${BASE}/api/current?monitor=Nope`)).json();
  ok('无效 monitor 退回自动判定', bogus.ok === true && bogus.monitorSource !== 'manual', `source=${bogus.monitorSource}`);
} else {
  console.log('  (WE 里没有显示器壁纸记录，跳过 monitor 判定用例)');
}

// 桌面画面捕获（0.4.x 的 /capture）与旧的本地渲染路由必须彻底消失
// （场景改由工坊预览图显示，插件端不再采样桌面、不产生任何图片 / 视频垃圾）
for (const old of ['/capture', '/scene-frame/3422426571', '/scene-anim/3422426571', '/scene-anim/status']) {
  const r = await fetch(`${BASE}${old}`);
  ok(`${old} → 404 (removed)`, r.status === 404, `status=${r.status}`);
}

// 网页文件路由
if (web) {
  const idx = web.entry || 'index.html';
  const url = `${BASE}/files/${web.id}/${idx.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
  const h = await fetch(url, { headers: { 'sec-fetch-dest': 'iframe' } });
  const body = await h.text();
  ok('web index 200', h.status === 200, `bytes=${body.length}`);
  ok('web shim injected', body.includes('__wbgWeShim'), `etag=${h.headers.get('etag')} cache=${h.headers.get('cache-control')}`);
  const etag = h.headers.get('etag');
  const h304 = await fetch(url, { headers: { 'if-none-match': etag } });
  ok('web conditional 304', h304.status === 304);

  const probe = await fetch(`${BASE}/files/${web.id}/`);
  const names = [...(await probe.text()).matchAll(/"([^"]+\.(?:png|jpg|jpeg|gif|webp|mp3|ogg|wav|js|css|woff2?|ttf))"/gi)].map((m) => m[1]);
  if (names.length) {
    const a = `${BASE}/files/${web.id}/${names[0].split(/[\\/]/).map(encodeURIComponent).join('/')}`;
    const hr = await fetch(a, { headers: { Range: 'bytes=0-99' } });
    ok('asset range 206', hr.status === 206, `${names[0]} len=${(await hr.arrayBuffer()).byteLength}`);
  } else {
    console.log('  (no static asset listed to test Range)');
  }

  const hr2 = await fetch(`${BASE}/files/assets/definitely-missing.png`, { headers: { Referer: `http://127.0.0.1:8088/files/${web.id}/index.html` } });
  ok('referer fallback handled (404 file, not 400 id)', hr2.status === 404, `status=${hr2.status}`);
} else {
  console.log('  (no web wallpaper to test)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
