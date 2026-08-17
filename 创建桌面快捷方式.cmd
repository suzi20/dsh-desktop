@echo off
chcp 65001 >nul
rem ============================================================
rem  创建桌面快捷方式（网页版 + 桌面版，图标为黑鲸）
rem ============================================================
title 创建桌面快捷方式

set "ROOT=%~dp0"
set "ICON=%ROOT%assets\icon.ico"
if not exist "%ICON%" (
  echo [X] 找不到图标文件：%ICON%
  pause
  exit /b 1
)

echo [1/2] 创建"DeepSeek Harness 网页版"快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\DeepSeek Harness 网页版.lnk'); $lnk.TargetPath='%ROOT%启动网页版.cmd'; $lnk.WorkingDirectory='%ROOT%'; $lnk.IconLocation='%ICON%,0'; $lnk.Description='DeepSeek Harness 网页版：双击启动服务并打开浏览器，关控制台即停止'; $lnk.Save()"
if errorlevel 1 (
  echo [X] 网页版快捷方式创建失败
  pause
  exit /b 1
)

set "EXE=%ROOT%dist\win-unpacked\DeepSeek-Harness-Desktop.exe"
if exist "%EXE%" (
  echo [2/2] 创建"DeepSeek Harness 桌面版"快捷方式...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\DeepSeek Harness 桌面版.lnk'); $lnk.TargetPath='%EXE%'; $lnk.WorkingDirectory='%ROOT%dist\win-unpacked'; $lnk.IconLocation='%EXE%,0'; $lnk.Description='DeepSeek Harness 桌面版（Electron，内存占用较高）'; $lnk.Save()"
  if errorlevel 1 (
    echo [X] 桌面版快捷方式创建失败
    pause
    exit /b 1
  )
) else (
  echo [2/2] 跳过：桌面版未打包（dist\win-unpacked 不存在）
)

echo.
echo [OK] 完成！桌面上已有：
echo      "DeepSeek Harness 网页版"（黑鲸图标，推荐）
echo      "DeepSeek Harness 桌面版"（如有便携包）
echo.
pause
