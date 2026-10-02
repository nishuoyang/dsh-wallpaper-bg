@echo off
setlocal EnableExtensions EnableDelayedExpansion
title WE API readonly proxy (8088)
cd /d "%~dp0"

rem /setup only rewrites we-api.config, so it stays usable while the service runs
set "SETUP=0"
if /i "%~1"=="/setup" set "SETUP=1"
rem NOSERVE=1 -> the wizard ran while a service was already listening; do not start a second one
set "NOSERVE=0"

rem ---- Port check ----
netstat -ano | findstr ":8088 " | findstr LISTENING >nul
if errorlevel 1 goto :node_check
echo [INFO] Port 8088 is already in use. The service may already be running.
echo        Check http://127.0.0.1:8088/health
if "%SETUP%"=="1" (
  echo        /setup only rewrites we-api.config, so the wizard will run now; the
  echo        running service picks the new settings up after a restart
  echo        ^(double-click 重启服务^(管理员^).bat^).
  echo.
  set "NOSERVE=1"
  goto :node_check
)
echo        To change the settings, stop the running service first, then run:
echo           启动服务.bat /setup
echo        ^(or double-click 重启服务^(管理员^).bat to restart it as it is^)
echo.
pause
exit /b 1

:node_check
rem ---- Node check ----
rem The service runs on the user's own Node.js: the DSH app's bundled runtime does
rem not cover it (the app only runs the plugin, not this helper service).
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo        This service runs on your own Node.js - the DSH app's bundled
  echo        runtime does not cover it. Install Node.js 20 or newer from
  echo        https://nodejs.org/ and run this script again.
  pause
  exit /b 1
)

rem ---- Dependencies: check direct packages and recover missing installs ----
rem Since 0.5.0 the only direct dependency is wallpaper-engine-api (koffi / jpeg-js
rem were removed with desktop capture). Checking its package.json also catches a
rem half-finished install where the folder exists but the package is incomplete.
if not exist "%~dp0node_modules\wallpaper-engine-api\package.json" goto :install_deps
goto :deps_ready

:install_deps
echo [SETUP] Required packages are missing; running npm install ...
call npm install
if errorlevel 1 (
  echo.
  echo [WARN] npm install failed - retrying once with --allow-remote=all.
  echo        npm 12 and newer refuse to fetch a tarball whose registry host is
  echo        not the one you configured ^(error EALLOWREMOTE^). That happens when a
  echo        leftover package-lock.json still pins another registry ^(a mirror^).
  echo.
  call npm install --allow-remote=all
)
if errorlevel 1 (
  echo.
  echo [WARN] Still failing - one more try, ignoring package-lock.json so npm
  echo        resolves through the registry configured in your .npmrc.
  echo        ^(Use this when the registry pinned by the lock file is unreachable.^)
  echo.
  call npm install --no-package-lock
)
if errorlevel 1 (
  echo [ERROR] npm install failed three times. Check your network / npm registry,
  echo         then run it by hand to see the full error:
  echo             cd /d "%~dp0"
  echo             npm install
  pause
  exit /b 1
)

:deps_ready

rem ---- First run wizard ----
if "%SETUP%"=="1" goto :wizard
if exist "%~dp0we-api.config" goto :run

:wizard
echo.
echo ====================== First-run setup ======================
echo This service reads your Wallpaper Engine library (read-only).
echo It needs to know where Wallpaper Engine is installed.
echo.
echo ^(Wallpaper Engine is required: without it there is nothing to list. The
echo  built-in wallpapers and custom uploads in DSH work without this service.^)
echo.

set "DETECTED="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Valve\Steam" /v SteamPath 2^>nul ^| findstr /i SteamPath') do set "STEAMROOT=%%b"
if defined STEAMROOT (
  if exist "!STEAMROOT!\steamapps\common\wallpaper_engine\wallpaper64.exe" set "DETECTED=!STEAMROOT!\steamapps\common\wallpaper_engine"
  if exist "!STEAMROOT!\steamapps\common\wallpaper_engine\wallpaper32.exe" set "DETECTED=!STEAMROOT!\steamapps\common\wallpaper_engine"
)
if defined DETECTED goto :confirm
for %%d in (C D E F G H) do (
  if not defined DETECTED if exist "%%d:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe" set "DETECTED=%%d:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine"
  if not defined DETECTED if exist "%%d:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe" set "DETECTED=%%d:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine"
  if not defined DETECTED if exist "%%d:\Program Files\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe" set "DETECTED=%%d:\Program Files\Steam\steamapps\common\wallpaper_engine"
  if not defined DETECTED if exist "%%d:\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe" set "DETECTED=%%d:\Steam\steamapps\common\wallpaper_engine"
  if not defined DETECTED if exist "%%d:\Steam\steamapps\common\wallpaper_engine\wallpaper32.exe" set "DETECTED=%%d:\Steam\steamapps\common\wallpaper_engine"
)

:confirm
if not defined DETECTED goto :manual
if defined DETECTED for %%F in ("!DETECTED!") do set "DETECTED=%%~fF"
echo Wallpaper Engine found:
echo   !DETECTED!
echo.
set "ANSWER=Y"
set /p ANSWER="Use this path? [Y/n] "
if /i "!ANSWER!"=="n" goto :manual
if /i "!ANSWER!"=="no" goto :manual
set "INSTALL=!DETECTED!"
goto :workshop

