#!/usr/bin/env node
/**
 * dsh-wallpaper-bg CLI
 * ====================
 * 一键安装 / 状态 / 卸载 DeepSeek Harness 壁纸背景插件。
 *
 * 默认安装方式是「profile 补丁层」：把插件行写进 profiles/<name>/cordis.patch.yml
 * （用户自有补丁层），随 dsh web 启动即生效——首次加载页面就带壁纸背景，
 * 无需会话、无需预设、无需重启（该层支持热重载，写完后刷新页面即可）。
 *
 * 桌面端（DeepSeek Harness 0.2 桌面版）例外：`desktop` profile 由 Electron 应用
 * 独占管理（终端里 `dsh --profile desktop` 会被拒绝），插件应当在应用内
 * 「设置 → 插件」里按包名安装（等价：`dsh plugin --profile desktop add
 * dsh-wallpaper-bg`）——那样插件是通过 package.json 的 dsh.profile.bundles
 * 组合层加载的，本 CLI 不会再往该 profile 的用户补丁层插行（插了就会重复）。
 *
 * 用法：
 *   dsh-wallpaper-bg install                默认：profile 补丁层（启动即生效）
 *   dsh-wallpaper-bg install --profile web  只对指定 profile 生效
 *   dsh-wallpaper-bg install --preset       改为预设行模式（按会话挂载）
 *   dsh-wallpaper-bg install --id my-preset --name "我的壁纸" --we-base <url>
 *   dsh-wallpaper-bg status
 *   dsh-wallpaper-bg uninstall [--preset]
 *
 * 所有写入都幂等、可逆，且仅涉及 %DSH_HOME% 与插件自身目录。
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
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const PATCH_MARKER = '# dsh-wallpaper-bg（managed-by: dsh-wallpaper-bg）'
const DEFAULT_ID = 'standard-wallpaper'
const DEFAULT_NAME = '壁纸背景 (standard)'
const DEFAULT_WE_BASE = 'http://127.0.0.1:8088'
/** npm 包名：bundle 组合层与桌面端插件管理页面都按它识别本插件 */
const PACKAGE_NAME = 'dsh-wallpaper-bg'
/** 仓库地址：WE 壁纸库需要的 wallpaper-engine-api 服务只随仓库提供（不在 npm 包里） */
const REPO_URL = 'https://github.com/nishuoyang/dsh-wallpaper-bg'
/** Electron 桌面端（0.2+）独占管理的 profile 名 */
const DESKTOP_PROFILE = 'desktop'
const PATCH_TEMPLATE = [
  '# Your patch layer for this dsh profile, applied after every bundle layer:',
  '# a top-level YAML array of loader patch entries (id-targeted config',
  '# overrides, disables, and insert lists; `!!js` expressions allowed).',
  '[]',
  '',
].join('\n')

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

/** 各 profile 的用户补丁层文件路径（存在才返回） */
function profilePatchPaths() {
  const paths = []
  const profilesDir = join(dshHome, 'profiles')
  if (!existsSync(profilesDir)) return paths
  let entries = []
  try {
    entries = readdirSync(profilesDir)
  } catch {
    return paths
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const p = join(profilesDir, entry, 'cordis.patch.yml')
    try {
      if (existsSync(p) && lstatSync(p).isFile()) paths.push(p)
    } catch {
      /* 跳过 */
    }
  }
  return paths
}

/** 各 profile 目录（排除 node_modules） */
function profileDirs() {
  const dirs = []
  const profilesDir = join(dshHome, 'profiles')
  if (!existsSync(profilesDir)) return dirs
  let entries = []
  try {
    entries = readdirSync(profilesDir)
  } catch {
    return dirs
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const p = join(profilesDir, entry)
    try {
      if (lstatSync(p).isDirectory()) dirs.push(p)
    } catch {
      /* 跳过 */
    }
  }
  return dirs
}

/** 各 profile 的名字（用于报错提示） */
function profileNames() {
  return profileDirs().map((dir) => basename(dir)).join(', ')
}

