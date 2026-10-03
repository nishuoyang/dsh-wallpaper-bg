@echo off
setlocal EnableExtensions
rem ============================================================
rem  取消开机自启：删除 HKCU Run 注册项，**并**清掉「启动应用」里的
rem  状态记录（StartupApproved）——只删 Run 值会留下它，之后看注册表
rem  或任务管理器都容易误判成「还设着」或「设了却没生效」。
rem  另外清理旧版「复制到启动文件夹」方式遗留的副本与日志。
rem  正在运行的服务不受本脚本影响。
rem ============================================================
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "APPROVED=HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
set "VALUE=WE-API 静默启动"

reg query "%RUNKEY%" /v "%VALUE%" >nul 2>nul
if not errorlevel 1 (
  reg delete "%RUNKEY%" /v "%VALUE%" /f >nul
  echo [成功] 已取消开机自启（HKCU Run 注册项已删除）。
) else (
  echo [提示] 未发现注册表自启项。
)

reg query "%APPROVED%" /v "%VALUE%" >nul 2>nul
if not errorlevel 1 (
  reg delete "%APPROVED%" /v "%VALUE%" /f >nul
  echo [清理] 已移除「启动应用」里的状态记录（StartupApproved）。
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
echo 说明：本脚本只取消「下次登录自动启动」，当前正在运行的服务不受影响。
echo 恢复自启：双击「设置开机自启.bat」。
echo.
pause
