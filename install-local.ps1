# 本地安装 dsh-wallpaper-bg（开发模式，junction 实时生效）
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File .\install-local.ps1
# 等价于：node .\bin\dsh-wallpaper-bg.js install
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $repo 'bin\dsh-wallpaper-bg.js') install

Write-Host ""
Write-Host "安装完成后："
Write-Host "  1. 重启 DSH（Ctrl+C 后重新运行 dsh web）"
Write-Host "  2. 新建会话时选择预设「壁纸背景 (standard)」"
Write-Host "  3. 设置 → 壁纸 开始使用"
Write-Host "  （可选）WE 壁纸库：进入 wallpaper-engine-api 目录执行 npm install，再运行 启动服务.bat"
