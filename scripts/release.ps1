<#
  dsh-wallpaper-bg 一键发布
  =========================
  固化发布流程：版本校验 → 打包预检 → 提交 → 打标签 → 推送 → npm publish → GitHub Release（附 tarball）

  用法（在仓库根目录执行）：
    .\scripts\release.ps1                      # 发布 package.json 里当前的版本
    .\scripts\release.ps1 -Version 0.3.8       # 先批量改版本号，再发布
    .\scripts\release.ps1 -DryRun              # 只做检查与预览，不产生任何改动
    .\scripts\release.ps1 -SkipGitHub          # 不发 GitHub Release
    .\scripts\release.ps1 -SkipNpm             # 不发布 npm
    .\scripts\release.ps1 -SkipPush            # 不推送到远端（仅本地提交 + 打标签）
    .\scripts\release.ps1 -Yes                 # 跳过二次确认
    .\scripts\release.ps1 -Message "..."       # 自定义提交 / 标签说明

  说明：
  - 版本号只认 package.json；-Version 会同步改写 package.json / lib/host.js /
    lib/client.js / README.md / README.zh.md 中的版本字符串。
  - CHANGELOG.md 必须已有对应版本的条目，Release 说明直接取自该条目。
  - 预检会拒绝「标签已存在」「npm 上已发布该版本」的重复发布。
