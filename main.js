'use strict'
process.on('uncaughtException', error => {
  console.log('UNCAUGHT: ' + (error && error.stack ? error.stack : String(error)))
  try { process.exit(1) } catch { /* noop */ }
})
/**
 * DeepSeek Harness 桌面端封装（Electron 主进程）。
 *
 * 行为契约：
 *  - 启动时探测 127.0.0.1:<port>（默认 3080）是否已有 DeepSeek Harness 网页：
 *      · 已有（例如手动启动的 dsh web 正在运行）→ 直接打开窗口附着到该实例，
 *        关闭窗口【不会】关闭它（它不是本程序启动的）。
 *      · 没有 → 本程序自行拉起 dsh web 服务进程；窗口加载成功后，关闭窗口会
 *        连同其整个进程树（子代理、shell 等）一起结束，实现"关页面即关进程"。
 *  - 单实例：重复启动只会聚焦已有窗口。
 *
 * 可配置项见同目录 config.json（环境变量 DSH_DESKTOP_* 可覆盖）。
 */

const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn, execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

// ---------------------------------------------------------------- config ---

const DEFAULT_CONFIG = {
  // dsh web 监听端口（服务默认 3080；若已被占用且属于 DSH 则自动转为附着模式）
  port: 3080,
  // deepseek-harness 源码/构建产物目录；留空时仅使用 $DSH_HOME 下已部署的启动器
  checkoutDir: '',
  // DSH_HOME；留空则继承环境变量，再退化为 ~/.dsh
  dshHome: '',
  // 服务进程工作目录（新会话的默认工作区）；留空 = 桌面端启动时的当前目录
  workspaceDir: '',
  // Chromium 用户数据目录；留空使用系统默认（%APPDATA%/dsh-desktop）
  userDataDir: '',
  // 测试钩子：窗口打开后自动关闭（毫秒）。0 = 不自动关闭
  autoCloseMs: 0,
}

