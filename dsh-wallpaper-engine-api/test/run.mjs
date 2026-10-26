// dsh-wallpaper-engine-api 离线验收：用临时 fixture 模拟 Wallpaper Engine 目录，
// 不读取真实 WE 库、不占用 8088。覆盖：
//   /health 能力标记、列表与订阅过滤、当前壁纸与显示器参数、网页文件路由
//   （垫片 / ETag / Range / 路径越界 / 未订阅）、外部服务复用、端口回退、找不到 WE。
//
// 用法：npm test  或  node test/run.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import assert from 'node:assert/strict'
import { createWeApiService } from '../lib/we-api-service.js'

// 版本号只在 package.json 里维护，发版时不需要改测试
const pkgVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

let pass = 0
let fail = 0
const failures = []

async function check(name, fn) {
  try {
    await fn()
    pass++
    console.log('  PASS ' + name)
  } catch (error) {
    fail++
    failures.push({ name, error })
    console.error('  FAIL ' + name)
    console.error('       ' + String((error && error.stack) || error).split('\n').slice(0, 6).join('\n       '))
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function writeJson(file, value) {
  write(file, JSON.stringify(value, null, 2))
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server.address().port)
    })
  })
}

function close(server) {
  return new Promise((resolve) => {
    try { server.closeAllConnections?.() } catch { /* noop */ }
    try { server.close(() => resolve()) } catch { resolve() }
  })
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

async function request(base, pathname, init) {
  const response = await fetch(base + pathname, init)
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = null }
  return { status: response.status, headers: response.headers, text, data }
}

// ---------------------------------------------------------------------------
// fixture：一个完整的“Steam 库 + WE 安装 + 创意工坊壁纸 + 订阅清单”
// ---------------------------------------------------------------------------

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-we-api-test-'))
const steamRoot = path.join(root, 'steam')
const installPath = path.join(steamRoot, 'steamapps', 'common', 'wallpaper_engine')
const workshopPath = path.join(steamRoot, 'steamapps', 'workshop', 'content', '431960')
const subscriptionsFile = path.join(steamRoot, 'userdata', '12345', 'ugc', '431960_subscriptions.vdf')

const sceneDir = path.join(workshopPath, '1001')
const scenePkg = path.join(sceneDir, 'scene.pkg')
const webDir = path.join(workshopPath, '1002')
const hiddenDir = path.join(workshopPath, '1003')
const brokenDir = path.join(workshopPath, '1004')
const noProjectDir = path.join(workshopPath, '1005')

