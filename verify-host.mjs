// 宿主半（lib/host.js）验收：不启动 dsh，直接以最小 ctx 挂载插件，用假的 req/res 打真实路由。
// 覆盖：/health 能力标记、/we?action=current 的显示器透传与缓存维度、/we?action=list、/asset 代理。
//
// 前置：WE API 服务需要在跑（默认 http://127.0.0.1:8088）。
// 用法：node verify-host.mjs
//       WEAPI_BASE=http://127.0.0.1:8099 node verify-host.mjs
import { Writable } from 'node:stream'
import { readFileSync } from 'node:fs'
import plugin from './lib/host.js'

const WE_BASE = (process.env.WEAPI_BASE || 'http://127.0.0.1:8088').replace(/\/+$/, '')
// 版本断言跟 package.json 对齐：每次发版改版本号不用再回来改这里（改漏了就变成假失败）
const PKG_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  PASS ${name}${extra ? ' — ' + extra : ''}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`)
  }
}

// ---- 最小 ctx：抓住 webServer.register 的路由，effect 立即执行 ----
// 宿主半按需注入 webServer（ctx.inject：服务缺失时插件照样激活，只是不注册路由），
// 所以这里也要给一个 inject：服务已在位，直接同步回调。
let handler = null
const ctx = {
  webServer: {
    register(route) {
      if (route && route.kind === 'prefix' && route.path === '/dsh-wallpaper-bg') handler = route.handler
      return () => {}
    },
  },
  effect(fn) { return fn() },
  inject(deps, cb) { return cb(this) },
}
plugin.apply(ctx, { weBase: WE_BASE })
if (!handler) {
  console.error('无法从插件里取到 /dsh-wallpaper-bg 路由')
  process.exit(1)
}

class Sink extends Writable {
  constructor() {
    super()
    this.status = 0
    this.headers = {}
    this.chunks = []
  }
  writeHead(code, headers) {
    this.status = code
    this.headers = headers || {}
    return this
  }
  _write(chunk, _enc, cb) {
    this.chunks.push(Buffer.from(chunk))
    cb()
  }
  get body() { return Buffer.concat(this.chunks) }
  get text() { return this.body.toString('utf8') }
}

async function call(path, headers = {}) {
  const res = new Sink()
  const finished = new Promise((resolve) => {
    res.on('finish', resolve)
    res.on('close', resolve)
    setTimeout(resolve, 5000)   // 兜底：路由没结束响应也不要挂住
  })
  await handler({ url: path, method: 'GET', headers }, res)
  await finished
  return res
}

const health = JSON.parse((await call('/dsh-wallpaper-bg/health')).text)
console.log('host health:', JSON.stringify(health))
ok(`host version ${PKG_VERSION}`, health.version === PKG_VERSION)
ok('host monitorForward=1（monitor 会透传）', health.monitorForward === 1)

const auto = JSON.parse((await call('/dsh-wallpaper-bg/we?action=current&base=' + encodeURIComponent(WE_BASE))).text)
console.log('auto current:', JSON.stringify({ monitor: auto.monitor, from: auto.monitorSource, title: auto.current && auto.current.title, kind: auto.current && auto.current.kind }).slice(0, 200))
ok('current 带回 monitor / monitorSource / monitors', typeof auto.monitor === 'string' && typeof auto.monitorSource === 'string' && Array.isArray(auto.monitors))
ok('current 条目被归一化（有 kind）', !!(auto.current && auto.current.kind), auto.current && auto.current.kind)
ok('monitors 至少一台', auto.monitors.length >= 1, `${auto.monitors.length} 台`)
if (auto.current && auto.current.kind === 'scene') {
  ok('场景条目带回 previewSize', !!(auto.current.previewSize && auto.current.previewSize.w > 0))
}

const first = auto.monitors[0] && auto.monitors[0].key
if (first) {
  const forced = JSON.parse((await call(`/dsh-wallpaper-bg/we?action=current&monitor=${encodeURIComponent(first)}&base=${encodeURIComponent(WE_BASE)}`)).text)
  ok(`monitor=${first} 透传到服务并生效`, forced.monitor === first && forced.monitorSource === 'manual', `monitor=${forced.monitor} source=${forced.monitorSource}`)
  const cached = JSON.parse((await call(`/dsh-wallpaper-bg/we?action=current&monitor=${encodeURIComponent(first)}&base=${encodeURIComponent(WE_BASE)}`)).text)
  ok('同显示器第二次命中宿主缓存', cached.fromCache === true)
  const autoAgain = JSON.parse((await call('/dsh-wallpaper-bg/we?action=current&base=' + encodeURIComponent(WE_BASE))).text)
  ok('auto 与指定显示器是两份缓存（切换即生效，不吃上一台的缓存）', autoAgain.fromCache === false || autoAgain.monitor !== forced.monitor, `monitor=${autoAgain.monitor} fromCache=${autoAgain.fromCache}`)
  const refresh = JSON.parse((await call(`/dsh-wallpaper-bg/we?action=current&monitor=${encodeURIComponent(first)}&refresh=1&base=${encodeURIComponent(WE_BASE)}`)).text)
  ok('refresh=1 绕过宿主缓存', refresh.fromCache === false)
}

const list = JSON.parse((await call('/dsh-wallpaper-bg/we?action=list&base=' + encodeURIComponent(WE_BASE))).text)
ok('壁纸列表可用', list.ok === true && Array.isArray(list.wallpapers) && list.wallpapers.length > 0, `${list.wallpapers && list.wallpapers.length} 张`)

if (auto.current && auto.current.previewFile) {
  const asset = await call('/dsh-wallpaper-bg/asset?path=' + encodeURIComponent(auto.current.previewFile))
  ok('本地资源代理（/asset）可用', asset.status === 200 && asset.body.length > 0, `${asset.status} ${asset.headers['Content-Type']} ${asset.body.length}B`)
} else {
  console.log('  (当前壁纸没有 previewFile，跳过 /asset 用例)')
}

const missing = await call('/dsh-wallpaper-bg/asset?path=' + encodeURIComponent('E:\\definitely-missing.png'))
ok('/asset 不存在文件 → 404', missing.status === 404)

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
