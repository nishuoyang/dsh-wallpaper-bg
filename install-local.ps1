# 本地安装 dsh-wallpaper-bg（开发模式，junction 实时生效）
# 用法：在仓库根目录执行  powershell -ExecutionPolicy Bypass -File .\install-local.ps1
# 等价于：node .\bin\dsh-wallpaper-bg.js install
#
# 只处理命令行部署（profile 用户补丁层）；desktop profile 归 Electron 桌面端独占，
# 桌面端请在应用内「设置 → 插件」输入 dsh-wallpaper-bg 安装。
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $repo 'bin\dsh-wallpaper-bg.js') install

Write-Host ""
Write-Host "安装完成后："
Write-Host "  1. dsh web：刷新页面即可（补丁层热重载）；重启过服务的话下次启动也自动生效"
Write-Host "  2. 桌面端：在应用内「设置 → 插件」输入 dsh-wallpaper-bg 安装（终端无法启动 desktop profile）"
Write-Host "  3. 打开 设置 → 壁纸 开始使用"
Write-Host "  （可选）WE 壁纸库：装配套插件 dsh-wallpaper-engine-api 即可（随 DSH 启停，不需要独立服务）"
Write-Host "      手动部署旧服务：https://github.com/nishuoyang/wallpaper-engine-api"