/** 读 profile 的 package.json；读不到或不是 JSON 都返回 null */
function profileManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/**
 * 该 profile 是否已经以「插件包」形态加载本插件——`dsh plugin --profile <name> add`
 * 与桌面端「设置 → 插件」都是这么装的：包进了 dependencies，DSH 自己再把它追加进
 * `dsh.profile.bundles`，插件随应用启动生效。此时本 CLI 不该再往该 profile 的
 * 用户补丁层插一行，否则同一个插件会被挂载两次。
 */
function installedAsPackage(dir) {
  const manifest = profileManifest(dir)
  if (!manifest) return false
  const bundles = manifest.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(PACKAGE_NAME)) return true
  return Object.keys(manifest.dependencies ?? {}).includes(PACKAGE_NAME)
}

/** 桌面端 profile 的固定说明（安装 / 卸载 / 状态三处共用） */
function desktopNote() {
  return (
    'Electron 桌面端独占管理该 profile（终端里 `dsh --profile desktop` 会被拒绝），' +
    '插件请在应用内「设置 → 插件」输入包名 ' + PACKAGE_NAME + ' 安装，' +
    '等价命令：dsh plugin --profile ' + DESKTOP_PROFILE + ' add ' + PACKAGE_NAME
  )
}

/** 为还没有补丁层的 profile 目录创建模板补丁文件（与 DSH initProfile 的模板一致） */
function ensurePatchFiles() {
  const created = []
  for (const dir of profileDirs()) {
    if (basename(dir) === DESKTOP_PROFILE) continue // 桌面端 profile 不代管
    const p = join(dir, 'cordis.patch.yml')
    try {
      if (!existsSync(p)) {
        writeFileSync(p, PATCH_TEMPLATE, 'utf8')
        created.push(p)
      }
    } catch {
      /* 创建失败交给后续 writePatch 报错 */
    }
  }
  return created
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
// profile 补丁层（默认安装方式：启动即生效）
// ---------------------------------------------------------------------------

function insertBlock(weBase) {
  return [
    '- insert:',
    '    ' + PATCH_MARKER,
    '    # 页面级壁纸背景：随 dsh web 启动即生效，首次加载页面就带背景，无需会话/预设。',
    '    - id: wallpaper-bg',
    '      name: dsh-wallpaper-bg',
    '      config:',
    '        weBase: ' + weBase,
  ].join('\n')
}

function patchContainsRow(text) {
  return text.includes('name: dsh-wallpaper-bg')
}

function patchState(path) {
  if (!existsSync(path)) return { exists: false }
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return { exists: true, row: false, readable: false }
  }
  return { exists: true, row: patchContainsRow(text), readable: true }
}

function writePatch(path, weBase) {
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return { ok: false, note: 'cannot read ' + path }
  }
  if (patchContainsRow(content)) {
    return { ok: true, note: 'already installed in ' + path }
  }
  let next
  if (/\[\]\s*$/.test(content)) {
    // 模板态：把末尾的空数组替换为插入块
    next = content.replace(/\[\]\s*$/, insertBlock(weBase))
  } else {
    next = content.replace(/\s*$/, '') + '\n' + insertBlock(weBase) + '\n'
  }
  try {
    writeFileSync(path, next, 'utf8')
  } catch {
    return { ok: false, note: 'cannot write ' + path }
  }
  return { ok: true, note: 'installed into ' + path }
}

/** 去掉注释与空白行后，文本里是否还有实质内容 */
function meaningfulLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
}