#>
[CmdletBinding()]
param(
  [string]$Version,
  [string]$Message,
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$SkipNpm,
  [switch]$SkipGitHub,
  [switch]$SkipPush,
  [string]$Remote = 'origin',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ---------- 定位仓库根目录 ----------
$repo = $PSScriptRoot
if (-not $repo) { $repo = Split-Path -Parent $MyInvocation.MyCommand.Path }
$repo = (Resolve-Path (Join-Path $repo '..')).Path
Set-Location $repo

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" }
function Ok($msg) { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`n[x] $msg" -ForegroundColor Red; exit 1 }
# 注意：参数名不能叫 $args —— 它是 PowerShell 自动变量，作为参数名会被静默忽略
# （调用时传进来的数组直接丢掉，& $cmd @args 变成裸命令，git 会打印帮助并失败）
function Run($cmd, $argList) {
  # git / npm 会把进度、警告写到 stderr，在 $ErrorActionPreference='Stop' 下会被
  # 当成终止错误（NativeCommandError）——这里只认退出码，不把 stderr 当失败。
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $cmd @argList } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { Fail "命令失败（exit $LASTEXITCODE）：$cmd $($argList -join ' ')" }
}
# 静默执行 npm：吞掉 stderr（npm 把告警和「版本不存在」都写到 stderr，在
# $ErrorActionPreference='Stop' 下会被当成终止错误），返回 @{ ok; out; lines }
# out 只取最后一行有效输出，避免 PowerShell 的 NativeCommandError 噪音混进来
function NpmQuiet([string[]]$npmArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $all = @(& npm @npmArgs 2>&1 | Out-String -Stream | Where-Object { $_ -match '\S' })
    # 只滤掉 PowerShell 的 NativeCommandError 噪音，保留 npm 自己的输出
    $clean = @($all | Where-Object {
      $_ -notmatch '^(node\.exe\s*:|At line:|\+\s|CategoryInfo\s*:|FullyQualifiedErrorId\s*:)'
    })
    $last = if ($clean.Count -gt 0) { $clean[-1].Trim() } else { '' }
    return @{ ok = ($LASTEXITCODE -eq 0); out = $last; lines = $clean }
  } finally {
    $ErrorActionPreference = $prev
  }
}

# ---------- 读取版本与仓库信息 ----------
$pkgPath = Join-Path $repo 'package.json'
if (-not (Test-Path $pkgPath)) { Fail "找不到 package.json（当前目录：$repo）" }
$pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$name = $pkg.name
$target = if ($Version) { $Version } else { $pkg.version }
$tag = "v$target"

Step "发布目标"
Info "包名    : $name"
Info "版本    : $target$(if ($Version -and $Version -ne $pkg.version) { "（当前 $($pkg.version)，将改写）" } else { '' })"
Info "标签    : $tag"
Info "仓库    : $repo"
if ($DryRun) { Warn "DryRun 模式：只检查，不产生任何改动" }

# ---------- 预检 ----------
Step "预检"

if ($target -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.\-]+)?$') {
  Fail "版本号格式不合法：$target（应形如 1.2.3 或 1.2.3-beta.1）"
}
Ok "版本号格式合法"

$changelogPath = Join-Path $repo 'CHANGELOG.md'
if (-not (Test-Path $changelogPath)) { Fail '找不到 CHANGELOG.md' }
$changelog = Get-Content $changelogPath -Raw -Encoding UTF8
$escaped = [regex]::Escape($target)
if ($changelog -notmatch "(?m)^##\s+\[$escaped\]") {
  Fail "CHANGELOG.md 里没有 [$target] 条目，请先补写变更说明"
}
Ok "CHANGELOG.md 有 [$target] 条目"

# 发布说明 = CHANGELOG 中该版本条目
$lines = $changelog -split "`r?`n"
$start = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match "^##\s+\[$escaped\]") { $start = $i; break }
}
$notes = @()
for ($i = $start + 1; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^##\s+\[') { break }
  $notes += $lines[$i]
}
$releaseNotes = ($notes -join "`n").Trim()
if (-not $releaseNotes) { Fail "CHANGELOG.md 的 [$target] 条目是空的" }
Ok "发布说明已提取（$($releaseNotes.Length) 字符）"

# 版本改写必须在「标签 / npm 版本」检查之前执行，否则检查的是旧版本号
$needsBump = ($Version -and $Version -ne $pkg.version)
if ($needsBump) {
  if ($DryRun) {
    Step "版本号改写（DryRun 预览）"
    Info "将把 5 个文件里的 $($pkg.version) 替换为 $target"
  } else {
    Step "改写版本号 → $target"
    foreach ($f in @('package.json', 'lib/host.js', 'lib/client.js', 'README.md', 'README.zh.md')) {
      $path = Join-Path $repo $f
      if (-not (Test-Path $path)) { Warn "跳过（不存在）：$f"; continue }
      $text = Get-Content $path -Raw -Encoding UTF8
      if ($text -notmatch [regex]::Escape($pkg.version)) { Warn "未找到旧版本号 $($pkg.version)：$f"; continue }
      $text = $text -replace [regex]::Escape($pkg.version), $target
      [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
      Ok "$f → $target"
    }
    $pkg = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($pkg.version -ne $target) { Fail "package.json 版本改写失败：$($pkg.version)" }
  }
}

$branchNow = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) { Fail '当前目录不是 git 仓库' }
if ($branchNow -ne $Branch) {
  Fail "当前分支是 $branchNow，发布要求 $Branch（如需强制，请改 -Branch 参数）"
}
Ok "分支 $Branch"

& git rev-parse -q --verify "refs/tags/$tag" > $null 2>&1
if ($LASTEXITCODE -eq 0) { Fail "本地已存在标签 $tag，无法重复发布" }
Ok "本地无标签 $tag"

$remoteTag = (& git ls-remote --tags $Remote "refs/tags/$tag" 2>$null)
if ($remoteTag) { Fail "远端已存在标签 $tag，无法重复发布" }
Ok "远端无标签 $tag"

if (-not $SkipNpm) {
  $published = NpmQuiet @('view', "$name@$target", 'version')
  if ($published.ok -and $published.out -eq $target) {
    Fail "npm 上已存在 $name@$target，无法重复发布"
  }
  Ok "npm 上尚无 $target"
  $who = NpmQuiet @('whoami')
  if (-not $who.ok -or -not $who.out) { Fail 'npm 未登录，请先 npm login' }
  Ok "npm 已登录：$($who.out)"
}

if (-not $SkipGitHub) {
  & gh --version > $null 2>&1
  if ($LASTEXITCODE -ne 0) { Fail '未安装 gh CLI，无法创建 GitHub Release（可用 -SkipGitHub 跳过）' }
  & gh auth status > $null 2>&1
  if ($LASTEXITCODE -ne 0) { Fail 'gh 未登录，请先 gh auth login（可用 -SkipGitHub 跳过）' }
  Ok "gh CLI 已登录"
}

# 打包预检：确认将要发布的内容
Step "打包预检（npm pack --dry-run）"
$pack = NpmQuiet @('pack', '--dry-run')
if (-not $pack.ok) { Fail "npm pack 预检失败：`n$($pack.lines -join "`n")" }
$packOut = $pack.lines
$fileCount = ($packOut | Select-String -Pattern 'total files' | Select-Object -First 1)
$pkgSize = ($packOut | Select-String -Pattern 'package size' | Select-Object -First 1)
if ($fileCount) { Info ($fileCount -join '').Trim() }
if ($pkgSize) { Info ($pkgSize -join '').Trim() }
$hasClient = ($packOut | Select-String -Pattern 'lib/client\.js').Count -gt 0
$hasHost = ($packOut | Select-String -Pattern 'lib/host\.js').Count -gt 0
if (-not ($hasClient -and $hasHost)) { Fail '打包内容缺少 lib/client.js 或 lib/host.js' }
Ok "产物包含 lib/client.js 与 lib/host.js"

$dirty = (& git status --porcelain)
$dirtyCount = if ($dirty) { @($dirty).Count } else { 0 }
if ($dirtyCount -gt 0) {
  Info "待提交改动 $dirtyCount 项："
  @($dirty) | ForEach-Object { Info "  $_" }
} else {
  Info "工作区干净（无待提交改动）"
}

if ($DryRun) {
  Step "DryRun 结束"
  Info "预检全部通过，实际执行将依次："
  $n = 0
  if ($needsBump) { $n++; Info "  $n. 改写版本号 → $target（5 个文件）" }
  $n++; Info "  $n. git commit（若有改动）"
  $n++; Info "  $n. git tag -a $tag"
  $n++; Info "  $n. git push $Remote $Branch（+ 标签）$(if ($SkipPush) { '  [跳过]' })"
  $n++; Info "  $n. npm publish$(if ($SkipNpm) { '  [跳过]' })"
  $n++; Info "  $n. gh release create $tag（附 npm tarball）$(if ($SkipGitHub) { '  [跳过]' })"
  exit 0
}

# ---------- 二次确认 ----------
if (-not $Yes) {
  Write-Host ""
  $answer = Read-Host "确认发布 $name@$target ？(y/N)"
  if ($answer -notmatch '^(y|Y|yes|YES)$') { Warn '已取消'; exit 0 }
}

# ---------- 1) 提交 ----------
Step "提交改动"
$dirty = (& git status --porcelain)
if (-not $dirty) {
  Ok '工作区干净，跳过提交'
} else {
  Run 'git' @('add', '-A')
  $commitMsg = if ($Message) { $Message } else { "release: $name@$target" }
  Run 'git' @('commit', '-m', $commitMsg)
  Ok "已提交：$commitMsg"
}

# ---------- 2) 打标签 ----------
Step "创建标签 $tag"
$tagMsg = if ($Message) { $Message } else { "$name@$target" }
Run 'git' @('tag', '-a', $tag, '-m', $tagMsg)
Ok "标签已创建：$tag"

# ---------- 3) 推送 ----------
if ($SkipPush) {
  Step "推送"
  Warn '已按 -SkipPush 跳过推送（标签仅存在于本地）'
} else {
  Step "推送提交与标签"
  Run 'git' @('push', $Remote, $Branch)
  Run 'git' @('push', $Remote, $tag)
  Ok "已推送到 $Remote/$Branch 与 $tag"
}

# ---------- 4) 发布 npm ----------
if ($SkipNpm) {
  Step "npm publish"
  Warn '已按 -SkipNpm 跳过'
} else {
  Step "发布到 npm"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $pubOut = (& npm publish --access public 2>&1 | Out-String); $pubCode = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  ($pubOut -split "`r?`n" | Where-Object { $_ -match '\S' } | Select-Object -Last 6) | ForEach-Object { Info $_ }
  if ($pubCode -ne 0) { Fail "npm publish 失败（exit $pubCode）" }
  $check = NpmQuiet @('view', "$name@$target", 'version')
  if ($check.out -ne $target) { Fail "npm 上未能确认 $target 已发布" }
  Ok "npm 已发布：$name@$target"
}

# ---------- 5) GitHub Release ----------
if ($SkipGitHub) {
  Step "GitHub Release"
  Warn '已按 -SkipGitHub 跳过'
} else {
  Step "创建 GitHub Release（附 tarball）"
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("wbg-release-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $asset = $null
    if (-not $SkipNpm) {
      Push-Location $tmp
      try { NpmQuiet @('pack', "$name@$target") | Out-Null } finally { Pop-Location }
      $asset = Get-ChildItem $tmp -Filter '*.tgz' | Select-Object -First 1
      if ($asset) { Ok "已取得 npm 产物：$($asset.Name)（$([math]::Round($asset.Length / 1KB, 1)) KB）" }
      else { Warn '未能取得 npm 产物，Release 将不带附件' }
    } else {
      Warn '跳过 npm，Release 不带附件'
    }

    $notesFile = Join-Path $tmp 'notes.md'
    $body = @"
$releaseNotes

## 安装

``````bash
npm install $name
``````
"@
    if ($asset) {
      $body += @"

本 Release 附带的 ``$($asset.Name)`` 与 npm 上的产物完全一致（同一 tarball），可直接下载安装：

``````bash
npm install ./$($asset.Name)
``````
"@
    }
    $body += @"


完整变更见 [CHANGELOG.md](https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)/blob/$Branch/CHANGELOG.md)。
"@
    [System.IO.File]::WriteAllText($notesFile, $body, (New-Object System.Text.UTF8Encoding($false)))

    $ghArgs = @('release', 'create', $tag, '--title', "$tag — $name", '--notes-file', $notesFile)
    if ($asset) { $ghArgs += $asset.FullName }
    $ghOut = (& gh @ghArgs 2>&1)
    if ($LASTEXITCODE -ne 0) { Fail "gh release create 失败：`n$ghOut" }
    Ok "Release 已创建：$($ghOut -join '').Trim()"
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ---------- 收尾 ----------
Step "发布完成"
Info "包名/版本 : $name@$target"
Info "标签      : $tag"
if (-not $SkipNpm) { Info "npm       : https://www.npmjs.com/package/$name/v/$target" }
if (-not $SkipGitHub) { Info "Release   : https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner 2>$null)/releases/tag/$tag" }
Info ""
$final = (& git status --porcelain)
if ($final) { Warn "工作区仍有未提交内容：`n$final" } else { Ok '工作区干净' }
