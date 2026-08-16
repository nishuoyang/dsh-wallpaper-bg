@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

rem ---- 旧服务可能以高权限启动，普通权限杀不掉：需要管理员权限 ----
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] 需要管理员权限，正在请求提升（UAC 弹窗请点「是」）...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

rem ---- 结束占用 8088 的旧服务 ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8088 " ^| findstr LISTENING') do (
  echo [INFO] 结束旧进程 %%p
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

rem ---- 通过 explorer 以普通权限静默重启（与开机自启同一脚本）----
explorer.exe "%~dp0启动服务-静默.vbs"

rem ---- 等待端口就绪 ----
set /a tries=0
:wait
netstat -ano | findstr ":8088 " | findstr LISTENING >nul
if not errorlevel 1 goto :ok
set /a tries+=1
if %tries% geq 10 goto :fail
timeout /t 1 /nobreak >nul
goto :wait

:ok
echo.
echo [成功] WE API 已用新代码重启，正在 8088 端口运行。
echo 验证：浏览器打开 http://127.0.0.1:8088/health
echo 日志：%~dp0we-api.log
goto :end

:fail
echo.
echo [错误] 8088 端口仍未监听，请查看 we-api.log。
:end
echo.
pause
