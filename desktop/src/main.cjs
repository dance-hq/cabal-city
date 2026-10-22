const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  globalShortcut,
  nativeImage,
  powerMonitor,
  screen,
  session,
  shell,
} = require('electron')
const rules = require('./rules.cjs')

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'))
const APP_URL = (process.env.CABAL_APP_URL || config.appUrl).replace(/\/+$/, '')
const ORIGINS = rules.allowedOrigins(APP_URL, config.allowedOrigins)
const OFFLINE_PAGE = path.join(__dirname, 'offline.html')
const OVERLAY_PAGE = path.join(__dirname, 'overlay.html')
const OVERLAY_SIZE = { width: 144, height: 34 }
const BUILD = path.join(__dirname, '..', 'build')
// Sessions that started before this launch are left over from last time.
const LAUNCHED_AT = Date.now()

if (!ORIGINS.size) {
  console.error(`Cabal: "${APP_URL}" is not a usable app address. Set appUrl in app.json or CABAL_APP_URL.`)
  app.exit(1)
}

if (!app.requestSingleInstanceLock()) app.exit(0)

// The installer stamps this ID on Cabal's Start menu and desktop shortcuts.
// Without it, a pinned Cabal and the running window show up as two separate
// taskbar buttons.
if (process.platform === 'win32') app.setAppUserModelId(rules.APP_ID)

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('cabal', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('cabal')
}

// --- saved state ---------------------------------------------------------------

const statePath = (name) => path.join(app.getPath('userData'), name)

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(statePath(name), 'utf8'))
  } catch {
    return null
  }
}

function writeJson(name, value) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    const file = statePath(name)
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2))
    fs.renameSync(`${file}.tmp`, file)
  } catch (error) {
    console.error('Cabal: could not save', name, error)
  }
}

let settings = rules.normalizeSettings(readJson('settings.json'))
if (process.platform === 'linux' && readJson('settings.json') === null) {
  // Some Linux desktops have no tray, so closing the window should really quit there.
  settings = { ...settings, closeToTray: false }
}

// --- window ----------------------------------------------------------------------

let win = null
let tray = null
let quitting = false
let quitReady = false
let updater = null
let updateReady = null
let installing = false
let retryTimer = null
let pendingLink = rules.findDeepLink(process.argv)
let unread = 0
let sessionStartedAt = null
// Time worked so far while the session is paused (null = not paused).
let sessionPausedMs = null
let overlay = null
let overlayReady = false
let overlayTimer = null

function startUrl() {
  if (pendingLink?.kind === 'join') return `${APP_URL}/join/${encodeURIComponent(pendingLink.code)}`
  if (pendingLink?.kind === 'channel') return `${APP_URL}/app?c=${pendingLink.id}`
  return `${APP_URL}/app`
}

function showWindow() {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function toggleWindow() {
  if (win && win.isVisible() && win.isFocused()) win.hide()
  else showWindow()
}

function openDeepLink(link) {
  if (!link) return
  if (!win) {
    pendingLink = link
    return createWindow()
  }
  showWindow()
  if (link.kind === 'channel' && rules.isAppUrl(win.webContents.getURL(), ORIGINS)) {
    win.webContents.send('cabal:navigate', link.id)
  } else {
    pendingLink = link
    win.loadURL(startUrl())
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => win?.loadURL(startUrl()), 10_000)
}

function createWindow() {
  const fallback = { width: 980, height: 680 }
  const bounds = rules.restoreBounds(readJson('window.json'), screen.getAllDisplays(), fallback)

  win = new BrowserWindow({
    ...bounds,
    minWidth: 320,
    minHeight: 420,
    show: false,
    title: 'Cabal',
    backgroundColor: '#16161a',
    alwaysOnTop: settings.alwaysOnTop,
    autoHideMenuBar: true,
    icon: path.join(BUILD, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: [`--cabal-version=${app.getVersion()}`, `--cabal-launched=${LAUNCHED_AT}`],
    },
  })

  win.once('ready-to-show', () => {
    // A login-item launch starts quietly in the tray — unless there's no tray to come back from.
    if (!process.argv.includes('--hidden') || !tray) win.show()
  })

  let saveTimer = null
  const saveBounds = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win && !win.isMinimized() && !win.isFullScreen()) writeJson('window.json', win.getNormalBounds())
    }, 400)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)

  win.on('close', (event) => {
    if (!quitting && settings.closeToTray && tray) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    win = null
    // Otherwise the corner timer alone would keep the app from quitting.
    overlay?.destroy()
    for (const chat of chats.values()) if (!chat.isDestroyed()) chat.destroy()
  })
  win.on('focus', () => {
    win?.flashFrame(false)
    // With "Keep the window on top" on, both windows float; clicking Cabal
    // would otherwise slide it over the timer.
    keepOverlayOnTop()
  })
  // Switching to another app is exactly when the corner must stay over it.
  win.on('blur', keepOverlayOnTop)

  const contents = win.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (rules.canOpenExternally(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:') || rules.isAppUrl(url, ORIGINS)) return
    event.preventDefault()
    if (rules.canOpenExternally(url)) shell.openExternal(url)
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    // -3 is an aborted load (usually a redirect), not a real failure.
    if (!isMainFrame || code === -3 || url.startsWith('file:')) return
    win.loadFile(OFFLINE_PAGE)
    scheduleRetry()
  })
  contents.on('did-finish-load', () => {
    if (rules.isAppUrl(contents.getURL(), ORIGINS)) {
      clearTimeout(retryTimer)
      pendingLink = null
    }
  })

  win.loadURL(startUrl())
  return win
}