write(path.join(installPath, 'wallpaper64.exe'), '')
write(path.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders"\n{\n  "0" "' + steamRoot.replace(/\\/g, '\\\\') + '"\n}\n')
writeJson(path.join(sceneDir, 'project.json'), {
  title: 'Fixture Scene',
  type: 'scene',
  file: 'scene.pkg',
  preview: 'preview.gif',
  contentrating: 'everyone',
  tags: ['测试'],
  description: 'fixture scene',
})
write(path.join(sceneDir, 'preview.gif'), Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00\x3b', 'latin1'))
write(scenePkg, 'not-a-real-pkg')

writeJson(path.join(webDir, 'project.json'), {
  title: 'Fixture Web',
  type: 'web',
  file: 'index.html',
  contentrating: 'questionable',
})
write(path.join(webDir, 'index.html'), '<!doctype html><html><head><title>web</title></head><body><canvas></canvas><script src="app.js"></script></body></html>')
write(path.join(webDir, 'app.js'), 'console.log("fixture web wallpaper")\n')
write(path.join(workshopPath, '..', '..', '..', '..', 'secret.txt'), 'do not serve me')

writeJson(path.join(hiddenDir, 'project.json'), { title: 'Disabled', type: 'video', file: 'a.mp4' })
write(path.join(hiddenDir, 'a.mp4'), '')
writeJson(path.join(brokenDir, 'project.json'), '{ broken json')
write(path.join(noProjectDir, 'readme.txt'), 'no project.json')

write(subscriptionsFile, [
  '"AppWorkshop"',
  '{',
  '  "appid" "431960"',
  '  "1001" { "publishedfileid" "1001" }',
  '  "1002" { "publishedfileid" "1002" }',
  '  "1003" { "publishedfileid" "1003" "disabled_locally" "1" }',
  '  "1004" { "publishedfileid" "1004" }',
  '  "1005" { "publishedfileid" "1005" }',
  '  "1006" { "publishedfileid" "1006" }',
  '}',
  '',
].join('\n'))

const currentUser = os.userInfo().username
const selected = { Monitor0: { file: scenePkg } }
writeJson(path.join(installPath, 'config.json'), {
  [currentUser]: {
    general: {
      wallpaperconfig: { selectedwallpapers: selected },
      wallpaperconfigrecent: [
        { config: { selectedwallpapers: selected } },
        { config: { selectedwallpapers: selected } },
      ],
    },
  },
})

// ---------------------------------------------------------------------------
// 1) 正常服务
// ---------------------------------------------------------------------------

const service = createWeApiService({
  port: 0,
  weInstallPath: installPath,
  workshopPath,
  subscriptionsFile,
})
const extraServers = []

try {
  await service.start()
  const status = await service.status()
  const base = status.base

  console.log('service:', JSON.stringify({
    status: status.status,
    port: status.port,
    external: status.external,
    error: status.error,
  }))

  await check('health: 本进程在监听，能力标记齐全', () => {
    assert.equal(status.status, 'running')
    assert.equal(status.external, false)
    assert.equal(status.api, '0.5.1')
    assert.equal(status.webShim, 1)
    assert.equal(status.monitorSelect, 1)
    assert.equal(status.mode, 'readonly')
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.equal(status.weInstallPath, installPath)
    assert.equal(status.workshopPath, workshopPath)
    assert.equal(typeof status.weRunning, 'boolean')
  })

  await check('GET /health 返回只读模式与真实路径', async () => {
    const health = await request(base, '/health')
    assert.equal(health.status, 200)
    assert.equal(health.data.ok, true)
    assert.equal(health.data.mode, 'readonly')
    assert.equal(health.data.webShim, 1)
    assert.equal(health.data.monitorSelect, 1)
    assert.equal(health.data.weInstallPath, installPath)
    assert.equal(health.data.workshopPath, workshopPath)
    assert.equal(health.data.error, '')
  })

  await check('GET /api/wallpapers: 订阅过滤 + 损坏 project.json 跳过', async () => {
    const list = await request(base, '/api/wallpapers')
    assert.equal(list.status, 200)
    assert.equal(list.data.ok, true)
    assert.equal(list.data.count, 2)
    assert.equal(list.data.hiddenUnsubscribed, 1)
    assert.equal(list.data.skippedNoProject, 2)
    assert.deepEqual(list.data.wallpapers.map((item) => item.id).sort(), ['1001', '1002'])
    const scene = list.data.wallpapers.find((item) => item.id === '1001')
    assert.equal(scene.type, 'scene')
    assert.equal(scene.title, 'Fixture Scene')
    assert.equal(scene.filepath, scenePkg)
    assert.equal(scene.entry, 'scene.pkg')
    assert.equal(scene.previewFile, path.join(sceneDir, 'preview.gif'))
    assert.deepEqual(scene.previewSize, { w: 1, h: 1 })
    assert.equal(scene.rating, 'everyone')
    const web = list.data.wallpapers.find((item) => item.id === '1002')
    assert.equal(web.type, 'web')
    assert.equal(web.rating, 'questionable')
  })

  await check('GET /api/current: 显示器判定与条目补全', async () => {
    const current = await request(base, '/api/current')
    assert.equal(current.status, 200)
    assert.equal(current.data.ok, true)
    assert.equal(current.data.monitor, 'Monitor0')
    assert.ok(['first', 'live', 'changed'].includes(current.data.monitorSource))
    assert.equal(current.data.monitors.length, 1)
    assert.equal(current.data.monitors[0].selected, true)
    assert.equal(current.data.current.id, '1001')
    assert.equal(current.data.current.type, 'scene')
    assert.deepEqual(current.data.current.previewSize, { w: 1, h: 1 })

    const manual = await request(base, '/api/current?monitor=Monitor0')
    assert.equal(manual.data.monitorSource, 'manual')
    const bogus = await request(base, '/api/current?monitor=Nope')
    assert.notEqual(bogus.data.monitorSource, 'manual')
  })

  await check('GET /files: 文档垫片 / ETag 304 / HEAD', async () => {
    const html = await request(base, '/files/1002/index.html')
    assert.equal(html.status, 200)
    assert.match(html.headers.get('content-type') || '', /text\/html/)
    assert.equal(html.headers.get('cache-control'), 'no-cache')
    assert.match(html.text, /__wbgWeShim/)
    const etag = html.headers.get('etag')
    assert.ok(etag)

    const again = await request(base, '/files/1002/index.html', { headers: { 'If-None-Match': etag } })
    assert.equal(again.status, 304)

    const head = await request(base, '/files/1002/index.html', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.text, '')

    const directory = await request(base, '/files/1002/')
    assert.equal(directory.status, 200)
    assert.match(directory.text, /__wbgWeShim/)
  })

  await check('GET /files: Range 206 + 静态缓存头', async () => {
    const range = await request(base, '/files/1002/app.js', { headers: { Range: 'bytes=0-9' } })
    assert.equal(range.status, 206)
    assert.equal(range.text.length, 10)
    assert.match(range.headers.get('content-range') || '', /^bytes 0-9\//)
    assert.equal(range.headers.get('cache-control'), 'public, max-age=300')
  })

  await check('GET /files: 路径越界 403、未订阅 403、不存在 404', async () => {
    const traversal = await request(base, '/files/1002/..%2F..%2Fsecret.txt')
    assert.equal(traversal.status, 403)
    const unsubscribed = await request(base, '/files/1003/index.html')
    assert.equal(unsubscribed.status, 403)
    const unknownId = await request(base, '/files/9999/index.html')
    assert.equal(unknownId.status, 403)
    // 已订阅但目录不存在 → 404
    const missing = await request(base, '/files/1006/index.html')
    assert.equal(missing.status, 404)
  })

  await check('只读：POST 405、未知端点 404', async () => {
    const post = await request(base, '/api/wallpapers', { method: 'POST', body: '{}' })
    assert.equal(post.status, 405)
    const unknown = await request(base, '/nope')
    assert.equal(unknown.status, 404)
  })

  await check('找不到 WE 时服务仍监听，列表返回可操作的 503', async () => {
    const missing = createWeApiService({
      port: 0,
      weInstallPath: path.join(root, 'no-we'),
      workshopPath: path.join(root, 'no-workshop'),
    })
    try {
      await missing.start()
      const statusMissing = await missing.status()
      assert.equal(statusMissing.status, 'running')
      assert.match(statusMissing.error, /Wallpaper Engine/)
      const list = await request(statusMissing.base, '/api/wallpapers')
      assert.equal(list.status, 503)
      assert.match(list.data.error, /Wallpaper Engine|创意工坊/)
    } finally {
      await missing.stop()
    }
  })

  await check('端口上是旧 WE API 服务时复用而不重复监听', async () => {
    const fake = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'we-api-proxy', mode: 'readonly', webShim: 1 }))
    })
    const fakePort = await listen(fake)
    extraServers.push(fake)
    try {
      const reused = createWeApiService({
        port: fakePort,
        weInstallPath: installPath,
        workshopPath,
        subscriptionsFile,
      })
      try {
        await reused.start()
        const reusedStatus = await reused.status()
        assert.equal(reusedStatus.status, 'external')
        assert.equal(reusedStatus.external, true)
        assert.equal(reusedStatus.externalService, 'we-api-proxy')
        assert.equal(reusedStatus.base, 'http://127.0.0.1:' + fakePort)
      } finally {
        await reused.stop()
      }
    } finally {
      await close(fake)
      extraServers.splice(extraServers.indexOf(fake), 1)
    }
  })

  await check('端口被无关程序占用时自动换端口', async () => {
    const blocker = http.createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not a we api')
    })
    const busyPort = await listen(blocker)
    extraServers.push(blocker)
    try {
      const fallback = createWeApiService({
        port: busyPort,
        autoPort: true,
        weInstallPath: installPath,
        workshopPath,
        subscriptionsFile,
      })
      try {
        await fallback.start()
        const fallbackStatus = await fallback.status()
        assert.equal(fallbackStatus.status, 'running')
        assert.notEqual(fallbackStatus.port, busyPort)
        assert.equal(fallbackStatus.fallbackFrom, busyPort)
        const health = await request(fallbackStatus.base, '/health')
        assert.equal(health.data.status, 'running')
      } finally {
        await fallback.stop()
      }
    } finally {
      await close(blocker)
      extraServers.splice(extraServers.indexOf(blocker), 1)
    }
  })

  await check('只配置 workshopPath 时能反推 WE 安装目录', async () => {
    const derived = createWeApiService({ port: 0, workshopPath, subscriptionsFile })
    try {
      await derived.start()
      const status = await derived.status()
      assert.equal(status.weInstallPath, installPath)
      assert.equal(status.workshopPath, workshopPath)
      const current = await request(status.base, '/api/current?monitor=Monitor0')
      assert.equal(current.status, 200)
      assert.equal(current.data.current.id, '1001')
    } finally {
      await derived.stop()
    }
  })

  await check('index.js: 同源 /dsh-wallpaper-engine-api/status 路由', async () => {
    const plugin = await import('../index.js')
    let handler = null
    const disposers = []
    const ctx = {
      webServer: {
        getOrigin: () => 'http://127.0.0.1:1',
        register(route) {
          if (route && route.kind === 'prefix' && route.path === '/dsh-wallpaper-engine-api') {
            handler = route.handler
          }
          return () => {}
        },
      },
      effect(fn) {
        const dispose = fn()
        if (typeof dispose === 'function') disposers.push(dispose)
        return dispose
      },
      inject(_deps, cb) { return cb(ctx) },
    }

    plugin.apply(ctx, { port: 0, weInstallPath: installPath, workshopPath, subscriptionsFile })
    try {
      assert.equal(plugin.name, 'dsh-wallpaper-engine-api')
      assert.equal(typeof handler, 'function')
      const res = new Sink()
      const finished = new Promise((resolve) => {
        res.on('finish', resolve)
        res.on('close', resolve)
        setTimeout(resolve, 5000)
      })
      await handler({ url: '/dsh-wallpaper-engine-api/status', method: 'GET', headers: {} }, res)
      await finished
      assert.equal(res.status, 200)
      const status = JSON.parse(res.text)
      assert.equal(status.ok, true)
      assert.equal(status.plugin, 'dsh-wallpaper-engine-api')
      assert.equal(status.pluginVersion, pkgVersion)
      assert.equal(status.discover, true)
      assert.match(status.base, /^http:\/\/127\.0\.0\.1:\d+$/)
      assert.equal(status.apiBase, status.base)
      assert.equal(status.workshopPath, workshopPath)
    } finally {
      for (const dispose of disposers.reverse()) await dispose()
    }
  })
} finally {
  await service.stop()
  for (const server of extraServers) await close(server)
  try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* Windows 偶发占用 */ }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  for (const failure of failures) console.error('- ' + failure.name)
  process.exitCode = 1
}
