# DeepSeek Harness Desktop（dsh-desktop）

> Wrap the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web UI into a native Windows desktop app:
> double-click to start, the window pops up automatically, and **closing the window terminates the whole process tree**.

把 DeepSeek Harness Web 界面封装成 Windows 桌面软件：

- **双击即启动**：自动拉起 `dsh web` 服务（复用你现有的 `~/.dsh` 配置、会话与模型凭据）；
- **自动弹出页面**：服务就绪后自动打开应用窗口；
- **关闭页面即关闭进程**：关掉窗口会连同服务进程及其整个进程树（子代理、shell 等）一起结束，不留后台残留；
- **单实例**：重复启动只会把已有窗口带到前台；
- **智能避让**：端口上已有别的 `dsh web` 实例时自动"附着"，不会误杀你没打算关的服务。

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Windows 10/11 x64 | 本封装目前针对 Windows（macOS/Linux 代码路径可用但未经测试） |
| Node.js ≥ 22 | 需要在 PATH 中（用于拉起 dsh 服务进程） |
| DeepSeek Harness 部署 | 本程序是**封装层**，不内置 Harness 本体；需要本机已有 `$DSH_HOME/profiles` 部署（含 `@deepseek-ai/dsh` 启动器） |
| 用户数据 | 会话、凭据、设置全部沿用 `~/.dsh`，桌面端不复制、不搬移 |

## 快速开始

```bat
cd dsh-desktop
npm install            REM 首次安装依赖
启动桌面版.cmd          REM 或：npm start
```

首次使用前把 `config.example.json` 复制为 `config.json` 并按需调整（见[配置](#配置)）。

**便携版**：`npm run dist` 打包后，`dist\win-unpacked\` 整个文件夹即是绿色免安装版
（约 200MB，含 Chromium 运行时），双击其中的 `DeepSeek-Harness-Desktop.exe` 即可。
*注意：便携版是文件夹不是单文件，exe 依赖同目录的 `resources\app.asar` 和 Chromium
运行库，不能单独拷走 exe。*

## 工作模式（自动选择）

| 启动时端口情况 | 模式 | 关窗行为 |
| --- | --- | --- |
| `127.0.0.1:3080` 已有 DeepSeek Harness 网页（例如手动 `dsh web` 正在运行） | **附着模式** | 只退出桌面端本身；**不杀**外部实例（不是本程序启动的） |
| 端口空闲 | **自启模式** | 终止自启服务进程的整棵进程树（`taskkill /T /F`） |

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

## 工作原理：关窗如何做到"进程必死"

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

## 如何确认"关窗后进程已终止"

**方法一：一键检查脚本** `检查进程.cmd [端口]`（默认 3080），输出服务进程、端口监听、日志末尾三项。

**方法二：看应用日志**（`%APPDATA%\dsh-desktop\desktop.log`），正常关闭后末尾应有：

```
shutdown: 关闭窗口 → 终止自启服务进程
killOwnedServer pid=XXXX
进程树 XXXX 已终止
✅ 确认：服务进程 XXXX 已退出
```

**方法三：手动命令**

```bat
netstat -ano | findstr :3080                                  REM 无输出 = 已释放
tasklist /FI "PID eq XXXX"                                    REM 无结果 = 已退出
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bin\.js web' } | Select ProcessId, CommandLine"
```

> 前提：附着模式下关窗本来就不杀外部实例。要验证"关窗即关进程"，先停掉外部实例，
> 再启动桌面版（日志会写"未检测到实例，启动服务…"）。

## 打包发布

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

## 日志

运行日志在 `%APPDATA%\dsh-desktop\desktop.log`（开发模式可用 `DSH_DESKTOP_LOG` 重定向），
记录启动、模式选择、服务拉起、关窗清理与确认全过程。

## 常见问题（FAQ）

- **为什么任务管理器里有 4 个同名进程？** 单个 Electron 实例的正常架构（主/GPU/渲染/工具），不是残留。
- **关窗后 node 进程还在？** 自启服务被杀时正在收尾，等 5～10 秒再看；仍存在且日志无
  "确认已退出"则属上面说的残留边界场景，可手动结束或下次启动自动附着复用。
- **提示"服务启动失败"？** 检查 Node.js 是否在 PATH、`config.json` 的 `checkoutDir`/
  `dshHome` 是否正确、端口是否被非 DSH 程序占用。
- **换一台电脑能用吗？** 需要那台机器也装 Node.js + DeepSeek Harness 部署；本封装不含 Harness 本体。

## 隐私与限制

- 本仓库**不含**任何个人配置、凭据、会话数据（`config.json` 已被 gitignore，请用
  `config.example.json` 初始化）。
- 桌面端只是"窗口 + 进程管理"封装：模型凭据在 `~/.dsh/.credentials.yaml`，会话在
  `~/.dsh/sessions`，均不随程序分发。
- 关窗会**强制**终止服务进程树；会话数据是边跑边落盘的不会丢，但正在进行的任务会被立即中断。

## License

[MIT](LICENSE)。图标取自 DeepSeek Harness 项目（其自身为 MIT 协议）；
Electron / Chromium 遵循其各自的许可证。