// --- session timer overlay ------------------------------------------------------------
// A pill in the corner while a session runs. Click it and it opens into your
// buddy list. The corner page never talks to Cabal's servers: the Cabal window
// hands it the list, and it hands back small checked requests.

const PANEL_WIDTH = 248
// Above every other app's windows, including their own floating panels and full-screen apps.
// 'floating' is the lowest always-on-top level, so other apps' windows could still cover it.
const OVERLAY_LEVEL = 'screen-saver'
const ON_TOP_CHECK_MS = 4000
let onTopTimer = null
let overlayAnchor = null
let overlayExpanded = false
let overlayHeight = 360
let buddies = null
let drag = null

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi))
const areaAround = (b) => screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea

// Shown for the whole session, including while Cabal itself is open or maximized,
// and while it's paused, so it's right there to resume.
function overlayWanted() {
  return (sessionStartedAt !== null || sessionPausedMs !== null) && settings.sessionOverlay
}

function overlaySession() {
  if (sessionStartedAt !== null) return { status: 'running', startedAt: sessionStartedAt }
  if (sessionPausedMs !== null) return { status: 'paused', workedMs: sessionPausedMs }
  return null
}

function overlayTargetBounds() {
  const area = areaAround({ ...overlayAnchor, ...OVERLAY_SIZE })
  const panel = overlayExpanded ? { width: PANEL_WIDTH, height: overlayHeight } : null
  return rules.overlayBounds(overlayAnchor, OVERLAY_SIZE, panel, area)
}

function placeOverlay() {
  if (overlay && !drag) overlay.setBounds(overlayTargetBounds())
}

function saveOverlay() {
  writeJson('overlay.json', { x: overlayAnchor.x, y: overlayAnchor.y, expanded: overlayExpanded })
}

// The window follows the cursor itself, so the same pill can be clicked (open
// the list) or dragged (move it) — a native drag area would swallow clicks.
function startDrag() {
  if (!overlay || drag) return
  drag = {
    cursor: screen.getCursorScreenPoint(),
    bounds: overlay.getBounds(),
    until: Date.now() + 20_000,
    timer: setInterval(followCursor, 16),
  }
}

function followCursor() {
  if (!overlay || !drag || Date.now() > drag.until) return endDrag()
  const c = screen.getCursorScreenPoint()
  const { x, y, width, height } = drag.bounds
  const area = screen.getDisplayNearestPoint(c).workArea
  overlay.setBounds({
    x: Math.round(clamp(x + c.x - drag.cursor.x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y + c.y - drag.cursor.y, area.y, area.y + area.height - height)),
    width,
    height,
  })
}

function endDrag() {
  if (!drag) return
  clearInterval(drag.timer)
  drag = null
  if (!overlay) return
  const bounds = overlay.getBounds()
  overlayAnchor = rules.anchorFromBounds(bounds, OVERLAY_SIZE, areaAround(bounds))
  saveOverlay()
  placeOverlay()
}

function sendOverlayState() {
  if (!overlay || !overlayReady) return
  const contents = overlay.webContents
  contents.send('cabal:overlay-session', overlaySession())
  contents.send('cabal:overlay-expanded', overlayExpanded)
  contents.send('cabal:overlay-buddies', buddies)
}

