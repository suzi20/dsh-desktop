@echo off
rem 双击运行 DeepSeek Harness 桌面版（无控制台窗口）
rem 关闭程序窗口 = 关闭整个 dsh web 服务进程
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