function loadConfig() {
  const cfg = { ...DEFAULT_CONFIG }
  const mergeFile = file => {
    if (!file || !fs.existsSync(file)) return
    try {
      Object.assign(cfg, JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch (error) {
      console.log(`config ${file} 解析失败（${error.message}），跳过`)
    }
  }
  // 注意：app.getPath 在 ready 之前调用可能在受限环境下原生崩溃，因此
  // userData 覆盖件在 whenReady 后读取（见 mergeUserConfig）。
  mergeFile(path.join(__dirname, 'config.json'))
  if (process.env.DSH_DESKTOP_CONFIG) mergeFile(process.env.DSH_DESKTOP_CONFIG)
  if (process.env.DSH_DESKTOP_PORT) cfg.port = Number(process.env.DSH_DESKTOP_PORT)
  if (process.env.DSH_DESKTOP_CHECKOUT) cfg.checkoutDir = process.env.DSH_DESKTOP_CHECKOUT
  if (process.env.DSH_DESKTOP_HOME) cfg.dshHome = process.env.DSH_DESKTOP_HOME
  if (process.env.DSH_DESKTOP_WORKSPACE) cfg.workspaceDir = process.env.DSH_DESKTOP_WORKSPACE
  if (process.env.DSH_DESKTOP_USERDATA) cfg.userDataDir = process.env.DSH_DESKTOP_USERDATA
  if (process.env.DSH_DESKTOP_AUTOCLOSE) cfg.autoCloseMs = Number(process.env.DSH_DESKTOP_AUTOCLOSE)
  return cfg
}

/** app ready 后合并用户数据目录下的 config.json 覆盖件（打包后 __dirname 只读时使用）。 */
function mergeUserConfig() {
  try {
    const file = path.join(app.getPath('userData'), 'config.json')
    if (fs.existsSync(file)) {
      Object.assign(cfg, JSON.parse(fs.readFileSync(file, 'utf8')))
      log(`已合并用户配置：${file}`)
    }
  } catch (error) {
    log(`用户配置读取失败：${error.message}`)
  }
}

const cfg = loadConfig()
const state = { window: null, server: null, serverOwned: false, quitting: false, killConfirmed: false }

// 允许把 Chromium 用户数据目录重定向到任意位置（便携模式/测试用）；
// 必须在 app ready 之前设置。
if (cfg.userDataDir) {
  try { app.setPath('userData', cfg.userDataDir) } catch (error) { console.log('setPath userData failed: ' + error.message) }
}

// ------------------------------------------------------------------ log ---

let logTarget = null
function openLog() {
  const candidates = []
  if (process.env.DSH_DESKTOP_LOG) candidates.push(process.env.DSH_DESKTOP_LOG)
  try { candidates.push(path.join(app.getPath('userData'), 'desktop.log')) } catch { /* noop */ }
  candidates.push(path.join(__dirname, 'desktop.log'))
  for (const target of candidates) {
    try {
      fs.appendFileSync(target, '')
      logTarget = target
      log(`==== dsh-desktop start (pid ${process.pid}, electron ${process.versions.electron}) ====`)
      return
    } catch { /* try next */ }
  }
}
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`
  console.log(line)
  if (logTarget) {
    try { fs.appendFileSync(logTarget, line + '\n') } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------- launcher ---

/** 定位 dsh 启动器：返回 { label, command, args, cwd } 或 null。 */
function resolveLauncher() {
  const home = (cfg.dshHome && cfg.dshHome.trim()) || process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const port = String(cfg.port)
  const node = process.env.DSH_DESKTOP_NODE || 'node'

  const candidates = []

  if (process.env.DSH_DESKTOP_LAUNCHER) {
    candidates.push({
      label: '环境变量 DSH_DESKTOP_LAUNCHER',
      command: process.env.DSH_DESKTOP_LAUNCHER,
      args: ['web', '--port', port],
      cwd: cfg.workspaceDir,
    })
  }

  // 1) 已部署的 dsh 包（$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js）
  const deployed = path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (fs.existsSync(deployed)) {
    candidates.push({
      label: `已部署启动器 ${deployed}`,
      command: node,
      args: [deployed, 'web', '--port', port],
      cwd: cfg.workspaceDir,
    })
  }

  // 2) checkout 的构建产物
  const built = path.join(cfg.checkoutDir, 'apps', 'cli', 'lib', 'bin.js')
  if (fs.existsSync(built)) {
    candidates.push({
      label: `checkout 构建产物 ${built}`,
      command: node,
      args: [built, 'web', '--port', port],
      cwd: cfg.workspaceDir,
    })
  }

  // 3) checkout 的源码入口（需 tsx）
  const source = path.join(cfg.checkoutDir, 'apps', 'cli', 'src', 'bin.ts')
  if (fs.existsSync(source)) {
    candidates.push({
      label: `checkout 源码入口 ${source}`,
      command: node,
      args: ['--import', 'tsx/esm', source, 'web', '--port', port],
      cwd: cfg.checkoutDir,
    })
  }

  if (candidates.length === 0) return null
  return candidates[0]
}

// ----------------------------------------------------------------- probe ---

/** 探测某地址是否已是 DeepSeek Harness 网页。 */
function probe(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        res.resume()
        resolve(res.statusCode === 200 && body.includes('DeepSeek Harness'))
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// ------------------------------------------------------------------ ui ---

function openWindow(url, owned) {
  if (state.window) return
  // headless 测试钩子：不创建窗口，走完探测/拉起/就绪判定后按 autoCloseMs 关闭
  if (process.env.DSH_DESKTOP_HEADLESS === '1') {
    log(`headless: 不创建窗口（url=${url} owned=${owned}）`)
    if (cfg.autoCloseMs > 0) setTimeout(() => shutdown(), cfg.autoCloseMs)
    return
  }
  log(`openWindow url=${url} owned=${owned}`)
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#0e1116',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  state.window = win
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) shell.openExternal(target)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', () => log(`page loaded: ${win.webContents.getTitle()}`))
  win.webContents.on('did-fail-load', (_event, code, desc, validatedURL) => {
    log(`did-fail-load code=${code} desc=${desc} url=${validatedURL}`)
  })
  win.on('closed', () => {
    log('window closed')
    state.window = null
    shutdown()
  })
  win.loadURL(url)
  if (cfg.autoCloseMs > 0) {
    log(`autoCloseMs=${cfg.autoCloseMs}，将自动关闭窗口`)
    setTimeout(() => { try { win.close() } catch { /* noop */ } }, cfg.autoCloseMs)
  }
}

function errorDialog(message) {
  log('errorDialog: ' + message)
  try {
    dialog.showErrorBox('DeepSeek Harness 桌面端', message)
  } catch { /* noop */ }
}

// ------------------------------------------------------------ lifecycle ---

/**
 * taskkill 后轮询确认目标进程确实退出（最多 ~10 秒），并写入日志。
 * process.kill(pid, 0) 不发送任何信号，仅探测进程是否存在：
 * 存在 → 正常返回；不存在 → 抛 ESRCH。
 */
function confirmProcessGone(pid, attempts = 0) {
  if (attempts >= 10) {
    log(`警告：进程 ${pid} 可能仍存活（10 秒内未确认退出）`)
    state.killConfirmed = true
    return
  }
  try {
    process.kill(pid, 0) // 存在则不抛
    log(`进程 ${pid} 仍在退出中，1 秒后复查…`)
    setTimeout(() => confirmProcessGone(pid, attempts + 1), 1000)
  } catch (error) {
    if (error.code === 'ESRCH') {
      log(`✅ 确认：服务进程 ${pid} 已退出`)
    } else {
      log(`无法确认进程状态（${error.code}），假定已随任务终止`)
    }
    state.killConfirmed = true
  }
}

function killOwnedServer() {
  if (!state.serverOwned || !state.server || state.server.pid === undefined) return
  state.serverOwned = false
  const pid = state.server.pid
  log(`killOwnedServer pid=${pid}`)
  if (process.platform === 'win32') {
    // 用 spawn + ignore stdio（无需管道），taskkill /T /F 终止整个进程树
    try {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', error => {
        log(`taskkill 报告异常: ${error.message}`)
        confirmProcessGone(pid)
      })
      killer.on('exit', code => {
        if (code === 0) log(`进程树 ${pid} 已终止`)
        else log(`taskkill 退出码 ${code}，继续确认目标进程…`)
        confirmProcessGone(pid)
      })
    } catch (error) {
      log(`taskkill 启动失败: ${error.message}`)
      confirmProcessGone(pid)
    }
  } else {
    try { state.server.kill('SIGTERM') } catch { /* noop */ }
    setTimeout(() => { try { state.server.kill('SIGKILL') } catch { /* noop */ } }, 3000)
  }
}

function shutdown() {
  if (state.quitting) return
  state.quitting = true
  log('shutdown: 关闭窗口 → 终止自启服务进程')
  killOwnedServer()
  if (process.env.DSH_DESKTOP_HEADLESS === '1') {
    // headless 测试模式没有窗口：app.quit() 在无窗口时可能挂起，直接退出。
    // 等 killOwnedServer + confirmProcessGone 落盘确认日志后再退出（最多 5 秒）。
    const waitStart = Date.now()
    const waitAndExit = () => {
      if (state.killConfirmed || Date.now() - waitStart > 5000) {
        try { process.exit(0) } catch { /* noop */ }
      } else {
        setTimeout(waitAndExit, 200)
      }
    }
    setTimeout(waitAndExit, 300)
    return
  }
  setTimeout(() => app.quit(), 400)
  if (process.platform === 'win32') {
    // 外部 watchdog：若主进程事件循环被卡住，5 秒后强制结束自身整棵进程树
    // （含渲染/GPU/工具子进程以及自启的 dsh 服务），保证"关窗即关进程"在任何情况下成立。
    // 注意必须带 /T：只杀主进程会把 Chromium 子进程变成孤儿（残留）。
    try {
      execFile('cmd', ['/c', `ping -n 6 127.0.0.1 >nul & taskkill /pid ${process.pid} /T /F >nul 2>&1`], { windowsHide: true, detached: true }, () => { /* noop */ })
    } catch { /* noop */ }
  }
}

// ----------------------------------------------------------------- boot ---

async function boot() {
  const url = `http://127.0.0.1:${cfg.port}`
  log(`boot: 探测 ${url} ...`)

  if (await probe(url)) {
    log('检测到已有 DeepSeek Harness 实例，附着模式（关闭窗口不关闭该实例）')
    openWindow(url, false)
    return
  }

  const launcher = resolveLauncher()
  if (!launcher) {
    errorDialog(
      '无法定位 dsh 启动器。\n\n' +
      '请检查 config.json 中的 checkoutDir 是否为 deepseek-harness 仓库路径，\n' +
      '或在环境变量 DSH_DESKTOP_LAUNCHER 中指定完整的 dsh 启动命令。',
    )
    app.quit()
    return
  }
  log(`未检测到实例，启动服务：${launcher.label}\n  cmd: ${launcher.command} ${launcher.args.join(' ')}`)

  const serverEnv = {
    ...process.env,
    ...(cfg.dshHome.trim() ? { DSH_HOME: cfg.dshHome } : {}),
  }
  const spawnOpts = stdio => ({
    cwd: launcher.cwd || undefined, // 空工作目录 = 继承桌面端启动时的当前目录
    env: serverEnv,
    windowsHide: true,
    stdio,
  })

  // 优先用管道捕获服务输出（解析就绪 URL + 收集错误信息）；
  // 在个别受限环境下创建管道会被拒绝（spawn EPERM），此时退化为
  // 忽略 stdio 的方式重启，仅靠端口轮询判定就绪。
  let pipes = true
  let server
  try {
    server = spawn(launcher.command, launcher.args, spawnOpts(['ignore', 'pipe', 'pipe']))
  } catch (error) {
    pipes = false
    log(`stdio 管道方式启动失败（${error.message}），改用忽略 stdio 方式（端口轮询判定就绪）`)
    server = spawn(launcher.command, launcher.args, spawnOpts('ignore'))
  }
  state.server = server
  state.serverOwned = true
  log(`服务进程 pid=${server.pid} mode=${pipes ? 'pipes' : 'ignore-stdio'}`)

  let stderrTail = ''
  if (pipes) {
    server.stdout.on('data', chunk => {
      const text = String(chunk)
      log('server stdout: ' + text.trim())
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match && !state.window && !state.quitting) {
        log(`服务报告就绪地址：${match[0]}`)
        openWindow(match[0], true)
      }
    })
    server.stderr.on('data', chunk => {
      stderrTail = (stderrTail + String(chunk)).slice(-8000)
      log('server stderr: ' + String(chunk).trim())
    })
  }

  const handleSpawnError = error => {
    if (pipes && error && error.code === 'EPERM' && !state.quitting) {
      // 异步上报的管道 EPERM：切换为忽略 stdio 重试一次
      pipes = false
      log('spawn EPERM（受限环境）：改用忽略 stdio 重启服务')
      try {
        const retry = spawn(launcher.command, launcher.args, spawnOpts('ignore'))
        state.server = retry
        retry.on('error', handleSpawnError)
        retry.on('exit', (code, signal) => handleExit(code, signal, retry))
        log(`服务进程（重试）pid=${retry.pid} mode=ignore-stdio`)
        return
      } catch (error2) {
        error = error2
      }
    }
    log(`服务进程启动失败: ${error.message}`)
    errorDialog(`服务进程启动失败：${error.message}\n\n请确认 Node.js 已安装并在 PATH 中。`)
    shutdown()
  }
  server.on('error', handleSpawnError)

  const handleExit = (code, signal, emitter) => {
    if (emitter && state.server !== emitter) return // 旧进程的退出事件，忽略
    log(`服务进程退出 code=${code} signal=${signal}`)
    if (state.quitting) return
    // 窗口尚未打开或仍在打开期间就退出：通常是端口被占/启动参数错误，需要明示
    if (!state.window) {
      errorDialog(`DeepSeek Harness 服务启动失败（进程退出 code ${code}）。\n\n${stderrTail.slice(-1200)}`)
    } else {
      errorDialog(`DeepSeek Harness 服务意外退出（code ${code}）。\n\n${stderrTail.slice(-1200)}`)
    }
    shutdown()
  }
  server.on('exit', (code, signal) => handleExit(code, signal, server))

  // 兜底：若输出格式变化导致没抓到 URL，则轮询端口
  const deadline = Date.now() + 60_000
  const poll = async () => {
    if (state.window || state.quitting) return
    if (await probe(url)) {
      log(`轮询确认服务就绪：${url}`)
      openWindow(url, true)
      return
    }
    if (Date.now() < deadline) {
      setTimeout(poll, 500)
    } else if (!state.window) {
      log('等待服务就绪超时，stderr 末尾：' + stderrTail.slice(-1200))
      errorDialog(`等待 DeepSeek Harness 服务就绪超时（60 秒）。\n\n${stderrTail.slice(-1200)}`)
      shutdown()
    }
  }
  setTimeout(poll, 800)
}