function createOverlay() {
  if (!overlayAnchor) {
    const saved = readJson('overlay.json')
    const primary = screen.getPrimaryDisplay().workArea
    overlayAnchor = rules.overlayPosition(saved, screen.getAllDisplays(), primary, OVERLAY_SIZE)
    overlayExpanded = saved?.expanded === true
  }
  overlayReady = false
  overlay = new BrowserWindow({
    ...overlayTargetBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Cabal session',
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  // On macOS this call resets the window level, so the level has to be set after it.
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlay.setAlwaysOnTop(true, OVERLAY_LEVEL)

  const contents = overlay.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())

  overlay.on('blur', endDrag)
  overlay.on('hide', stopKeepingOnTop)
  overlay.on('closed', () => {
    clearInterval(drag?.timer)
    stopKeepingOnTop()
    drag = null
    overlay = null
    overlayReady = false
  })
  overlay.once('ready-to-show', () => {
    overlayReady = true
    updateOverlay()
  })
  overlay.loadFile(OVERLAY_PAGE)
}

function updateOverlay() {
  if (!overlayWanted()) {
    overlay?.hide()
    return
  }
  if (!overlay) return createOverlay()
  if (!overlayReady) return
  sendOverlayState()
  // showInactive so the timer never steals focus from what you're doing.
  if (!overlay.isVisible()) {
    placeOverlay()
    overlay.showInactive()
  }
  keepOverlayOnTop()
  if (!onTopTimer) onTopTimer = setInterval(keepOverlayOnTop, ON_TOP_CHECK_MS)
}

// Other apps can claim "always on top" after us (Windows hands it to whoever asked last, and
// hiding/showing can drop it), so the corner re-asserts it now and then. Never takes focus.
function keepOverlayOnTop() {
  keepChatsOnTop()
  if (!overlay || overlay.isDestroyed() || !overlay.isVisible() || drag) return
  overlay.setAlwaysOnTop(true, OVERLAY_LEVEL)
  overlay.moveTop()
}

function stopKeepingOnTop() {
  clearInterval(onTopTimer)
  onTopTimer = null
}

// Focus moves in small bursts (blur, then focus elsewhere); settle first so the timer doesn't flicker.
function scheduleOverlay() {
  clearTimeout(overlayTimer)
  overlayTimer = setTimeout(updateOverlay, 150)
}

// --- tray, badge, shortcut ---------------------------------------------------------

function trayImage() {
  const name = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'
  const image = nativeImage.createFromPath(path.join(BUILD, name))
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function refreshTray() {
  if (!tray) return
  tray.setToolTip(unread ? `Cabal — ${unread} unread` : 'Cabal')
  if (process.platform === 'darwin') tray.setTitle(unread ? String(unread) : '')
  tray.setContextMenu(
    Menu.buildFromTemplate([
    { label: 'Show Cabal', click: showWindow },
    {
      label: 'Show session timer',
      type: 'checkbox',
      checked: settings.sessionOverlay,
      click: (item) => applySettings({ sessionOverlay: item.checked }),
    },
    { type: 'separator' },
      { label: 'Quit Cabal', click: () => app.quit() },
    ]),
  )
}

function createTray() {
  try {
    tray = new Tray(trayImage())
  } catch {
    tray = null
    return
  }
  tray.on('click', toggleWindow)
  refreshTray()
}

function setBadge(n) {
  const next = rules.badgeCount(n)
  const grew = next > unread
  unread = next
  app.setBadgeCount(next)
  if (grew && win && !win.isFocused()) win.flashFrame(true)
  refreshTray()
}

function registerShortcut(accelerator) {
  globalShortcut.unregisterAll()
  if (!accelerator) return true
  try {
    return globalShortcut.register(accelerator, toggleWindow)
  } catch {
    return false
  }
}

function applySettings(patch) {
  const next = { ...settings, ...patch }
  if (patch.shortcut !== undefined && patch.shortcut !== settings.shortcut) {
    if (!registerShortcut(next.shortcut)) {
      registerShortcut(settings.shortcut)
      next.shortcut = settings.shortcut
    }
  }
  if (patch.launchAtLogin !== undefined && process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] })
  }
  if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(next.alwaysOnTop)
  settings = next
  writeJson('settings.json', settings)
  if (patch.sessionOverlay !== undefined) {
    scheduleOverlay()
    refreshTray()
  }
  return settings
}

