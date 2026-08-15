@echo off
rem ============================================================
rem  关窗后验证：服务进程 / 端口 / 应用日志 一键检查
rem  用法：检查进程.cmd            （默认查 3080 端口）
rem        检查进程.cmd 3081       （改了端口就带上参数）
rem ============================================================
chcp 65001 >nul
set PORT=%~1
if "%PORT%"=="" set PORT=3080

echo === [1] dsh 服务进程（命令行含 bin.js web）===
echo      （下面无输出 = 服务已全部退出）
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bin\.js web' } | ForEach-Object { 'PID ' + $_.ProcessId + '  ' + $_.CommandLine }"
echo.
echo === [2] 端口 %PORT% 监听情况（下面无输出 = 已释放）===
netstat -ano | findstr :%PORT%
echo.
echo === [3] 桌面端日志末尾 12 行 ===
set LOG=%APPDATA%\dsh-desktop\desktop.log
if not exist "%LOG%" set LOG=%~dp0desktop.log
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content '%LOG%' -Tail 12 -ErrorAction SilentlyContinue"
echo.
echo 关键看日志里有没有这两行：
echo   "进程树 XXXX 已终止"         ← taskkill 成功
echo   "确认：服务进程 XXXX 已退出" ← 进程已确认消失
pause
