#!/usr/bin/env node
/**
 * dsh-wallpaper-bg CLI
 * ====================
 * 一键安装 / 状态 / 卸载 DeepSeek Harness 壁纸背景插件。
 *
 * 用法：
 *   dsh-wallpaper-bg install                安装（幂等）：解析链链接 + 复制预设 + 追加插件行
 *   dsh-wallpaper-bg install --id my-preset --name "我的壁纸" --we-base http://127.0.0.1:8088
 *   dsh-wallpaper-bg status                 查看当前状态
 *   dsh-wallpaper-bg uninstall [--id ...]   卸载本工具安装的链接与预设
 *
 * install 做了什么：
 *   1. 找到 DSH_HOME（$DSH_HOME 或 ~/.dsh）与 harness 锚点目录（profiles/web 等）。
 *   2. 若插件包无法从锚点的 node_modules 链解析（如仅全局 npm 安装），
 *      在 %DSH_HOME%\node_modules 下创建指向本包目录的 junction（Windows）/ 符号链接。
 *   3. 复制部署自带 standard 预设为 <id>（默认 standard-wallpaper），
 *      写入 preset.yml 元数据，并在 agent.cordis.yml 追加带标记的插件行。
 *   完成打印后续步骤（重启 DSH、新会话选该预设）。
 *
 * 所有写入都幂等、可逆（uninstall），且仅涉及 %DSH_HOME% 与插件自身目录。
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const ROW_MARKER = 'managed-by: dsh-wallpaper-bg'
const DEFAULT_ID = 'standard-wallpaper'
const DEFAULT_NAME = '壁纸背景 (standard)'
const DEFAULT_WE_BASE = 'http://127.0.0.1:8088'

// ---------------------------------------------------------------------------
// 路径与环境
// ---------------------------------------------------------------------------

const binDir = dirname(fileURLToPath(import.meta.url))
let pkgRoot
try {
  pkgRoot = realpathSync(join(binDir, '..'))
} catch {
  pkgRoot = join(binDir, '..')
}

const dshHome = process.env.DSH_HOME || join(os.homedir(), '.dsh')

/** harness 锚点候选：profiles/web 优先，其次其余 profiles，最后 DSH_HOME 本身 */
function anchorDirs() {
  const anchors = []
  const profilesDir = join(dshHome, 'profiles')
  const webProfile = join(profilesDir, 'web')
  if (existsSync(webProfile)) anchors.push(webProfile)
  if (existsSync(profilesDir)) {
    let entries = []
    try {
      entries = readdirSync(profilesDir)
    } catch {
      /* 读不到就算了 */
    }
    for (const entry of entries) {
      if (entry === 'web' || entry === 'node_modules') continue
      const p = join(profilesDir, entry)
      try {
        if (lstatSync(p).isDirectory()) anchors.push(p)
      } catch {
        /* 跳过 */
      }
    }
  }
  anchors.push(dshHome)
  return anchors
}

// ---------------------------------------------------------------------------
// 解析链检查与链接安装
// ---------------------------------------------------------------------------

/**
 * 用与 DSH 一致的 ESM 解析方式测试裸包名是否可解析：
 * 以锚点目录为 cwd 起一个 node 子进程做 import 探测。
 * 注意不能用 createRequire——CJS 解析会回退到 node 全局路径（globalPaths），
 * 而 DSH 的宿主导入走 ESM 内部加载器（不看 globalPaths），两者结论可能相反。
 */
const ESM_PROBE = "import('dsh-wallpaper-bg').then(function(){process.exit(0)},function(){process.exit(1)})"

function resolvableFrom(anchor) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', ESM_PROBE], {
      cwd: anchor,
      stdio: 'ignore',
      timeout: 15000,
    })
    return { ok: true, anchor }
  } catch {
    return { ok: false }
  }
}

function resolveResult() {
  for (const anchor of anchorDirs()) {
    const r = resolvableFrom(anchor)
    if (r.ok) return { anchor }
  }
  return null
}

function linkPath() {
  return join(dshHome, 'node_modules', 'dsh-wallpaper-bg')
}

function linkState() {
  const p = linkPath()
  if (!existsSync(p)) return 'absent'
  try {
    const st = lstatSync(p)
    if (st.isSymbolicLink()) {
      let target
      try {
        target = realpathSync(p)
      } catch {
        target = 'broken'
      }
      return target === pkgRoot ? 'ours' : 'foreign:' + target
    }
    return 'plain-dir'
  } catch {
    return 'broken'
  }
}

