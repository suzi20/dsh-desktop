@echo off
chcp 65001 >nul
rem ============================================================
rem  DeepSeek Harness Desktop 一键安装到桌面
rem
rem  场景 A（便携版包内）：脚本和 DeepSeek-Harness-Desktop.exe
rem        在同一目录 → 直接创建桌面快捷方式
rem  场景 B（源码仓库）：先检查 Node.js，必要时 npm install
rem        + 打包，再创建桌面快捷方式
rem ============================================================
title DeepSeek Harness Desktop 一键安装

setlocal

rem ---- 定位 exe：优先同目录（便携版），其次 dist\win-unpacked（源码构建）----
set "EXE=%~dp0DeepSeek-Harness-Desktop.exe"
if not exist "%EXE%" set "EXE=%~dp0dist\win-unpacked\DeepSeek-Harness-Desktop.exe"
if not exist "%EXE%" goto :need_build

goto :create_shortcut

:need_build
echo [!] 未找到打包好的 exe，将尝试从源码构建（需要 Node.js）...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [X] 未检测到 Node.js。请先安装 Node.js LTS：
  echo     https://nodejs.org/zh-cn/download
  echo     安装后重新运行本脚本。
  echo.
  pause
  exit /b 1
)
echo [1/3] 安装依赖（首次约 2~5 分钟，含 Electron 下载）...
call npm install --loglevel=error
if errorlevel 1 (
  echo [X] npm install 失败。若网络较慢，请先执行：
  echo     set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  echo     set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
  echo     再重新运行本脚本。
  pause
  exit /b 1
)
echo [2/3] 打包便携版...
call npm run dist
if errorlevel 1 (
  echo [X] 打包失败。可尝试：npm run dist 前设置上面的镜像环境变量。
  pause
  exit /b 1
)
set "EXE=%~dp0dist\win-unpacked\DeepSeek-Harness-Desktop.exe"

:create_shortcut
if not exist "%EXE%" (
  echo [X] 仍然找不到程序，安装中止。
  pause
  exit /b 1
)
echo [3/3] 创建桌面快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\DeepSeek Harness 桌面版.lnk');" ^
  "$lnk.TargetPath = '%EXE%';" ^
  "$lnk.WorkingDirectory = '%~dp0';" ^
  "$lnk.IconLocation = '%EXE%,0';" ^
  "$lnk.Description = 'DeepSeek Harness 桌面端：双击启动，关窗即退出';" ^
  "$lnk.Save()"
if errorlevel 1 (
  echo [X] 快捷方式创建失败，请检查桌面目录是否可写。
  pause
  exit /b 1
)
echo.
echo [OK] 完成！桌面已出现"DeepSeek Harness 桌面版"快捷方式。
echo      双击即可使用（首次启动会自动拉起 dsh web 服务并弹出窗口）。
echo.
pause
