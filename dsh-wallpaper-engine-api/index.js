/**
 * dsh-wallpaper-engine-api — DSH 宿主半入口
 * ==========================================
 * 把原本需要 clone 仓库 + `npm install` + 双击 .bat + 设置开机自启的
 * `wallpaper-engine-api/` 独立服务，做成 DSH 插件：
 *
 *   dsh plugin --profile <name> add dsh-wallpaper-engine-api
 *
 * 装好后随 DSH 启动：
 *   1. 在本机 127.0.0.1:8088（可配置）打开只读 WE API 服务；
 *      - 8088 已是旧的 WE API 服务 → 直接复用它，不再重复监听；
 *      - 8088 被无关程序占用 → 自动换端口（默认开启），不影响 DSH 启动；
 *   2. 通过宿主的 webServer 注册同源状态路由
 *      GET /dsh-wallpaper-engine-api/status
 *      dsh-wallpaper-bg 用它发现「实际端口 / 是否复用外部服务 / 错误原因」，
 *      所以端口变了也不需要用户手动改基地址。
 *
 * 生命周期：服务只活在 DSH 进程内 —— DSH 退出 / 重启即停，不会留下后台进程，
 * 也不依赖 PATH 里的 Node.js（桌面端自带运行时）。只读：只列壁纸、读当前壁纸、
 * 提供网页壁纸目录文件，绝不调用 WE 的设置 / 播放接口。
 */
import { createWeApiService, PLUGIN_NAME, PLUGIN_VERSION } from './lib/we-api-service.js'

export const name = PLUGIN_NAME

/** 同源状态路由的前缀：与 dsh-wallpaper-bg 的 DISCOVER_PATH 契约一致 */
export const STATUS_PREFIX = '/dsh-wallpaper-engine-api'

function sendJson(res, code, obj) {
  try {
    const body = Buffer.from(JSON.stringify(obj), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store',
    })
    res.end(body)
  } catch {
    /* 连接已断开 */
  }
}

/**
 * @param {object} ctx Cordis 插件上下文
 * @param {object} [config] profile 补丁行里的 config（见 cordis.patch.yml）
 */
export function apply(ctx, config) {
  const service = createWeApiService(config)

  // 服务本体：ctx.effect 负责在插件卸载 / 宿主关闭时回收监听
  ctx.effect(() => {
    service.start().catch((error) => {
      console.error('[dsh-wallpaper-engine-api] 启动失败：' + ((error && error.message) || error))
    })
    return () => {
      service.stop().catch(() => {})
    }
  })

  // 同源状态路由：webServer 缺失（headless / tui）时插件照常激活，只是不注册
  ctx.inject(['webServer'], (ctx) => {
    const webServer = ctx.webServer
    if (!webServer || typeof webServer.register !== 'function') return

    ctx.effect(() => webServer.register({
      kind: 'prefix',
      path: STATUS_PREFIX,
      handler: async (req, res) => {
        let pathname
        try {
          pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/'
        } catch {
          return sendJson(res, 400, { ok: false, error: '非法 URL' })
        }
        if (pathname === STATUS_PREFIX || pathname === STATUS_PREFIX + '/status' ||
            pathname === STATUS_PREFIX + '/health') {
          try {
            const status = await service.status()
            return sendJson(res, 200, Object.assign({}, status, {
              discover: true,
              plugin: PLUGIN_NAME,
              pluginVersion: PLUGIN_VERSION,
              // 明确告诉调用方：这是同源发现路由，真正的 API 在 base 上
              apiBase: status.base || '',
            }))
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
          }
        }
        return sendJson(res, 404, { ok: false, error: '未知路由: ' + pathname })
      },
    }))
  })
}

export default { name, apply }

