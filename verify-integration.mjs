// 端到端验收：dsh-wallpaper-engine-api 插件（进程内 WE API）
//  → dsh-wallpaper-bg 宿主半的同源发现 + 错误透传。
//
// 不启动 DSH：两边都用最小 ctx / 真实 node:http 挂载，数据来自本机真实 WE 库。
// 用法：node verify-integration.mjs
//      WEAPI_REAL=0 node verify-integration.mjs   # 只跑「找不到 WE」链路（CI / 无 WE 机器）
import { createServer } from 'node:http'
import { Writable } from 'node:stream'
import { createWeApiService } from './dsh-wallpaper-engine-api/lib/we-api-service.js'
import hostPlugin from './lib/host.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (extra ? ' — ' + extra : '')) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')) }
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

/** 挂载主插件宿主半，返回 (path, headers) => Promise<Sink> */
function mountHost(origin) {
  let handler = null
  const ctx = {
    webServer: {
      getOrigin() { return origin },
      register(route) {
        if (route && route.kind === 'prefix' && route.path === '/dsh-wallpaper-bg') handler = route.handler
        return () => {}
      },
    },
    effect(fn) { return fn() },
    inject(_deps, cb) { return cb(this) },
  }
  hostPlugin.apply(ctx, {})
  if (!handler) throw new Error('无法挂载 /dsh-wallpaper-bg 路由')

  return async function call(path, headers = {}) {
    const res = new Sink()
    const finished = new Promise((resolve) => {
      res.on('finish', resolve)
      res.on('close', resolve)
      setTimeout(resolve, 15000)
    })
    await handler({ url: path, method: 'GET', headers }, res)
    await finished
    return res
  }
}

function discoveryServer(base) {
  return createServer((req, res) => {
    if (String(req.url || '').startsWith('/dsh-wallpaper-engine-api/status')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, base, status: 'running', discover: true }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end('{"ok":false}')
  })
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return 'http://127.0.0.1:' + server.address().port
}

const services = []
const servers = []
try {
  // 1) 真实 WE 库：主插件不传 base → 发现插件端口 → 列出壁纸 / 当前桌面壁纸
  if (process.env.WEAPI_REAL !== '0') {
    const real = createWeApiService({ port: 0 })
    services.push(real)
    await real.start()
    const status = await real.status()
    if (status.status !== 'running') {
      console.log('  SKIP 真实 WE 链路：' + (status.error || status.status))
    } else {
      const discovery = discoveryServer(status.base)
      servers.push(discovery)
      const discoveryOrigin = await listen(discovery)
      const call = mountHost(discoveryOrigin)

      const listRes = await call('/dsh-wallpaper-bg/we?action=list')
      const list = JSON.parse(listRes.text)
      ok('不传 base → 发现插件端口并列出壁纸',
        listRes.status === 200 && list.ok === true && Array.isArray(list.wallpapers) && list.wallpapers.length > 0,
        'count=' + (list.wallpapers ? list.wallpapers.length : 0) + ' weBase=' + list.weBase)
      ok('响应带回实际 weBase（插件端口）', list.weBase === status.base, 'weBase=' + list.weBase)
      ok('响应标记 discovered', list.discovered === true)

      const currentRes = await call('/dsh-wallpaper-bg/we?action=current')
      const current = JSON.parse(currentRes.text)
      ok('不传 base → 当前桌面壁纸也可用',
        currentRes.status === 200 && current.ok === true && Array.isArray(current.monitors) && current.monitors.length > 0,
        current.current ? 'title=' + current.current.title : 'current=null')
    }
  }

  // 2) 插件装好但找不到 WE：503 里的可操作原因要透传到主插件，而不是只剩 "HTTP 503"
  const missing = createWeApiService({
    port: 0,
    weInstallPath: 'C:\\definitely-missing-wallpaper-engine',
    workshopPath: 'C:\\definitely-missing-workshop-library',
  })
  services.push(missing)
  await missing.start()
  const missingStatus = await missing.status()
  const discovery = discoveryServer(missingStatus.base)
  servers.push(discovery)
  const discoveryOrigin = await listen(discovery)
  const call = mountHost(discoveryOrigin)

  const errorRes = await call('/dsh-wallpaper-bg/we?action=list')
  const error = JSON.parse(errorRes.text)
  ok('找不到 WE 时 /we 返回 502', errorRes.status === 502)
  ok('可操作原因被透传（不是 "HTTP 503"）',
    error.ok === false && /Wallpaper Engine|创意工坊/.test(String(error.error)),
    String(error.error).slice(0, 80))

  // 3) 插件不存在（发现路由 404）→ 回退到默认 8088，行为与旧版一致
  const fallbackDiscovery = createServer((_req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end('{"ok":false}')
  })
  servers.push(fallbackDiscovery)
  const fallbackOrigin = await listen(fallbackDiscovery)
  const fallbackCall = mountHost(fallbackOrigin)
  const fallbackPing = JSON.parse((await fallbackCall('/dsh-wallpaper-bg/we?action=ping')).text)
  ok('没有 WE API 插件时回退默认 8088', fallbackPing.discovered !== true && fallbackPing.weBase === 'http://127.0.0.1:8088',
    'weBase=' + fallbackPing.weBase)
} finally {
  for (const service of services) await service.stop()
  for (const server of servers) await new Promise((resolve) => server.close(() => resolve()))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
