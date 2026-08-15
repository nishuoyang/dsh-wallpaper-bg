@echo off
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
copy /y "%~dp0启动服务-静默.vbs" "%STARTUP%\WE-API-静默启动.vbs" >nul
if errorlevel 1 (
  echo [错误] 注册失败，请手动复制「启动服务-静默.vbs」到：
  echo   %STARTUP%
  echo.
  pause
  exit /b 1
)
echo [成功] 已注册开机自启：登录 Windows 时 WE API 将在后台自动启动（无窗口）。
echo.
echo 服务目录：%~dp0
echo 运行日志：%~dp0we-api.log
echo 取消自启：双击「取消开机自启.bat」
echo.
pause