// --- messages from the page -------------------------------------------------------

function fromApp(event) {
  const url = event.senderFrame?.url ?? ''
  return rules.isAppUrl(url, ORIGINS) || url.startsWith('file:')
}

ipcMain.on('cabal:show', (event) => fromApp(event) && showWindow())
ipcMain.on('cabal:badge', (event, n) => fromApp(event) && setBadge(n))
ipcMain.on('cabal:quit', (event) => fromApp(event) && app.quit())
ipcMain.on('cabal:retry', (event) => {
  if (fromApp(event)) win?.loadURL(startUrl())
})
ipcMain.on('cabal:quit-ready', finishQuit)
ipcMain.handle('cabal:get-update', (event) => (fromApp(event) ? updateReady : null))
ipcMain.on('cabal:install-update', (event) => {
  if (!fromApp(event) || !updater || !updateReady) return
  installing = true
  // Quit the normal way first so the page can tell friends you went offline; finishQuit then installs and relaunches.
  if (win && rules.isAppUrl(win.webContents.getURL(), ORIGINS)) app.quit()
  else finishQuit()
})
ipcMain.on('cabal:session', (event, startedAt) => {
  if (!fromApp(event)) return
  sessionStartedAt = rules.sessionStart(startedAt, Date.now())
  sessionPausedMs = null
  scheduleOverlay()
})
ipcMain.on('cabal:session-paused', (event, workedMs) => {
  if (!fromApp(event)) return
  sessionPausedMs = rules.pausedWork(workedMs)
  sessionStartedAt = null
  scheduleOverlay()
})
// The Cabal window's buddy list, passed on to the corner.
ipcMain.on('cabal:buddies', (event, raw) => {
  if (!fromApp(event) || !win || event.sender !== win.webContents) return
  buddies = rules.buddySnapshot(raw)
  if (overlay && overlayReady) overlay.webContents.send('cabal:overlay-buddies', buddies)
})

const fromOverlay = (event) => !!overlay && event.sender === overlay.webContents

ipcMain.on('cabal:overlay-open', (event) => fromOverlay(event) && showWindow())
ipcMain.on('cabal:overlay-expand', (event, value) => {
  if (!fromOverlay(event)) return
  overlayExpanded = value === true
  saveOverlay()
  placeOverlay()
  overlay.webContents.send('cabal:overlay-expanded', overlayExpanded)
})
ipcMain.on('cabal:overlay-height', (event, value) => {
  if (!fromOverlay(event)) return
  const next = rules.panelHeight(Number(value))
  if (next === overlayHeight) return
  overlayHeight = next
  if (overlayExpanded) placeOverlay()
})
ipcMain.on('cabal:overlay-drag', (event, phase) => {
  if (!fromOverlay(event)) return
  if (phase === 'start') startDrag()
  else endDrag()
})
ipcMain.on('cabal:overlay-action', (event, raw) => {
  if (!fromOverlay(event)) return
  const action = rules.overlayAction(raw)
  if (!action) return
  // Talk right there in a small window instead of pulling the whole Cabal window forward.
  if (action.type === 'open-dm') return openChat(action.userId)
  if (!win || !rules.isAppUrl(win.webContents.getURL(), ORIGINS)) {
    return action.type === 'pause-session' || action.type === 'resume-session' ? undefined : showWindow()
  }
  if (action.type === 'open-dm') showWindow()
  win.webContents.send('cabal:buddy-action', action)
})

// --- chat windows ------------------------------------------------------------------
// Clicking someone in the corner list opens a small chat with them that floats
// with the corner. It's the Cabal web app's own chat page in the same browser
// session, so sign-in and encryption keys are the ones the main window uses.

const CHAT_PRELOAD = path.join(__dirname, 'chat-preload.cjs')
const CHAT_SIZE = { width: 340, height: 480 }
const MAX_CHATS = 3
const chats = new Map()

const chatUrl = (userId) => `${APP_URL}/app/chat/${encodeURIComponent(userId)}`

function isChatUrl(url) {
  if (!rules.isAppUrl(url, ORIGINS)) return false
  try {
    return new URL(url).pathname.startsWith('/app/chat/')
  } catch {
    return false
  }
}

function openInMainWindow(userId) {
  showWindow()
  if (win && rules.isAppUrl(win.webContents.getURL(), ORIGINS)) {
    win.webContents.send('cabal:buddy-action', { type: 'open-dm', userId })
  }
}

