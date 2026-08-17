# DeepSeek Harness Launcher（dsh-desktop）

> 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面封装成
> Windows 上"双击即用"的启动器：自动拉起 `dsh web` 服务并打开页面，关掉管理窗口即
> 连同服务进程一起退出。提供**轻量网页版**（推荐）与 **Electron 桌面版**（可选）两档。

两种方案对比（实测数据）：

| | 网页版（推荐） | Electron 桌面版 |
| --- | --- | --- |
| 客户端内存 | **≈ 0**（复用已开浏览器，只多一个标签页 ~270MB） | ~900MB（自带整套 Chromium） |
| 总内存（含 dsh 服务 352MB） | ≈ **620MB** | ≈ **1.25GB** |
| 安装体积 | 两个脚本，<10KB | ~130MB 便携包 |
| 窗口样式 | 你的默认浏览器 | 独立应用窗口（黑鲸图标） |
| 关闭即退出 | 关闭启动器的控制台窗口 | 关闭应用窗口 |

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Windows 10/11 x64 | 本封装目前针对 Windows |
| Node.js ≥ 22 | 需要在 PATH 中（用于拉起 dsh 服务进程） |
| DeepSeek Harness 部署 | 本仓库是**封装层**，不内置 Harness 本体；需要本机已有 `$DSH_HOME/profiles` 部署（含 `@deepseek-ai/dsh` 启动器） |
| 用户数据 | 会话、凭据、设置全部沿用 `~/.dsh`，不复制、不搬移 |

## 快速开始

### 方式一：网页版（推荐，最轻量）

```bat
git clone https://github.com/suzi20/dsh-desktop.git
cd dsh-desktop
启动网页版.cmd
```

行为：

- 端口（默认 3080）已有服务 → 直接用默认浏览器打开页面；
- 端口空闲 → 在本控制台**前台**启动 `dsh web`，就绪后自动打开默认浏览器；
- **关闭控制台窗口 = 停止服务**（浏览器标签页可随时关，不影响服务）；
- 配套 `停止网页版.cmd` 可一键结束所有 dsh 服务进程。

### 方式二：Electron 桌面版（可选，功能全但吃内存）

```bat
npm install
一键安装到桌面.cmd        REM 创建桌面快捷方式；或 npm start
```

