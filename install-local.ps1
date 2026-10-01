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
Write-Host "  （可选）WE 壁纸库：需要仓库里的 wallpaper-engine-api 服务（不在 npm 包里）"
Write-Host "      进入 wallpaper-engine-api 目录执行 npm install，再运行 启动服务.bat"