function ensureLink() {
  const existing = resolveResult()
  if (existing) {
    return { ok: true, note: 'already resolvable from ' + existing.anchor + '（ESM 探测通过）' }
  }
  const p = linkPath()
  const state = linkState()
  if (state === 'ours') {
    return { ok: true, note: 'junction already present at ' + p }
  }
  if (state !== 'absent') {
    return { ok: false, note: '目标位置已有非本工具内容（' + state + '），请手动处理 ' + p }
  }
  mkdirSync(dirname(p), { recursive: true })
  symlinkSync(pkgRoot, p, process.platform === 'win32' ? 'junction' : 'dir')
  const after = resolveResult()
  if (after) return { ok: true, note: 'created link at ' + p + ' -> ' + pkgRoot }
  return { ok: false, note: '链接已创建但仍无法从锚点解析，请检查 DSH_HOME 与 profiles 目录' }
}

function removeLink() {
  const state = linkState()
  if (state === 'absent') return { ok: true, note: 'no link to remove' }
  if (state === 'ours') {
    rmSync(linkPath(), { recursive: true, force: true })
    return { ok: true, note: 'removed link ' + linkPath() }
  }
  return { ok: false, note: '链接不属于本工具（' + state + '），不动它' }
}

// ---------------------------------------------------------------------------
// 预设复制与插件行
// ---------------------------------------------------------------------------

/** 定位运行中部署的 standard 预设目录（config/agent-presets/standard） */
function shippedStandardDir(anchor) {
  const anchors = [anchor, ...anchorDirs(), pkgRoot]
  for (const a of anchors) {
    try {
      const req = createRequire(join(a, '_dsh_wbg_resolver.cjs'))
      const pkgJson = req.resolve('@deepseek-ai/dsh/package.json')
      const dir = join(dirname(pkgJson), 'config', 'agent-presets', 'standard')
      if (existsSync(join(dir, 'agent.cordis.yml'))) return dir
    } catch {
      /* 该锚点解析不到 dsh 包，试下一个 */
    }
  }
  return null
}

function rowBlock(weBase) {
  return (
    '\n# ── 壁纸背景（' + ROW_MARKER + '） ────────────────────────────────────────────\n' +
    '# dsh-wallpaper-bg：页面独立壁纸背景（内置 / 自定义上传 / WE 壁纸库，只读）。\n' +
    '# 只消费宿主服务、不发布服务，无需 isolate 域。\n' +
    '- id: wallpaper-bg\n' +
    '  name: dsh-wallpaper-bg\n' +
    '  config:\n' +
    '    weBase: ' + weBase + '\n'
  )
}

function presetDirFor(id) {
  return join(dshHome, '.agent-presets', id)
}

function presetState(id) {
  const comp = join(presetDirFor(id), 'agent.cordis.yml')
  if (!existsSync(comp)) return { exists: false }
  let text = ''
  try {
    text = readFileSync(comp, 'utf8')
  } catch {
    return { exists: true, managed: false, row: 'unreadable' }
  }
  const hasRow = /^\s*-\s+id:\s*wallpaper-bg\s*$/m.test(text) && text.includes('name: dsh-wallpaper-bg')
  return { exists: true, managed: text.includes(ROW_MARKER), row: hasRow }
}

function installPreset(args) {
  const id = args.id || DEFAULT_ID
  const name = args.name || DEFAULT_NAME
  const weBase = args.weBase || DEFAULT_WE_BASE
  const dir = presetDirFor(id)
  const compPath = join(dir, 'agent.cordis.yml')

  const state = presetState(id)
  if (state.exists) {
    if (state.row) {
      let note = 'preset "' + id + '" already has the wallpaper row'
      if (!state.managed) {
        // 升级为可管理：在行块上方补标记
        try {
          let text = readFileSync(compPath, 'utf8')
          const rowStart = text.indexOf('- id: wallpaper-bg')
          if (rowStart !== -1) {
            text =
              text.slice(0, rowStart) +
              '# ── 壁纸背景（' + ROW_MARKER + '） ──\n' +
              text.slice(rowStart)
            writeFileSync(compPath, text, 'utf8')
            note += '; added management marker'
          }
        } catch {
          note += '; marker write failed'
        }
      }
      return { ok: true, note }
    }
    return {
      ok: false,
      note:
        'preset "' + id + '" already exists but has no wallpaper row; use --id to choose another name, or add the row manually',
    }
  }

  const anchor = anchorDirs()[0] || dshHome
  const source = shippedStandardDir(anchor)
  if (!source) {
    return {
      ok: false,
      note:
        'cannot locate the shipped standard preset (@deepseek-ai/dsh/config/agent-presets/standard) from anchor ' + anchor,
    }
  }

  cpSync(source, dir, { recursive: true })

  // 元数据：保留源描述，重写名称
  let description = 'standard 全套编码能力 + dsh-wallpaper-bg 壁纸背景插件'
  try {
    const meta = readFileSync(join(dir, 'preset.yml'), 'utf8')
    const m = /^\s*description:\s*(.+)\s*$/m.exec(meta)
    if (m) description = m[1].trim()
  } catch {
    /* 用默认描述 */
  }
  writeFileSync(join(dir, 'preset.yml'), 'name: ' + name + '\ndescription: ' + description + '\n', 'utf8')

  const comp = readFileSync(compPath, 'utf8')
  writeFileSync(compPath, comp.replace(/\s*$/, '') + rowBlock(weBase), 'utf8')

  return { ok: true, note: 'created preset "' + id + '" at ' + dir }
}

