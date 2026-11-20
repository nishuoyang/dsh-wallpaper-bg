<#
  dsh-wallpaper-bg 一键发布
  =========================
  固化发布流程：版本校验 → 打包预检 → 提交 → 打标签 → 推送 → npm publish → GitHub Release（附 tarball）

  用法（在仓库根目录执行）：
    .\scripts\release.ps1                      # 发布 package.json 里当前的版本
    .\scripts\release.ps1 -Version 0.5.1       # 先批量改版本号，再发布
    .\scripts\release.ps1 -DryRun              # 只做检查与预览，不产生任何改动
    .\scripts\release.ps1 -Resume              # 上次中断后续跑（已提交/已打标签/已发 npm 自动跳过）
    .\scripts\release.ps1 -SkipGitHub          # 不发 GitHub Release
    .\scripts\release.ps1 -SkipNpm             # 不发布 npm
    .\scripts\release.ps1 -SkipPush            # 不推送到远端（仅本地提交 + 打标签）
    .\scripts\release.ps1 -Yes                 # 跳过二次确认
    .\scripts\release.ps1 -Message "..."       # 自定义提交 / 标签说明
    .\scripts\release.ps1 -NpmWaitSeconds 600  # npm 传播等待上限（秒，默认 300）

  说明：
  - 版本号只认 package.json；-Version 会同步改写 package.json / lib/host.js /
    lib/client.js / README.md / README.en.md 中的版本字符串。
  - CHANGELOG.md 必须已有对应版本的条目，Release 说明直接取自该条目。
  - 预检会拒绝「标签已存在」「npm 上已发布该版本」的重复发布；确认是上一次
    中断留下的现场时用 -Resume 续跑（要求工作区干净、标签指向 HEAD、远端标签一致）。
  - npm 发布后注册表要几十秒~几分钟才会可见（npm 自己会提示 "may take a few
    minutes"），所以校验会轮询等待而不是立刻判定；等满 -NpmWaitSeconds 仍未
    可见时只警告并继续发 GitHub Release，不再中断整条流程。
  - GitHub Release 步骤是幂等的：create 失败会重试，已存在则改为补传附件。
