@echo off
setlocal EnableExtensions
rem ============================================================
rem  设置开机自启：注册 HKCU Run，开机时用 wscript 无窗口启动
rem  本目录下的 启动服务-静默.vbs（直接引用原文件，不复制）。
rem ============================================================
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "VALUE=WE-API 静默启动"
set "VBS=%~dp0启动服务-静默.vbs"

if not exist "%VBS%" (
  echo [错误] 未找到启动脚本：%VBS%
  echo        请把本脚本放在 wallpaper-engine-api 目录内运行。
  pause
  exit /b 1
)

rem ---- 清理旧版「复制到启动文件夹」注册方式（若存在） ----
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\WE-API-静默启动.vbs" (
  del /q "%STARTUP%\WE-API-静默启动.vbs" >nul
  echo [清理] 已移除旧版启动项副本（启动文件夹\WE-API-静默启动.vbs）。
)
if exist "%STARTUP%\we-api.log" del /q "%STARTUP%\we-api.log" >nul

rem ---- 注册 HKCU Run ----
reg add "%RUNKEY%" /v "%VALUE%" /t REG_SZ /d "\"wscript.exe\" \"%VBS%\"" /f >nul
if errorlevel 1 (
  echo [错误] 写入注册表失败。
  pause
  exit /b 1
)

reg query "%RUNKEY%" /v "%VALUE%" >nul 2>nul
if errorlevel 1 (
  echo [错误] 注册表写入校验失败。
  pause
  exit /b 1
)

echo [成功] 已设置开机自启（注册表 HKCU\...\Run）。
echo        登录 Windows 后 WE API 将在后台自动启动（无窗口）。
echo.
echo 服务目录：%~dp0
echo 运行日志：%~dp0we-api.log
echo 取消自启：双击「取消开机自启.bat」
echo 提示：若以后移动过 wallpaper-engine-api 目录，请重新双击本脚本。
echo.
pause
