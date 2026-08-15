@echo off
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\WE-API-静默启动.vbs" (
  del /q "%STARTUP%\WE-API-静默启动.vbs" >nul
  echo [成功] 已取消开机自启。
) else (
  echo [提示] 未发现开机自启项，无需处理。
)
echo.
pause