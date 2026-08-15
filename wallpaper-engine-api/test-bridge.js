/**
 * 联调验证脚本：模拟 dsh-wallpaper-bg 插件 Host 侧 weApi 的
 * normalizeItem / pickList / inferKind 逻辑，对真实运行的
 * 8088 只读代理做端到端格式校验（不依赖 DSH 进程）。
 * 用法：node test-bridge.js
 */
'use strict'

function inferKind(item, filepath) {
  const rawType = String(item.type ?? item.filetype ?? item.kind ?? item.wallpaperType ?? '').toLowerCase()
  if (/scene|application|web|html/.test(rawType)) return 'scene'
  if (/video|movie/.test(rawType)) return 'video'
  if (/image|picture|photo/.test(rawType)) return 'image'
  const lower = filepath.toLowerCase()
  if (/(\.mp4|\.webm|\.mkv|\.avi|\.mov|\.m4v)([?#]|$)/.test(lower)) return 'video'
  if (/(\.jpe?g|\.png|\.webp|\.gif|\.bmp|\.avif)([?#]|$)/.test(lower)) return 'image'
  if (lower.includes('scene')) return 'scene'
  return 'unknown'
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = String(item.id ?? item.publishedfileid ?? item.workshopId ?? item.wid ?? '').trim()
  if (!id) return null
  const filepath = String(item.filepath ?? item.path ?? item.file ?? item.filePath ?? item.resourcePath ?? '').trim()
  const previewUrl = String(item.previewUrl ?? item.preview_url ?? item.sceneUrl ?? '').trim()
  return {
    id,
    title: String(item.title ?? item.name ?? item.projectname ?? '壁纸 ' + id).trim(),
    thumbnail: String(item.thumbnail ?? item.thumb ?? item.preview ?? item.thumbUrl ?? '').trim(),
    kind: inferKind(item, filepath),
    filepath,
    previewUrl,
  }
}

function assetUrlOf(p) {
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
    return '/dsh-wallpaper-bg/asset?path=' + encodeURIComponent(p)
  }
  return p
}

async function main() {
  const base = 'http://127.0.0.1:8088'
  const get = async (ep) => {
    const res = await fetch(base + ep)
    if (!res.ok) throw new Error(ep + ' → HTTP ' + res.status)
    return res.json()
  }

  let pass = 0
  let fail = 0
  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log('  [通过] ' + name) }
    else { fail++; console.log('  [失败] ' + name + (detail ? ' → ' + detail : '')) }
  }

  console.log('1) /health 探测')
  const health = await get('/health')
  check('服务可达且 ok=true', health.ok === true)
  check('声明为只读模式', health.mode === 'readonly')

  console.log('2) /api/wallpapers 列表')
  const list = await get('/api/wallpapers')
  check('响应 ok=true', list.ok === true)
  check('含 wallpapers 数组（插件 pickList 可识别）', Array.isArray(list.wallpapers))
  const normalized = list.wallpapers.map(normalizeItem).filter(Boolean)
  check('归一化后无条目丢失', normalized.length === list.wallpapers.length,
    normalized.length + '/' + list.wallpapers.length)
  const kinds = {}
  for (const w of normalized) kinds[w.kind] = (kinds[w.kind] || 0) + 1
  console.log('  类型分布: ' + JSON.stringify(kinds))
  check('无 unknown 类型条目', !kinds.unknown || kinds.unknown === 0,
    kinds.unknown ? kinds.unknown + ' 个 unknown' : '')
  const withThumb = normalized.filter((w) => w.thumbnail)
  check('缩略图覆盖充分（>90%）', withThumb.length / normalized.length > 0.9,
    withThumb.length + '/' + normalized.length)
  const sample = normalized.find((w) => w.kind === 'video') || normalized[0]
  console.log('  样例条目: ' + JSON.stringify(sample, null, 2).split('\n').join('\n  '))
  console.log('  插件渲染 URL 示例: ' + assetUrlOf(sample.filepath || sample.thumbnail))

  console.log('3) /api/current 当前壁纸')
  const cur = await get('/api/current')
  check('响应 ok=true', cur.ok === true)
  if (cur.current) {
    const c = normalizeItem(cur.current)
    check('当前壁纸可归一化', !!c)
    check('id/title/filepath 齐全', !!(c && c.id && c.title), JSON.stringify(c && { id: c.id, title: c.title, kind: c.kind }))
    check('与列表中的条目可对应', normalized.some((w) => w.id === c.id),
      'id=' + (c && c.id))
  } else {
    console.log('  [提示] current 为 null（WE 未设置壁纸或 config 无记录）')
  }

  console.log('')
  console.log('结果: ' + pass + ' 通过, ' + fail + ' 失败')
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error('验证失败: ' + (err && err.message ? err.message : err))
  process.exit(1)
})
