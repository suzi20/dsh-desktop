@echo off
chcp 65001 >nul
rem ============================================================
rem  DeepSeek Harness 网页版启动器（最轻量方案）
rem
rem  行为：
rem   1. 探测端口是否已有 dsh web 在跑：
rem        - 有：直接用默认浏览器打开页面，不重复启动服务
rem        - 无：在【本控制台】前台启动服务，就绪后自动打开默认浏览器
rem   2. 本控制台 = 服务终端：
rem        - 关掉控制台窗口 = 服务进程随之终止（即"关窗即关进程"）
rem        - 浏览器标签页可随时关闭，不影响服务
rem  停止服务的另一方式：双击 停止网页版.cmd
rem ============================================================
title DeepSeek Harness 网页版

setlocal

rem ---- 可调参数 ----
set "PORT=3080"
rem 若 DSH_HOME 不在默认位置，取消下面注释并改成实际路径：
rem set "DSH_HOME=%USERPROFILE%\.dsh"

rem ---- 定位 dsh 启动器 ----
set "HOME_DIR=%DSH_HOME%"
if "%HOME_DIR%"=="" set "HOME_DIR=%USERPROFILE%\.dsh"
set "BIN="
if exist "%HOME_DIR%\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js" set "BIN=%HOME_DIR%\profiles\node_modules\@deepseek-ai\dsh\lib\bin.js"
if "%BIN%"=="" (
  echo [X] 未找到 dsh 启动器，请检查：
  echo     1. DeepSeek Harness 是否已部署（%HOME_DIR%\profiles）
  echo     2. 或设置 DSH_HOME 环境变量指向部署根目录
  echo     3. 或编辑本脚本把启动器路径写死
  echo.
  pause
  exit /b 1
)

rem ---- 探活：端口是否已有服务 ----
set "CODE="
for /f %%i in ('powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:%PORT%' -TimeoutSec 2).StatusCode" 2^>nul') do set "CODE=%%i"
if "%CODE%"=="200" (
  echo [i] 检测到服务已在运行（端口 %PORT%），直接打开页面...
  start "" "http://127.0.0.1:%PORT%"
  echo.
  echo 页面已打开。服务不是本窗口启动的，不会被本窗口关闭。
  echo.
  pause
  exit /b 0
)

rem ---- 自启服务 + 后台等待就绪并打开浏览器 ----
echo [i] 端口 %PORT% 空闲，启动服务...
echo [i] 浏览器将在服务就绪后自动打开（最多等待 120 秒）
echo [i] 关闭本控制台窗口 = 停止服务
echo.

start "DSH-Browser-Helper" /b powershell -NoProfile -WindowStyle Hidden -Command "$u='http://127.0.0.1:%PORT%'; for($i=0;$i -lt 240;$i++){ try{ $r=Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 2; if($r.StatusCode -eq 200){ Start-Process $u; exit } }catch{}; Start-Sleep -Milliseconds 500 }"

node "%BIN%" web --port %PORT%

echo.
echo [i] 服务已停止（本控制台关闭）。
pause
