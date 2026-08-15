# 本地安装 dsh-wallpaper-bg（开发模式，junction 实时生效）
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File .\install-local.ps1
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$dsHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$target = Join-Path $dsHome 'node_modules\dsh-wallpaper-bg'

Write-Host "== 安装 junction：$target -> $repo =="
New-Item -ItemType Directory -Force (Join-Path $dsHome 'node_modules') | Out-Null
if (Test-Path $target) {
  Write-Host "已存在，跳过"
} else {
  New-Item -ItemType Junction -Path $target -Target $repo | Out-Null
}

# 验证可从 profile 锚点解析
Write-Host "== 验证解析 =="
node -e "console.log(require.resolve('dsh-wallpaper-bg/package.json', { paths: [process.argv[1]] }))" (Join-Path $dsHome 'profiles\web')

Write-Host ""
Write-Host "== 完成。接下来手动完成预设行 =="
Write-Host "1. 在 DSH 里复制一个预设（如 standard）为新预设，例如 standard-wallpaper"
Write-Host "2. 在该预设目录的 agent.cordis.yml 末尾追加："
Write-Host ""
Write-Host '    # ── 壁纸背景 ────────────────────────────────────────────────────────────'
Write-Host '    - id: wallpaper-bg'
Write-Host '      name: dsh-wallpaper-bg'
Write-Host '      config:'
Write-Host '        weBase: http://127.0.0.1:8088'
Write-Host ""
Write-Host "3. 重启 DSH，新建会话时选择该预设；设置 → 壁纸 即可使用"
Write-Host "4. （可选）WE 壁纸库：进入 wallpaper-engine-api 目录执行 npm install，再运行 启动服务.bat"
Write-Host ""
Write-Host "注：若启动报 Cannot find package，请把报错中 imported from <目录> 抄下来，"
Write-Host "   把本包 junction 建到该目录链上的 node_modules 下（默认锚点是 %USERPROFILE%\.dsh\profiles\web）。"