function uninstallPreset(id) {
  const state = presetState(id)
  if (!state.exists) return { ok: true, note: 'preset "' + id + '" does not exist' }
  if (!state.managed && !state.row) {
    return { ok: false, note: 'preset "' + id + '" was not created by this tool; refusing to delete' }
  }
  rmSync(presetDirFor(id), { recursive: true, force: true })
  return { ok: true, note: 'removed preset "' + id + '"' }
}

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--id') args.id = argv[++i]
    else if (a === '--name') args.name = argv[++i]
    else if (a === '--we-base') args.weBase = argv[++i]
    else args._.push(a)
  }
  return args
}

function printStatus() {
  const lines = []
  lines.push('DSH_HOME: ' + dshHome)
  lines.push('package root: ' + pkgRoot)
  lines.push('anchor dirs: ' + anchorDirs().join(', '))
  const r = resolveResult()
  lines.push('package resolution: ' + (r ? 'OK (' + r.anchor + '，ESM 探测通过)' : 'NOT RESOLVABLE'))
  lines.push('link (' + linkPath() + '): ' + linkState())
  const ps = presetState(DEFAULT_ID)
  lines.push(
    'preset "' + DEFAULT_ID + '": ' +
      (ps.exists ? (ps.row ? 'row present' : 'no row') + (ps.managed ? ' (managed)' : ' (not managed)') : 'absent'),
  )
  lines.push('')
  lines.push('安装：dsh-wallpaper-bg install')
  lines.push('卸载：dsh-wallpaper-bg uninstall')
  return lines.join('\n')
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] || 'status'
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(
      [
        'dsh-wallpaper-bg — DeepSeek Harness 壁纸背景插件安装器',
        '',
        '用法:',
        '  dsh-wallpaper-bg install              安装（幂等）',
        '  dsh-wallpaper-bg install --id <预设id> --name <显示名> --we-base <url>',
        '  dsh-wallpaper-bg status               查看状态',
        '  dsh-wallpaper-bg uninstall [--id <预设id>]',
        '',
        'install 会：在 %DSH_HOME%\\node_modules 建立指向本包的链接（若还不能从',
        'harness 锚点解析），复制 standard 预设并追加壁纸插件行；完成后重启 DSH，',
        '新建会话时选择该预设即可。',
      ].join('\n'),
    )
    return
  }
  if (cmd === 'status') {
    console.log(printStatus())
    return
  }
  if (cmd === 'install') {
    const link = ensureLink()
    if (!link.ok) {
      console.error('ERROR: ' + link.note)
      process.exitCode = 1
      return
    }
    console.log('[link] ' + link.note)
    const preset = installPreset(args)
    if (!preset.ok) {
      console.error('ERROR: ' + preset.note)
      process.exitCode = 1
      return
    }
    console.log('[preset] ' + preset.note)
    console.log('')
    console.log('安装完成。接下来：')
    console.log('  1. 重启 DSH（Ctrl+C 后重新运行 dsh web）')
    console.log('  2. 新建会话时选择预设「' + (args.name || DEFAULT_NAME) + '」')
    console.log('  3. 打开 设置 → 壁纸 开始使用')
    console.log('')
    console.log('（可选）WE 壁纸库：进入仓库 wallpaper-engine-api 目录执行 npm install，再运行 启动服务.bat')
    return
  }
  if (cmd === 'uninstall') {
    const id = args.id || DEFAULT_ID
    const preset = uninstallPreset(id)
    if (!preset.ok) {
      console.error('ERROR: ' + preset.note)
      process.exitCode = 1
      return
    }
    console.log('[preset] ' + preset.note)
    const link = removeLink()
    if (link.ok) console.log('[link] ' + link.note)
    else console.error('WARN: ' + link.note)
    console.log(
      '若插件还通过 dsh plugin --profile web add 安装过，请再执行：dsh plugin --profile web remove dsh-wallpaper-bg',
    )
    return
  }
  console.error('unknown command: ' + cmd + '（可用：install / status / uninstall / help）')
  process.exitCode = 1
}

main()