// Beside the corner, on the side with room, each new chat stepped a little so they don't stack exactly.
function chatBounds(index) {
  const point = screen.getCursorScreenPoint()
  const anchor =
    overlay && !overlay.isDestroyed() && overlay.isVisible() ? overlay.getBounds() : { ...point, width: 0, height: 0 }
  const area = areaAround(anchor)
  const step = 28 * index
  const gap = 8
  const onRight = anchor.x + anchor.width / 2 > area.x + area.width / 2
  const onBottom = anchor.y + anchor.height / 2 > area.y + area.height / 2
  const x = onRight ? anchor.x - gap - CHAT_SIZE.width - step : anchor.x + anchor.width + gap + step
  const y = onBottom ? anchor.y + anchor.height - CHAT_SIZE.height - step : anchor.y + step
  return {
    x: Math.round(clamp(x, area.x, area.x + area.width - CHAT_SIZE.width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - CHAT_SIZE.height)),
    ...CHAT_SIZE,
  }
}

function keepChatsOnTop() {
  for (const chat of chats.values()) {
    if (!chat.isDestroyed() && chat.isVisible()) chat.setAlwaysOnTop(true, OVERLAY_LEVEL)
  }
}

function openChat(userId) {
  const existing = chats.get(userId)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return
  }
  if (chats.size >= MAX_CHATS) chats.values().next().value?.close()

  const chat = new BrowserWindow({
    ...chatBounds(chats.size),
    minWidth: 280,
    minHeight: 320,
    show: false,
    frame: false,
    title: 'Cabal',
    backgroundColor: '#16161a',
    alwaysOnTop: true,
    fullscreenable: false,
    maximizable: false,
    icon: path.join(BUILD, 'icon.png'),
    webPreferences: {
      preload: CHAT_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })
  chats.set(userId, chat)
  // Same rule as the corner: the level goes on after the all-desktops call, which resets it on macOS.
  chat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  chat.setAlwaysOnTop(true, OVERLAY_LEVEL)
  chat.once('ready-to-show', () => {
    chat.show()
    chat.focus()
  })
  chat.on('closed', () => {
    if (chats.get(userId) === chat) chats.delete(userId)
  })

  // If the chat page can't open here (offline, signed out, or a web app from
  // before chat windows), fall back to the conversation in the main window.
  let gaveUp = false
  const giveUp = () => {
    if (gaveUp || chat.isDestroyed()) return
    gaveUp = true
    chat.destroy()
    openInMainWindow(userId)
  }

  const contents = chat.webContents
  contents.setWindowOpenHandler(({ url }) => {
    if (rules.canOpenExternally(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (rules.isAppUrl(url, ORIGINS)) return
    event.preventDefault()
    if (rules.canOpenExternally(url)) shell.openExternal(url)
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) giveUp()
  })
  contents.on('did-navigate', (_event, url, status) => {
    if (status >= 400 || !isChatUrl(url)) giveUp()
  })

  chat.loadURL(chatUrl(userId))
}

function chatOf(event) {
  if (!rules.isAppUrl(event.senderFrame?.url ?? '', ORIGINS)) return null
  for (const [userId, chat] of chats) {
    if (!chat.isDestroyed() && chat.webContents === event.sender) return { userId, chat }
  }
  return null
}

ipcMain.on('cabal:chat-close', (event) => chatOf(event)?.chat.close())
ipcMain.on('cabal:chat-open-in-cabal', (event) => {
  const found = chatOf(event)
  if (!found) return
  found.chat.close()
  openInMainWindow(found.userId)
})

// --- pinning to the taskbar / Dock -----------------------------------------------

let pinState = rules.normalizePinState(readJson('pin.json'))

function savePin(next) {
  pinState = next
  writeJson('pin.json', pinState)
}

function readDock() {
  return new Promise((resolve) => {
    execFile('defaults', ['read', 'com.apple.dock', 'persistent-apps'], { timeout: 3000 }, (error, stdout) =>
      resolve(error ? null : String(stdout)),
    )
  })
}

// true / false, or null when this system won't say.
async function pinnedNow() {
  if (process.platform === 'win32') {
    const dir = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
    let names
    try {
      names = fs.readdirSync(dir)
    } catch {
      return null
    }
    const links = []
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.lnk')) continue
      try {
        links.push(shell.readShortcutLink(path.join(dir, name)))
      } catch {}
    }
    return rules.taskbarHasApp(links, process.execPath, rules.APP_ID)
  }
  if (process.platform === 'darwin') {
    const dock = await readDock()
    if (dock === null) return null
    const bundle = path.resolve(process.execPath, '..', '..', '..')
    return rules.dockKeepsApp(dock, pathToFileURL(bundle).href)
  }
  return null
}