function removePatch(path) {
  if (!existsSync(path)) return { ok: true, note: 'no patch layer at ' + path }
  let lines
  try {
    lines = readFileSync(path, 'utf8').split(/\r?\n/)
  } catch {
    return { ok: false, note: 'cannot read ' + path }
  }
  const kept = []
  let removed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^- insert:\s*$/.test(line)) {
      // 收集整个顶层条目，判断是否属于本插件
      const block = [line]
      let j = i + 1
      for (; j < lines.length; j++) {
        if (/^-\s/.test(lines[j])) break
        block.push(lines[j])
      }
      if (block.join('\n').includes('dsh-wallpaper-bg')) {
        removed = true
        i = j - 1
        continue
      }
      kept.push(...block)
      i = j - 1
      continue
    }
    kept.push(line)
  }
  const body = kept.join('\n').trim()
  // 关键修复：DSH 要求该文件要么不存在、要么是顶层 YAML 数组
  // （dsh-app-boot parsePatchList 对非数组内容直接 throw，启动即失败）。
  // 移除本插件行后若只剩注释/空白（YAML 解析为 null），必须恢复模板态，
  // 至少留下 []——否则用户重启 dsh web 会因空补丁层启动失败。
  if (meaningfulLines(body).length === 0) {
    try {
      writeFileSync(path, PATCH_TEMPLATE, 'utf8')
    } catch {
      return { ok: false, note: 'cannot write ' + path }
    }
    return {
      ok: true,
      note: removed
        ? 'removed from ' + path + '（已恢复为模板 []，避免空补丁层导致 dsh 启动失败）'
        : 'not installed in ' + path + '（补丁层为空内容，已恢复为模板 []）',
    }
  }
  if (!removed) return { ok: true, note: 'not installed in ' + path }
  try {
    writeFileSync(path, body + '\n', 'utf8')
  } catch {
    return { ok: false, note: 'cannot write ' + path }
  }
  return { ok: true, note: 'removed from ' + path }
}

// ---------------------------------------------------------------------------
// 预设行模式（--preset：按会话挂载，供需要按会话开关的用户）
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

function presetRowBlock(weBase) {
  return (
    '\n# ── 壁纸背景（managed-by: dsh-wallpaper-bg） ──────────────────────────────\n' +
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
  return { exists: true, managed: text.includes('managed-by: dsh-wallpaper-bg'), row: hasRow }
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
      return { ok: true, note: 'preset "' + id + '" already has the wallpaper row' }
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
  writeFileSync(compPath, comp.replace(/\s*$/, '') + presetRowBlock(weBase), 'utf8')

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
    else if (a === '--profile') args.profile = argv[++i]
    else if (a === '--preset') args.preset = true
    else args._.push(a)
  }
  return args
}

/**
 * 该 profile 是否已经把本插件列进 `dsh.profile.bundles`——只有列进去才会被
 * 当成 profile 组合层加载。`dsh plugin add` 由 DSH 自己回填这一项；极少数情况下
 * （刚发布后注册表还在传播时）会漏写：依赖装上了、bundles 里却没有它，表现是
 * 「装完了但 设置 → 壁纸 里没有面板」。重跑一次 add 即可补上。
 */
function bundleListed(dir) {
  const manifest = profileManifest(dir)
  const bundles = manifest?.dsh?.profile?.bundles
  return Array.isArray(bundles) && bundles.includes(PACKAGE_NAME)
}

/** bundle / 依赖两种「按插件包安装」状态的措辞（status 用） */
function packageState(dir) {
  if (bundleListed(dir)) return 'installed（bundle 层，随 DSH 启动加载）'
  if (installedAsPackage(dir)) {
    return (
      'installed（依赖已装，但 dsh.profile.bundles 里没有 ' + PACKAGE_NAME +
      ' → 不会被加载；重跑一次 dsh plugin --profile ' + basename(dir) + ' add ' + PACKAGE_NAME + ' 即可补上）'
    )
  }
  return null
}

