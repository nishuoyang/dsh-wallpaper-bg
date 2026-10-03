@echo off
setlocal EnableExtensions
rem ============================================================
rem  设置开机自启：注册 HKCU Run，开机时用 wscript 无窗口启动
rem  本目录下的 启动服务-静默.vbs（直接引用原文件，不复制）。
rem
rem  同时把「启动应用」里的状态记录（StartupApproved）归一到「已启用」：
rem  任务管理器 /「设置 → 应用 → 启动」里的「禁用」并不删除 Run 值，
rem  只把该状态写成 01（表现为 Run 值还在、登录时却被跳过）。不归一的话，
rem  本脚本会打印成功，而登录时启动项仍会被 Windows 跳过。
rem ============================================================
set "RUNKEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "APPROVED=HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
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

rem ---- 1) 注册 HKCU Run ----
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

rem ---- 2) 把「启动应用」状态归一到「已启用」 ----
rem 写入的是 02 00 00 00 …（12 字节），与 Windows 自己给「从未被禁用过」的
rem 启动项写下的形态一致；01 开头表示「已禁用」，那才是会被跳过的那种。
reg add "%APPROVED%" /v "%VALUE%" /t REG_BINARY /d 020000000000000000000000 /f >nul 2>nul
if errorlevel 1 (
  echo [警告] 未能写入启动状态记录；若任务管理器里显示「已禁用」，请在那里手动启用。
  goto :report
)

set "RAW="
for /f "tokens=*" %%a in ('reg query "%APPROVED%" /v "%VALUE%" 2^>nul ^| findstr /i "REG_BINARY"') do set "RAW=%%a"
set "STATE="
if defined RAW for %%b in (%RAW%) do set "STATE=%%b"
if not defined STATE goto :state_unknown
if /i "%STATE:~0,2%"=="01" goto :state_disabled
echo [状态] 启动应用记录已置为「已启用」（前两字节 %STATE:~0,2%）。
goto :report

:state_disabled
echo [警告] 启动状态仍读到「已禁用」（01）：请到「任务管理器 → 启动」里把
echo        「%VALUE%」改成「已启用」，否则登录时不会启动。
goto :report

:state_unknown
echo [提示] 启动状态记录已写入，但回读不到（reg query 没返回 REG_BINARY），无法确认。
goto :report

:report
echo [成功] 已设置开机自启（注册表 HKCU\...\Run）。
echo        登录 Windows 后 WE API 将在后台自动启动（无窗口）。
echo.
echo 服务目录：%~dp0
echo 运行日志：%~dp0we-api.log
echo 取消自启：双击「取消开机自启.bat」
echo 怎么验证：重启后打开 http://127.0.0.1:8088/health 应返回 JSON；
echo           或「任务管理器 → 启动」里确认「%VALUE%」是「已启用」。
echo 提示：若以后移动过 wallpaper-engine-api 目录，请重新双击本脚本。
echo.
pause