rem ---------------------------------------------------------------------------
rem Manual path entry.
rem The automatic search only covers the Steam folder recorded in
rem HKCU\Software\Valve\Steam plus the usual Program Files / <drive>:\Steam
rem locations - a WE installed in a SECOND Steam library (e.g.
rem D:\SteamLibrary\steamapps\common\wallpaper_engine) is only found here.
rem The prompt is bounded: it never loops forever, and "q" quits at any time.
rem ---------------------------------------------------------------------------
:manual
set /a TRIES+=1
if !TRIES! gtr 3 goto :give_up
echo.
if !TRIES! equ 1 echo Wallpaper Engine was not found automatically. Paste its install path.
if !TRIES! gtr 1 echo That path did not work. Paste the Wallpaper Engine install path.
echo Any of these works:
echo   1. The folder containing wallpaper64.exe / wallpaper32.exe
echo      e.g. D:\Steam\steamapps\common\wallpaper_engine
echo   2. The full path to wallpaper64.exe
echo   3. Your Steam folder - the script will look inside it
echo      ^(use this when WE lives in a second Steam library such as
echo       D:\SteamLibrary\steamapps\common\wallpaper_engine^)
echo.
echo Type q and press Enter to quit. You only need this service for the optional
echo "WE library" wallpaper source - built-in wallpapers and custom uploads work
echo without it.
echo.
set "USERPATH="
set /p USERPATH="Path (or q to quit): "
if /i "!USERPATH!"=="q" goto :quit
if /i "!USERPATH!"=="quit" goto :quit
if not defined USERPATH goto :manual
set "USERPATH=!USERPATH:"=!"

set "INSTALL=!USERPATH!"
if /i "!USERPATH:~-15!"=="wallpaper64.exe" for %%F in ("!USERPATH!\..") do set "INSTALL=%%~fF"
if /i "!USERPATH:~-15!"=="wallpaper32.exe" for %%F in ("!USERPATH!\..") do set "INSTALL=%%~fF"
if exist "!INSTALL!\wallpaper64.exe" goto :workshop
if exist "!INSTALL!\wallpaper32.exe" goto :workshop
if exist "!INSTALL!\steamapps\common\wallpaper_engine\wallpaper64.exe" (
  set "INSTALL=!INSTALL!\steamapps\common\wallpaper_engine"
  goto :workshop
)
if exist "!INSTALL!\steamapps\common\wallpaper_engine\wallpaper32.exe" (
  set "INSTALL=!INSTALL!\steamapps\common\wallpaper_engine"
  goto :workshop
)
echo [ERROR] wallpaper64.exe / wallpaper32.exe not found under: !INSTALL!
goto :manual

:give_up
echo.
echo [INFO] Gave up after 3 tries - we-api.config was NOT changed.
echo        If Wallpaper Engine is installed somewhere unusual, run this script
echo        again and paste the folder that contains wallpaper64.exe, or set
echo        WE_INSTALL_PATH by hand ^(see the README^).
echo        If you do not use the WE library source you can simply ignore this
echo        service: built-in wallpapers and custom uploads do not need it.
echo.
pause
exit /b 0

:quit
echo.
echo [INFO] Cancelled - we-api.config was NOT changed.
echo        The WE library source needs this service; built-in wallpapers and
echo        custom uploads do not. Re-run this script whenever you want to set
echo        it up.
echo.
pause
exit /b 0

:workshop
for %%F in ("!INSTALL!") do set "INSTALL=%%~fF"
for %%F in ("!INSTALL!\..") do set "WCOMMON=%%~fF"
for %%F in ("!WCOMMON!\..") do set "WSTEAMAPPS=%%~fF"
set "WSDEF=!WSTEAMAPPS!\workshop\content\431960"
echo.
echo Subscribed-wallpaper library folder:
echo   Default: !WSDEF!
set "USERWS="
set /p USERWS="Library path [Enter = default]: "
if not defined USERWS set "USERWS=!WSDEF!"
set "USERWS=!USERWS:"=!"
if exist "!USERWS!" goto :writecfg
echo [WARN] Folder not found: !USERWS!
echo        The wallpaper list may be empty. Edit we-api.config later if needed.

:writecfg
(
  echo # WE API proxy config - generated by the first-run wizard
  echo # Desktop wallpaper sync just follows WE's current desktop wallpaper,
  echo # read-only: every type renders normally and scenes show their workshop
  echo # preview image. Nothing is sampled, rendered or written to disk.
  echo WE_INSTALL_PATH=!INSTALL!
  echo WE_WORKSHOP_PATH=!USERWS!
) > "%~dp0we-api.config"
echo.
echo Saved to we-api.config.
if "%NOSERVE%"=="1" (
  echo.
  echo [INFO] A service is still running with the OLD settings. Restart it to
  echo        apply them: double-click 重启服务^(管理员^).bat
  echo.
  pause
  exit /b 0
)
echo Desktop wallpaper sync needs nothing enabled: it follows WE's current wallpaper.
echo To redo this setup later, run this script with /setup

:run
echo.
echo ---- Current config ----
for /f "usebackq eol=# delims=" %%L in ("%~dp0we-api.config") do echo   %%L
echo.
echo [START] WE API readonly proxy - http://127.0.0.1:8088
echo Press Ctrl+C or close this window to stop.
echo.
rem Tip: for background (hidden-window) start, double-click 启动服务-静默.vbs
node "%~dp0server.js"
pause
exit /b
