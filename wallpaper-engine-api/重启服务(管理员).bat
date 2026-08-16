@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---- restart may need elevation: the old service can be running elevated ----
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] Requesting administrator privileges (click Yes on the UAC prompt)...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

rem ---- stop whatever listens on 8088 ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8088 " ^| findstr LISTENING') do (
  echo [INFO] Stopping old process %%p ...
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

rem ---- relaunch silently via explorer (same launcher as autostart) ----
for %%v in ("%~dp0*.vbs") do explorer.exe "%%v"

rem ---- wait for the port ----
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
echo [OK] WE API restarted on port 8088 with the new code.
echo Verify: open http://127.0.0.1:8088/health  (should contain "subscriptionsFile")
echo Log: %~dp0we-api.log
goto :end

:fail
echo.
echo [ERROR] Port 8088 is still not listening. Check we-api.log.
:end
echo.
pause