function printStatus() {
  const lines = []
  lines.push('DSH_HOME: ' + dshHome)
  lines.push('package root: ' + pkgRoot)
  lines.push('anchor dirs: ' + anchorDirs().join(', '))
  const r = resolveResult()
  lines.push('package resolution: ' + (r ? 'OK (' + r.anchor + '，ESM 探测通过)' : 'NOT RESOLVABLE'))
  lines.push('link (' + linkPath() + '): ' + linkState())
  const patches = profilePatchPaths()
  if (patches.length) {
    for (const p of patches) {
      const dir = dirname(p)
      const name = basename(dir)
      const ps = patchState(p)
      const pkgState = packageState(dir)
      let state
      if (ps.row) state = 'installed（用户补丁层）'
      else if (name === DESKTOP_PROFILE && !pkgState) state = '桌面端独占管理（请用应用内「设置 → 插件」）'
      else if (pkgState) state = pkgState
      else state = 'absent'
      lines.push('patch layer ' + p + ': ' + state)
    }
  } else {
    lines.push('patch layer: no profiles/*/cordis.patch.yml found')
  }
  const desktopDir = join(dshHome, 'profiles', DESKTOP_PROFILE)
  if (existsSync(desktopDir)) {
    const desktopState = packageState(desktopDir)
    lines.push(
      'desktop profile: ' +
        (desktopState || '未安装本插件') +
        ' — 由 Electron 桌面端独占管理',
    )
  }
  const pr = presetState(DEFAULT_ID)
  lines.push(
    'preset "' + DEFAULT_ID + '": ' +
      (pr.exists ? (pr.row ? 'row present' : 'no row') + (pr.managed ? ' (managed)' : '') : 'absent'),
  )
  lines.push('')
  lines.push('安装：dsh-wallpaper-bg install（默认 profile 补丁层，启动即生效；--preset 为按会话模式）')
  lines.push('      桌面端请在应用内「设置 → 插件」输入 ' + PACKAGE_NAME + '（终端无法启动 desktop profile）')
  lines.push('卸载：dsh-wallpaper-bg uninstall [--preset]')
  lines.push('WE 壁纸库（可选）：需要仓库里的 wallpaper-engine-api 服务（不在 npm 包里）——')
  lines.push('      git clone ' + REPO_URL + ' → wallpaper-engine-api 里 npm install → 运行 启动服务.bat')
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
        '  dsh-wallpaper-bg install              默认：写入 profile 补丁层（启动即生效，热重载）',
        '  dsh-wallpaper-bg install --profile web 只对指定 profile 生效',
        '  dsh-wallpaper-bg install --preset     预设行模式（按会话挂载）',
        '  dsh-wallpaper-bg install --we-base <url>',
        '  dsh-wallpaper-bg status               查看状态',
        '  dsh-wallpaper-bg uninstall [--preset] 卸载',
        '',
        '默认 install 会：确认插件包可从 harness 锚点解析（必要时在 %DSH_HOME%\\node_modules',
        '建链接），再把插件行写进 profiles/<name>/cordis.patch.yml。dsh web 启动即生效，',
        '首次加载页面就带壁纸背景，无需会话、预设或重启（该层支持热重载，写完后刷新页面即可）。',
        '',
        '桌面端（DeepSeek Harness 0.2+ 桌面版）：desktop profile 由 Electron 应用独占管理，',
        'install 会跳过它并提示——请在应用内「设置 → 插件」输入包名 dsh-wallpaper-bg，',
        '或运行 dsh plugin --profile desktop add dsh-wallpaper-bg。',
        '',
        '（可选）WE 壁纸库：需要仓库里的 wallpaper-engine-api 服务（不在 npm 包里）——',
        'git clone ' + REPO_URL + '，进入 wallpaper-engine-api 执行 npm install，再运行 启动服务.bat。',
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

    if (args.preset) {
      const preset = installPreset(args)
      if (!preset.ok) {
        console.error('ERROR: ' + preset.note)
        process.exitCode = 1
        return
      }
      console.log('[preset] ' + preset.note)
      console.log('')
      console.log('安装完成（按会话模式）。接下来：')
      console.log('  1. 重启 DSH（Ctrl+C 后重新运行 dsh web）')
      console.log('  2. 新建会话时选择预设「' + (args.name || DEFAULT_NAME) + '」')
      console.log('  3. 打开 设置 → 壁纸 开始使用')
      return
    }

    const weBase = args.weBase || DEFAULT_WE_BASE
    const wanted = args.profile ? String(args.profile) : null
    for (const p of ensurePatchFiles()) {
      console.log('[patch] created template layer at ' + p)
    }
    let paths = profilePatchPaths()
    if (wanted) {
      paths = paths.filter((p) => basename(dirname(p)) === wanted)
      if (!paths.length) {
        console.error(
          'ERROR: 没有 profiles/' + wanted + '/cordis.patch.yml（可用 profile：' + profileNames() + '）',
        )
        process.exitCode = 1
        return
      }
    }
    if (!paths.length) {
      // 桌面端专属部署可能没有任何用户补丁层（desktop profile 归应用管理）
      const desktopDir = join(dshHome, 'profiles', DESKTOP_PROFILE)
      if (existsSync(desktopDir)) {
        console.log('[skip] desktop: ' + desktopNote())
        console.log('')
        console.log('没有需要改动的 profile：桌面端请在应用内安装（见上文提示）。')
        return
      }
      console.error('ERROR: 找不到 profiles/*/cordis.patch.yml；本部署可能没有 profile 补丁层，请改用 --preset 模式')
      process.exitCode = 1
      return
    }
    let anyOk = false
    let skipped = 0
    let touchedDesktop = false
    for (const p of paths) {
      const name = basename(dirname(p))
      if (name === DESKTOP_PROFILE) {
        touchedDesktop = true
        skipped++
        console.log('[skip] desktop: ' + desktopNote())
        continue
      }
      if (!patchState(p).row && installedAsPackage(dirname(p))) {
        skipped++
        console.log(
          '[skip] ' + name + ': 已作为插件包安装（package.json 的 dsh.profile.bundles 里已有 ' +
            PACKAGE_NAME + '），无需再写用户补丁层',
        )
        continue
      }
      const res = writePatch(p, weBase)
      if (res.ok) {
        anyOk = true
        console.log('[patch] ' + res.note)
      } else {
        console.error('ERROR: ' + res.note)
      }
    }
    if (!anyOk) {
      if (skipped) {
        console.log('')
        console.log(
          touchedDesktop && !installedAsPackage(join(dshHome, 'profiles', DESKTOP_PROFILE))
            ? '没有改动任何 profile：桌面端请在应用内安装（见上文提示）。'
            : '没有需要改动的 profile：本插件已在该部署里生效。',
        )
        if (touchedDesktop) console.log('  桌面端：' + desktopNote())
        return
      }
      process.exitCode = 1
      return
    }
    console.log('')
    console.log('安装完成（启动即生效模式）。')
    console.log('  - 当前正在运行的 dsh web 会热加载该补丁层：刷新页面即可看到壁纸背景')
    console.log('  - 之后每次 dsh web 启动，首次加载页面就带壁纸背景，无需会话或预设')
    if (touchedDesktop) console.log('  - 桌面端：' + desktopNote())
    console.log('')
    console.log('（可选）WE 壁纸库：该来源需要仓库里的 wallpaper-engine-api 服务（不在 npm 包里）——')
    console.log('  git clone ' + REPO_URL + '，进入 wallpaper-engine-api 执行 npm install，再运行 启动服务.bat')
    return
  }
  if (cmd === 'uninstall') {
    if (args.preset) {
      const preset = uninstallPreset(args.id || DEFAULT_ID)
      if (!preset.ok) {
        console.error('ERROR: ' + preset.note)
        process.exitCode = 1
        return
      }
      console.log('[preset] ' + preset.note)
    } else {
      const paths = profilePatchPaths()
      if (!paths.length) {
        console.error('ERROR: 找不到 profiles/*/cordis.patch.yml')
        process.exitCode = 1
        return
      }
      for (const p of paths) {
        const name = basename(dirname(p))
        if (name === DESKTOP_PROFILE) {
          console.log('[skip] desktop: ' + desktopNote())
          continue
        }
        if (!patchState(p).row && installedAsPackage(dirname(p))) {
          console.log(
            '[skip] ' + name + ': 由插件包（bundle 层）提供，请用 dsh plugin --profile ' +
              name + ' remove ' + PACKAGE_NAME + ' 卸载',
          )
          continue
        }
        const res = removePatch(p)
        if (res.ok) console.log('[patch] ' + res.note)
        else console.error('ERROR: ' + res.note)
      }
    }
    const link = removeLink()
    if (link.ok) console.log('[link] ' + link.note)
    else console.error('WARN: ' + link.note)
    console.log('若插件是通过 dsh plugin add / 桌面端插件页面安装的，请再执行：')
    console.log('  dsh plugin --profile web remove ' + PACKAGE_NAME)
    console.log('  dsh plugin --profile ' + DESKTOP_PROFILE + ' remove ' + PACKAGE_NAME + '   # 或在桌面端「设置 → 插件」里卸载')
    return
  }
  console.error('unknown command: ' + cmd + '（可用：install / status / uninstall / help）')
  process.exitCode = 1
}

main()
