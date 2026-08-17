@echo off
chcp 65001 >nul
rem ============================================================
rem  停止 DeepSeek Harness 服务（网页版配套）
rem  结束所有命令行含 "bin.js web" 的 node 进程及其子进程
rem ============================================================
title 停止 DeepSeek Harness 服务

echo [i] 查找并停止 dsh 服务进程...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'bin\.js web' } | ForEach-Object { Write-Host ('[i] 停止 PID ' + $_.ProcessId); taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }"

echo [i] 完成。可用 netstat -ano ^| findstr :3080 确认端口已释放。
pause