// ------------------------------------------------------------ app entry ---

const gotLock = (() => {
  try { return app.requestSingleInstanceLock() } catch (error) { return false }
})()
if (!gotLock) {
  // 拿不到单实例锁（例如 userData 目录不可写）时仍继续运行：
  // 若两个实例同时自启服务，后启动者在端口上失败后会通过轮询退化为附着模式，可自愈。
  log('警告：未能获取单实例锁（可能已有实例在运行）')
  app.on('second-instance', () => {
    log('second-instance: 聚焦已有窗口')
    if (state.window) {
      if (state.window.isMinimized()) state.window.restore()
      state.window.focus()
    }
  })
  app.whenReady().then(() => {
    openLog()
    mergeUserConfig()
    boot()
  })
  app.on('window-all-closed', () => {
    log('window-all-closed')
    shutdown()
  })
  app.on('before-quit', () => {
    killOwnedServer()
  })
} else {
  app.on('second-instance', () => {
    log('second-instance: 聚焦已有窗口')
    if (state.window) {
      if (state.window.isMinimized()) state.window.restore()
      state.window.focus()
    }
  })
  app.whenReady().then(() => {
    openLog()
    mergeUserConfig()
    boot()
  })
  app.on('window-all-closed', () => {
    log('window-all-closed')
    shutdown()
  })
  app.on('before-quit', () => {
    killOwnedServer()
  })
  app.on('activate', () => {
    if (state.window === null) boot()
  })
}