async function pinStatus() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return { supported: false }
  const pinned = await pinnedNow()
  if (pinned === true && !pinState.done) savePin(rules.pinAnswer(pinState, 'pinned', Date.now()))
  // A Dock icon for an app still on the disk image or in Downloads stops working.
  const needsMove = process.platform === 'darwin' && app.isPackaged && !app.isInApplicationsFolder()
  return { supported: true, pinned, needsMove, ask: rules.pinAskDue(pinState, pinned, Date.now()) }
}

ipcMain.handle('cabal:get-pin', (event) => (fromApp(event) ? pinStatus() : null))
ipcMain.on('cabal:pin-answer', (event, answer) => {
  if (fromApp(event)) savePin(rules.pinAnswer(pinState, String(answer), Date.now()))
})
// Moves the app, then reopens it from Applications.
ipcMain.handle('cabal:move-to-applications', (event) => {
  if (!fromApp(event) || process.platform !== 'darwin' || !app.isPackaged || app.isInApplicationsFolder()) return false
  try {
    return app.moveToApplicationsFolder()
  } catch (error) {
    console.error('Cabal: could not move to Applications', error)
    return false
  }
})

ipcMain.handle('cabal:get-settings', (event) => (fromApp(event) ? settings : null))
ipcMain.handle('cabal:set-settings', (event, raw) => (fromApp(event) ? applySettings(rules.settingsPatch(raw)) : null))

// --- lifecycle ----------------------------------------------------------------------

function appMenu() {
  if (process.platform !== 'darwin') return null
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
  ])
}

function lockDownSession() {
  const ses = session.defaultSession
  const allowed = new Set(['notifications', 'clipboard-sanitized-write'])
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed.has(permission) && rules.isAppUrl(details.requestingUrl || contents.getURL(), ORIGINS))
  })
  ses.setPermissionCheckHandler((_contents, permission, origin) => allowed.has(permission) && ORIGINS.has(origin))
}

function startUpdates() {
  if (!app.isPackaged) return
  try {
    updater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  updater.on('error', (error) => console.error('Cabal update check failed:', error?.message ?? error))
  updater.on('update-downloaded', (info) => {
    updateReady = { version: String(info?.version ?? '') }
    win?.webContents.send('cabal:update', updateReady)
  })
  const check = () => updater.checkForUpdatesAndNotify().catch(() => {})
  check()
  setInterval(check, 6 * 60 * 60 * 1000)
}

app.on('second-instance', (_event, argv) => {
  const link = rules.findDeepLink(argv)
  if (link) openDeepLink(link)
  else showWindow()
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const link = rules.deepLink(url)
  if (app.isReady()) openDeepLink(link)
  else pendingLink = link
})

app.on('before-quit', (event) => {
  quitting = true
  if (quitReady || !win || !rules.isAppUrl(win.webContents.getURL(), ORIGINS)) return
  event.preventDefault()
  win.webContents.send('cabal:before-quit')
  setTimeout(finishQuit, 1500)
})

function finishQuit() {
  if (quitReady) return
  quitReady = true
  quitting = true
  if (installing && updater) updater.quitAndInstall(false, true)
  else app.quit()
}

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('activate', showWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || !settings.closeToTray) app.quit()
})

app.whenReady().then(() => {
  // Windows saves the file path for "Launch at login". Re-save it so it follows
  // the app when the file changes (Cabal.exe became cabal-desktop.exe).
  if (process.platform === 'win32' && app.isPackaged && settings.launchAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })
  }
  Menu.setApplicationMenu(appMenu())
  lockDownSession()
  createTray()
  registerShortcut(settings.shortcut)
  createWindow()
  startUpdates()

  powerMonitor.on('suspend', () => win?.webContents.send('cabal:power', 'suspend'))
  powerMonitor.on('resume', () => {
    if (win && !rules.isAppUrl(win.webContents.getURL(), ORIGINS)) win.loadURL(startUrl())
    else win?.webContents.send('cabal:power', 'resume')
  })
})
