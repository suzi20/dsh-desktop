@echo off
chcp 65001 >nul
rem ============================================================
rem  DeepSeek Harness Desktop one-click installer
rem  A) portable package: script sits next to the exe
rem  B) source repo: builds first, then creates the shortcut
rem ============================================================
title DeepSeek Harness Desktop Installer

setlocal

rem ---- locate exe: same dir first, then dist\win-unpacked ----
set "EXE=%~dp0DeepSeek-Harness-Desktop.exe"
if not exist "%EXE%" set "EXE=%~dp0dist\win-unpacked\DeepSeek-Harness-Desktop.exe"
if exist "%EXE%" goto create_shortcut

echo [!] exe not found, trying to build from source...
where node >nul 2>nul
if errorlevel 1 goto no_node

echo [1/3] installing dependencies (first run: 2~5 min)...
call npm install --loglevel=error
if errorlevel 1 goto npm_fail

echo [2/3] building portable package...
call npm run dist
if errorlevel 1 goto build_fail

set "EXE=%~dp0dist\win-unpacked\DeepSeek-Harness-Desktop.exe"
goto create_shortcut

:no_node
echo.
echo [X] Node.js not found. Please install Node.js LTS first:
echo     https://nodejs.org/zh-cn/download
echo     Then run this script again.
echo.
pause
exit /b 1

:npm_fail
echo [X] npm install failed. If the network is slow, try:
echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo     set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
pause
exit /b 1

:build_fail
echo [X] Build failed. Try setting the two mirror env vars above, then rerun.
pause
exit /b 1

:create_shortcut
if not exist "%EXE%" goto not_found
echo [3/3] creating desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\DeepSeek Harness 桌面版.lnk'); $lnk.TargetPath='%EXE%'; $lnk.WorkingDirectory='%~dp0'; $lnk.IconLocation='%EXE%,0'; $lnk.Description='DeepSeek Harness Desktop'; $lnk.Save()"
if errorlevel 1 goto shortcut_fail
echo.
echo [OK] done. Shortcut "DeepSeek Harness 桌面版" is on your desktop.
echo      Double-click it to start. Closing the window stops the server.
echo.
pause
exit /b 0

:not_found
echo [X] exe still not found, abort.
pause
exit /b 1

:shortcut_fail
echo [X] failed to create the shortcut, check desktop write permission.
pause
exit /b 1
