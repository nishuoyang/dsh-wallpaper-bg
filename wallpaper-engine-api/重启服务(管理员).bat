@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0restart-debug.log"
echo ==== %date% %time% start ====>> "%LOG%" 2>&1

rem ---- 1) try stopping the listener without elevation first ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8088 " ^| findstr LISTENING') do (
  echo [INFO] stopping %%p ...>> "%LOG%" 2>&1
  taskkill /PID %%p /F >> "%LOG%" 2>&1
)
timeout /t 1 /nobreak >nul
netstat -ano | findstr ":8088 " | findstr LISTENING >nul
if errorlevel 1 goto :relaunch

rem ---- 2) still listening: elevate once and retry the kill ----
echo [INFO] still listening, need admin...>> "%LOG%" 2>&1
fltmc >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] relaunching elevated...>> "%LOG%" 2>&1
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8088 " ^| findstr LISTENING') do (
  echo [INFO] elevated stop %%p ...>> "%LOG%" 2>&1
  taskkill /PID %%p /F >> "%LOG%" 2>&1
)
timeout /t 1 /nobreak >nul

:relaunch
rem ---- 3) silent relaunch (same script as autostart) ----
for %%v in ("%~dp0*.vbs") do explorer.exe "%%v"
set /a tries=0
:wait
netstat -ano | findstr ":8088 " | findstr LISTENING >nul
if not errorlevel 1 goto :ok
set /a tries+=1
if %tries% geq 10 goto :fail
timeout /t 1 /nobreak >nul
goto :wait

:ok
echo [OK] restarted >> "%LOG%" 2>&1
echo.
echo [OK] WE API restarted on port 8088 with the new code.
echo Verify: http://127.0.0.1:8088/health
echo Logs: restart-debug.log and we-api.log in this folder.
goto :end

:fail
echo [ERROR] port not listening >> "%LOG%" 2>&1
echo.
echo [ERROR] Port 8088 is still not listening. See restart-debug.log and we-api.log.
:end
echo.
pause