也可到 [Releases](https://github.com/suzi20/dsh-desktop/releases) 下载
`DeepSeek-Harness-Desktop-vX.X.X-win-x64.zip`（约 130MB 便携包，内含
`一键安装到桌面.cmd`）。详见下方[桌面版章节](#electron-桌面版详细说明)。

首次使用前把 `config.example.json` 复制为 `config.json` 并按需调整（见[配置](#配置)）。

## 工作模式（自动选择）

| 启动时端口情况 | 模式 | 关窗行为 |
| --- | --- | --- |
| `127.0.0.1:3080` 已有 DeepSeek Harness 网页（例如手动 `dsh web` 正在运行） | **附着模式** | 只打开页面，**不杀**外部实例（不是本程序启动的） |
| 端口空闲 | **自启模式** | 网页版：关闭控制台窗口即终止服务；桌面版：关窗即 `taskkill /T /F` 整树终止 |

## 网页版的生命周期

```
双击 启动网页版.cmd
  → 探测 3080：有服务？→ 打开默认浏览器，结束（不碰已有服务）
  → 没有？→ 本控制台前台运行 node <dsh> web --port 3080
  → 后台助手轮询端口，就绪后自动打开默认浏览器（最多等 120 秒）
  → 关闭控制台窗口 = 服务进程终止（Ctrl+C 亦可）
配套：停止网页版.cmd —— 结束所有 dsh 服务进程（bin.js web）及其子进程
```

网页版**没有**客户端进程内存开销：页面跑在你本来就开着的浏览器里（只多一个标签页
~270MB 渲染进程），服务本体 ~350MB；合计比 Electron 桌面版省一半以上。

## Electron 桌面版详细说明

以下章节仅适用于 `main.js` + `npm install` 的 Electron 桌面版（方式二）。

## 配置

`config.json`（从 `config.example.json` 复制；未配置的字段用下面的默认值）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `port` | `3080` | dsh web 监听端口 |
| `checkoutDir` | 空 | deepseek-harness 源码/构建产物目录；留空则仅使用 `$DSH_HOME` 下已部署的启动器 |
| `dshHome` | 空（继承 `DSH_HOME`，再退化为 `~/.dsh`） | 数据目录 |
| `workspaceDir` | 空（桌面端启动时的当前目录） | 服务进程工作目录（新会话的默认工作区） |
| `userDataDir` | 空（`%APPDATA%\dsh-desktop`） | Chromium 用户数据目录（便携/测试可重定向） |
| `autoCloseMs` | `0` | 测试钩子：窗口打开 N 毫秒后自动关闭 |

**环境变量覆盖**（优先级高于 config.json）：
`DSH_DESKTOP_PORT` / `DSH_DESKTOP_CHECKOUT` / `DSH_DESKTOP_HOME` /
`DSH_DESKTOP_WORKSPACE` / `DSH_DESKTOP_USERDATA` / `DSH_DESKTOP_LOG` /
`DSH_DESKTOP_LAUNCHER` / `DSH_DESKTOP_CONFIG`；测试钩子 `DSH_DESKTOP_HEADLESS=1`
（不建窗口，用于自动化验证）。

打包后的 exe 里 config.json 只读，可在 `%APPDATA%\dsh-desktop\config.json` 放一份覆盖件。

**启动器定位顺序**：`DSH_DESKTOP_LAUNCHER` 环境变量 →
`$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js`（已部署包）→
`<checkoutDir>/apps/cli/lib/bin.js`（构建产物）→ `<checkoutDir>/apps/cli/src/bin.ts`（源码 + tsx）。

### 桌面版工作原理：关窗如何做到"进程必死"

```
你点 X
  → 窗口 closed 事件
  → ① taskkill /pid <服务pid> /T /F    杀掉自启 dsh 服务的整棵进程树
  → ② app.quit()                       优雅退出（Chromium 收尾，渲染/GPU 等子进程随之退出）
  → ③ watchdog（5 秒兜底）：若仍未退干净，taskkill /pid <应用> /T /F 连根拔起
  → ④ 日志落盘确认："进程树 XXXX 已终止" + "✅ 确认：服务进程 XXXX 已退出"
```

确认机制用 `process.kill(pid, 0)` 轮询目标 PID（存在→正常返回，不存在→ESRCH），
最多复查 10 秒，结果写入日志。

**已知的残留边界**：① 杀软拦截 taskkill 时（日志会出现"警告：进程可能仍存活"）；
② 你在任务管理器里强杀桌面端（taskkill 没机会执行）。两种情况下残留的 dsh 服务会
占着端口空转，但**下次启动会自动附着复用**，数据安全、不冲突——等于自动回收。
Electron 的 4 个同名进程（主/GPU/渲染/工具）是单个实例的正常架构，不是残留。

## 如何确认"关窗/关控制台后进程已终止"

**网页版**：关闭控制台窗口后跑 `netstat -ano | findstr :3080`，无输出即服务已退出；
也可用 `停止网页版.cmd` 主动结束。

**桌面版**：一键检查脚本 `检查进程.cmd [端口]`（默认 3080），输出服务进程、端口监听、日志末尾三项。

**桌面版·方法二：看应用日志**（`%APPDATA%\dsh-desktop\desktop.log`），正常关闭后末尾应有：

```
shutdown: 关闭窗口 → 终止自启服务进程
killOwnedServer pid=XXXX
进程树 XXXX 已终止
✅ 确认：服务进程 XXXX 已退出
```

**桌面版·方法三：手动命令**

```bat
netstat -ano | findstr :3080                                  REM 无输出 = 已释放
tasklist /FI "PID eq XXXX"                                    REM 无结果 = 已退出
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bin\.js web' } | Select ProcessId, CommandLine"
```

> 前提：附着模式下关窗本来就不杀外部实例。要验证"关窗即关进程"，先停掉外部实例，
> 再启动（日志会写"未检测到实例，启动服务…"）。

### 桌面版打包发布

```bat
npm run dist
```

产物在 `dist\DeepSeek-Harness-Desktop-1.0.0.exe`（electron-builder 单文件 portable 版）。
国内网络加速镜像：

```bat
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

> 若 electron-builder 在你的环境不可用，可手工组装便携版：把 `node_modules/electron/dist`
> 拷为 `dist/win-unpacked`，`app.asar` 用 `@electron/asar` 打包后放入 `resources/`，再用
> `rcedit --set-icon assets/icon.ico` 替换 exe 图标（参考项目内 `package.json` 的 build 字段）。

### 日志（桌面版）

运行日志在 `%APPDATA%\dsh-desktop\desktop.log`（开发模式可用 `DSH_DESKTOP_LOG` 重定向），
记录启动、模式选择、服务拉起、关窗清理与确认全过程。

## 常见问题（FAQ）

- **网页版和桌面版能同时用吗？** 不建议：两者共用 3080 端口，会互相"附着"。
  用哪个就关掉另一个（先 `停止网页版.cmd` 或关桌面版窗口）。
- **为什么任务管理器里有 4 个同名进程？** 单个 Electron 实例的正常架构（主/GPU/渲染/工具），不是残留；网页版没有这个问题。
- **关窗后 node 进程还在？** 自启服务被杀时正在收尾，等 5～10 秒再看；仍存在且日志无
  "确认已退出"则属上面说的残留边界场景，可手动结束或下次启动自动附着复用。
- **提示"服务启动失败"？** 检查 Node.js 是否在 PATH、`config.json` 的 `checkoutDir`/
  `dshHome` 是否正确、端口是否被非 DSH 程序占用。
- **换一台电脑能用吗？** 需要那台机器也装 Node.js + DeepSeek Harness 部署；本仓库不含 Harness 本体。

## 隐私与限制

- 本仓库**不含**任何个人配置、凭据、会话数据（`config.json` 已被 gitignore，请用
  `config.example.json` 初始化）。
- 桌面端只是"窗口 + 进程管理"封装：模型凭据在 `~/.dsh/.credentials.yaml`，会话在
  `~/.dsh/sessions`，均不随程序分发。
- 关窗会**强制**终止服务进程树；会话数据是边跑边落盘的不会丢，但正在进行的任务会被立即中断。

## License

[MIT](LICENSE)。图标取自 DeepSeek Harness 项目（其自身为 MIT 协议）；
Electron / Chromium 遵循其各自的许可证。
