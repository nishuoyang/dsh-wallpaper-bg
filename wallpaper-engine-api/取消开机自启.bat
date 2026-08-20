@echo off
setlocal
rem ============================================================
rem  取消开机自启：删除 HKCU Run 注册项，并清理旧版
rem  「复制到启动文件夹」方式遗留的副本与日志。
rem ============================================================
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "VALUE=WE-API 静默启动"

reg query "%RUNKEY%" /v "%VALUE%" >nul 2>nul
if not errorlevel 1 (
  reg delete "%RUNKEY%" /v "%VALUE%" /f >nul
  echo [成功] 已取消开机自启（HKCU Run 注册项已删除）。
) else (
  echo [提示] 未发现注册表自启项。
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\WE-API-静默启动.vbs" (
  del /q "%STARTUP%\WE-API-静默启动.vbs" >nul
  echo [清理] 已移除旧版启动项副本（启动文件夹\WE-API-静默启动.vbs）。
)
if exist "%STARTUP%\we-api.log" (
  del /q "%STARTUP%\we-api.log" >nul
  echo [清理] 已移除启动文件夹里的残留日志 we-api.log。
)
echo.
pause