#>
[CmdletBinding()]
param(
  [string]$Version,
  [string]$Message,
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$Resume,
  [switch]$SkipNpm,
  [switch]$SkipGitHub,
  [switch]$SkipPush,
  [int]$NpmWaitSeconds = 300,
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
# 清洗「原生命令 2>&1」的输出：PowerShell 5.1 会把 stderr 包成 NativeCommandError
# 噪音块（首行 `<exe> : <内容>`、随后是「所在位置 行:N 字符: N」/「+ ~~~」/
# CategoryInfo / FullyQualifiedErrorId），而且这些提示是**本地化**的（中文系统上
# 就是「所在位置」），所以不能只匹配英文 "At line:"。这里丢掉噪音、保留真正的
# 错误内容（首行 ` : ` 右边那截），否则 400/502 这类原因会被一起吞掉。
function CleanNative([object[]]$rawLines) {
  $clean = New-Object System.Collections.ArrayList
  foreach ($line in $rawLines) {
    $s = [string]$line
    if ($s -notmatch '\S') { continue }
    $m = [regex]::Match($s, '^\S+\.(?:exe|cmd|bat|ps1)\s*:\s*(?<msg>.*)$')
    if ($m.Success) {
      $msg = $m.Groups['msg'].Value.Trim()
      if ($msg) { [void]$clean.Add($msg) }   # 保留原因，丢掉 "<exe> : " 前缀
      continue
    }
    if ($s -match '^\s*(所在位置|At line)\b' -or
        $s -match '^\s*\+' -or
        $s -match '^\s*(CategoryInfo|FullyQualifiedErrorId)\b') { continue }
    [void]$clean.Add($s.TrimEnd())
  }
  return $clean.ToArray()
}
# 静默执行 npm：吞掉 stderr 噪音（npm 把告警和「版本不存在」都写到 stderr，在
# $ErrorActionPreference='Stop' 下会被当成终止错误），返回 @{ ok; out; lines }
function NpmQuiet([string[]]$npmArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $clean = CleanNative @(& npm @npmArgs 2>&1 | Out-String -Stream)
    $last = if ($clean.Count -gt 0) { $clean[-1].Trim() } else { '' }
    return @{ ok = ($LASTEXITCODE -eq 0); out = $last; lines = $clean }
  } finally {
    $ErrorActionPreference = $prev
  }
}
# 静默执行 gh：与 NpmQuiet 同理（gh 把错误写到 stderr，且 PowerShell 会把它包成
# NativeCommandError）。out 是过滤后的全部输出（多行），便于打印 400/502 之类的原因。
function GhQuiet([string[]]$ghArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $clean = CleanNative @(& gh @ghArgs 2>&1 | Out-String -Stream)
    return @{ ok = ($LASTEXITCODE -eq 0); out = (($clean -join "`n").Trim()); lines = $clean }
  } finally {
    $ErrorActionPreference = $prev
  }
}
# 静默执行 git：git 失败会往 stderr 写 "fatal: ..."，而 2>$null 在 PS 5.1 的
# $ErrorActionPreference='Stop' 下**挡不住** NativeCommandError——远端不可达时
# 整个发布脚本会被一句 fatal 打断（实测：没有 origin 的仓库、GitHub 502 都这样）。
function GitQuiet([string[]]$gitArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $clean = CleanNative @(& git @gitArgs 2>&1 | Out-String -Stream)
    return @{ ok = ($LASTEXITCODE -eq 0); out = (($clean -join "`n").Trim()); lines = $clean }
  } finally {
    $ErrorActionPreference = $prev
  }
}
# 远端标签查询：网络抖动（实测 GitHub 502）不该把发布流程打断成 NativeCommandError，
# 失败时重试 3 次，仍失败则把原因交给调用方处理。
function RemoteTagExists([string]$remote, [string]$tagName) {
  $last = ''
  for ($i = 1; $i -le 3; $i++) {
    $r = GitQuiet @('ls-remote', '--tags', $remote, "refs/tags/$tagName")
    if ($r.ok) { return @{ ok = $true; exists = [bool]($r.out); out = $r.out } }
    $last = $r.out
    Warn "git ls-remote 第 $i 次失败：$last"
    if ($i -lt 3) { Start-Sleep -Seconds (5 * $i) }
  }
  return @{ ok = $false; exists = $false; out = $last }
}
# 从清洗后的输出里取第一行匹配（$pattern 必须带一个捕获组）
function FirstMatch([object[]]$lines, [string]$pattern) {
  foreach ($l in $lines) { if ([string]$l -match $pattern) { return $Matches[1] } }
  return ''
}
# gh 的 url 输出 / 仓库 slug：stdout 可能被 stderr 噪音与换行残片夹着，按形状取
function FirstUrl([object[]]$lines) { return (FirstMatch $lines '^\s*(https?://\S+)\s*$') }
function FirstSlug([object[]]$lines) { return (FirstMatch $lines '^\s*([\w.\-]+/[\w.\-]+)\s*$') }
# npm 上是否已有 <pkg>@<ver>：强制回源（--prefer-online）绕开本地 metadata 缓存，
# 否则刚发布完可能读到旧 packument，误判成「还没发上去」。判定用「输出里有哪一行
# 正好等于版本号」而不是「最后一行」——npm 的告警也写 stderr，顺序不保证。
function NpmVersionVisible([string]$pkgName, [string]$ver) {
  $r = NpmQuiet @('view', "$pkgName@$ver", 'version', '--prefer-online')
  $hit = @($r.lines | Where-Object { ([string]$_).Trim() -eq $ver }).Count -gt 0
  return @{ visible = ($r.ok -and $hit); out = $r.out }
}
# 发布后轮询等待注册表可见。npm publish 成功 ≠ 立刻可查：npm 会提示
# "Your package is being processed and may take a few minutes to become
# available"（实测约 3 分钟）。等到超时返回 $false，由调用方决定如何处理。
function WaitForNpmVersion([string]$pkgName, [string]$ver, [int]$timeoutSeconds) {
  $start = Get-Date
  $deadline = $start.AddSeconds([Math]::Max(0, $timeoutSeconds))
  $attempt = 0
  $delay = 10
  while ($true) {
    $attempt++
    if ((NpmVersionVisible $pkgName $ver).visible) {
      if ($attempt -gt 1) {
        Ok "npm 已可见 $pkgName@$ver（等待 $([int]((Get-Date) - $start).TotalSeconds) 秒）"
      }
      return $true
    }
    $left = [int]($deadline - (Get-Date)).TotalSeconds
    if ($left -le 0) {
      Warn "$timeoutSeconds 秒内 npm 上仍未出现 $pkgName@$ver"
      return $false
    }
    $wait = [Math]::Min($delay, $left)
    Info "npm 传播中：$pkgName@$ver 尚不可见（第 $attempt 次尝试，${left}s 后放弃等待）"
    Start-Sleep -Seconds $wait
    $delay = [Math]::Min($delay * 2, 40)
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
    foreach ($f in @('package.json', 'lib/host.js', 'lib/client.js', 'README.md', 'README.en.md')) {
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

# 走 GitQuiet：`git rev-parse` 失败会写 stderr，在 EAP='Stop' 下会先被包成终止错误，
# 下面那句友好提示以前根本轮不到执行。
$branchRes = GitQuiet @('rev-parse', '--abbrev-ref', 'HEAD')
if (-not $branchRes.ok) { Fail "当前目录不是 git 仓库（或 git 不可用）：`n$($branchRes.out)" }
$branchNow = $branchRes.out
if ($branchNow -ne $Branch) {
  Fail "当前分支是 $branchNow，发布要求 $Branch（如需强制，请改 -Branch 参数）"
}
Ok "分支 $Branch"

# -Resume：上一次发布中断后的续跑。要求现场是「已提交、已打标签」的状态，
# 否则提交步骤会移动 HEAD、标签就对不上了。
$headRes = GitQuiet @('rev-parse', 'HEAD')
if (-not $headRes.ok) { Fail "读取 HEAD 失败：`n$($headRes.out)" }
$headCommit = $headRes.out
if ($Resume) {
  $dirtyNow = @(& git status --porcelain)
  if ($dirtyNow.Count -gt 0) {
    Fail "-Resume 要求工作区干净（上次发布已完成提交），当前仍有 $($dirtyNow.Count) 项未提交改动：`n$($dirtyNow -join "`n")"
  }
  Ok "-Resume：工作区干净"
}

& git rev-parse -q --verify "refs/tags/$tag" > $null 2>&1
if ($LASTEXITCODE -eq 0) {
  if (-not $Resume) {
    Fail "本地已存在标签 $tag，无法重复发布（若这是上次中断留下的现场，用 -Resume 续跑）"
  }
  $tagCommit = (& git rev-list -n 1 $tag).Trim()
  if ($tagCommit -ne $headCommit) {
    Fail "-Resume：标签 $tag 指向 $tagCommit，与 HEAD $headCommit 不一致，不能续跑（请手工确认后处理）"
  }
  Ok "-Resume：标签 $tag 已存在且指向 HEAD（跳过打标签）"
  $tagLocalExists = $true
} else {
  Ok "本地无标签 $tag"
  $tagLocalExists = $false
}

$remoteCheck = RemoteTagExists $Remote $tag
if (-not $remoteCheck.ok) {
  Fail "无法查询远端标签（远端 $Remote 不可达？）：`n$($remoteCheck.out)`n请检查网络 / 远端配置后重试（换远端用 -Remote）"
}
$remoteTag = $remoteCheck.out
if ($remoteTag) {
  if (-not $Resume) {
    Fail "远端已存在标签 $tag，无法重复发布（若这是上次中断留下的现场，用 -Resume 续跑）"
  }
  Ok "-Resume：远端已有标签 $tag（跳过推送标签）"
  $tagRemoteExists = $true
} else {
  Ok "远端无标签 $tag"
  $tagRemoteExists = $false
}

$npmAlreadyPublished = $false
$npmVerified = $false
if (-not $SkipNpm) {
  # 强制回源：本地 metadata 缓存可能还停在「没有这个版本」的旧状态
  $published = NpmVersionVisible $name $target
  if ($published.visible) {
    if (-not $Resume) {
      Fail "npm 上已存在 $name@$target，无法重复发布（若这是上次中断留下的现场，用 -Resume 续跑）"
    }
    Ok "-Resume：npm 上已有 $target（跳过 publish）"
    $npmAlreadyPublished = $true
    $npmVerified = $true
  } else {
    Ok "npm 上尚无 $target"
    $who = NpmQuiet @('whoami')
    if (-not $who.ok -or -not $who.out) { Fail 'npm 未登录，请先 npm login' }
    Ok "npm 已登录：$($who.out)"
  }
}

if (-not $SkipGitHub) {
  # 走 GhQuiet：gh 的部分提示/错误写在 stderr，直接调用在 EAP='Stop' 下会变成终止错误
  if (-not (GhQuiet @('--version')).ok) { Fail '未安装 gh CLI，无法创建 GitHub Release（可用 -SkipGitHub 跳过）' }
  if (-not (GhQuiet @('auth', 'status')).ok) { Fail 'gh 未登录，请先 gh auth login（可用 -SkipGitHub 跳过）' }
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
  $n++; if ($tagLocalExists) { Info "  $n. git tag -a $tag  [已存在，跳过]" } else { Info "  $n. git tag -a $tag" }
  $n++; Info "  $n. git push $Remote $Branch$(if (-not $tagRemoteExists) { '（+ 标签）' })$(if ($SkipPush) { '  [跳过]' })"
  $n++; if ($npmAlreadyPublished) { Info "  $n. npm publish  [npm 上已有 $target，跳过]" } elseif ($SkipNpm) { Info "  $n. npm publish  [跳过]" } else { Info "  $n. npm publish + 轮询校验（最多 $NpmWaitSeconds 秒）" }
  $n++; Info "  $n. gh release create $tag（附 npm tarball，幂等）$(if ($SkipGitHub) { '  [跳过]' })"
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
if ($tagLocalExists) {
  Ok "标签已存在且指向 HEAD，跳过：$tag"
} else {
  $tagMsg = if ($Message) { $Message } else { "$name@$target" }
  Run 'git' @('tag', '-a', $tag, '-m', $tagMsg)
  Ok "标签已创建：$tag"
}

# ---------- 3) 推送 ----------
if ($SkipPush) {
  Step "推送"
  Warn '已按 -SkipPush 跳过推送（标签仅存在于本地）'
} else {
  Step "推送提交与标签"
  Run 'git' @('push', $Remote, $Branch)
  if ($tagRemoteExists) {
    Ok "远端已有标签 $tag，跳过推送标签"
  } else {
    Run 'git' @('push', $Remote, $tag)
  }
  Ok "已推送到 $Remote/$Branch 与 $tag"
}

# ---------- 4) 发布 npm ----------
if ($SkipNpm) {
  Step "npm publish"
  Warn '已按 -SkipNpm 跳过'
} elseif ($npmAlreadyPublished) {
  Step "发布到 npm"
  Warn "npm 上已有 $name@$target，跳过 publish（-Resume）"
} else {
  Step "发布到 npm"
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $pubOut = (& npm publish --access public 2>&1 | Out-String); $pubCode = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  ($pubOut -split "`r?`n" | Where-Object { $_ -match '\S' } | Select-Object -Last 6) | ForEach-Object { Info $_ }
  if ($pubCode -ne 0) { Fail "npm publish 失败（exit $pubCode）" }
  # 上传已成功（退出码 0，上面能看到 "+ $name@$target"）；这里的校验只是确认注册表
  # 已可见——npm 明确提示「may take a few minutes」，所以轮询等待，且等不到也不中断
  # 后续的 GitHub Release，只在结尾警告（以前这里是立刻判定，直接把流程卡死）。
  Step "校验 npm 可见性（最多等待 $NpmWaitSeconds 秒）"
  $npmVerified = WaitForNpmVersion $name $target $NpmWaitSeconds
  if ($npmVerified) {
    Ok "npm 已发布：$name@$target"
  } else {
    Warn "npm 上传已成功（见上面的 \"+ $name@$target\"），但 $NpmWaitSeconds 秒内注册表还查不到该版本"
    Warn "稍后可用 npm view $name@$target version --prefer-online 复查；继续创建 GitHub Release"
  }
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
      # 在本地 checkout 上打包，**不要**写成 `npm pack "$name@$target"`：
      # 后者会去 registry 下载 tarball，而刚 publish 完 tarball 端点比 packument 晚传播，
      # 经常 404 —— 0.5.21 / 0.5.22 两次「Release 不带附件」都是这个 404，与网络无关。
      # 本地打包的内容与刚发布的一致（同一份 checkout、同一个版本号），也不依赖任何网络。
      $packOut = NpmQuiet @('pack', $repo, '--pack-destination', $tmp)
      if (-not $packOut.ok) {
        # 注意别只打印最后一行：Out-String 会按控制台宽度折行，末行可能只剩两个字符
        # （实测打出过 "npm pack 失败：og"，就是 .log 路径被折行后的尾巴），排障要看全文。
        Warn "npm pack 失败：$($packOut.lines -join ' | ')"
      }
      $asset = Get-ChildItem $tmp -Filter "$name-*.tgz" | Select-Object -First 1
      if ($asset) { Ok "已取得 npm 产物：$($asset.Name)（$([math]::Round($asset.Length / 1KB, 1)) KB）" }
      else { Warn '未能取得 npm 产物，Release 将不带附件' }
    } else {
      Warn '跳过 npm，Release 不带附件'
    }

    $notesFile = Join-Path $tmp 'notes.md'
    # 仓库 slug 取一次即可，失败时退化成不带链接（别让它把 Release 说明写坏）
    $slug = FirstSlug (GhQuiet @('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner')).lines
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
    if ($slug) {
      $body += @"


完整变更见 [CHANGELOG.md](https://github.com/$slug/blob/$Branch/CHANGELOG.md)。
"@
    } else {
      $body += @"


完整变更见仓库中的 CHANGELOG.md。
"@
    }
    [System.IO.File]::WriteAllText($notesFile, $body, (New-Object System.Text.UTF8Encoding($false)))

    $ghArgs = @('release', 'create', $tag, '--title', "$tag — $name", '--notes-file', $notesFile)
    if ($asset) { $ghArgs += $asset.FullName }
    # GitHub API 偶发 400/502（实测），所以重试；若 Release 其实已经建好，则改为补附件，
    # 让这一步在「上次跑到这里失败」的情况下也能收敛。
    $created = $false
    $lastOut = ''
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      $res = GhQuiet $ghArgs
      $lastOut = $res.out
      if ($res.ok) {
        $created = $true
        $createdUrl = FirstUrl $res.lines
        Ok ("Release 已创建：" + $(if ($createdUrl) { $createdUrl } else { $res.out }))
        break
      }
      Warn "gh release create 第 $attempt 次失败：$($res.out)"
      if ($attempt -lt 3) { Start-Sleep -Seconds (10 * $attempt) }
    }
    if (-not $created) {
      $view = GhQuiet @('release', 'view', $tag, '--json', 'url', '-q', '.url')
      if (-not $view.ok) { Fail "gh release create 连续 3 次失败：`n$lastOut" }
      $viewUrl = FirstUrl $view.lines
      Warn "Release 已存在，跳过创建：$(if ($viewUrl) { $viewUrl } else { $tag })"
      if ($asset) {
        $up = GhQuiet @('release', 'upload', $tag, $asset.FullName, '--clobber')
        if ($up.ok) { Ok "已补传附件：$($asset.Name)" } else { Warn "附件补传失败：$($up.out)" }
      }
    }
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# ---------- 收尾 ----------
Step "发布完成"
Info "包名/版本 : $name@$target"
Info "标签      : $tag"
if (-not $SkipNpm) {
  if ($npmAlreadyPublished) {
    Info "npm       : $name@$target（本次未重新发布，-Resume 续跑）"
  } elseif ($npmVerified) {
    Info "npm       : https://www.npmjs.com/package/$name/v/$target"
  } else {
    Warn "npm       : 已上传 $name@$target，但注册表可见性未确认——稍后用 npm view $name@$target version --prefer-online 复查"
  }
}
if (-not $SkipGitHub) {
  $slugFinal = FirstSlug (GhQuiet @('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner')).lines
  if ($slugFinal) { Info "Release   : https://github.com/$slugFinal/releases/tag/$tag" }
}
Info ""
$final = (& git status --porcelain)
if ($final) { Warn "工作区仍有未提交内容：`n$final" } else { Ok '工作区干净' }
