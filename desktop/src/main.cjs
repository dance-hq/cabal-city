const path = require('node:path')
const fs = require('node:fs')
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
  })
  win.on('focus', () => {
    win?.flashFrame(false)
    // With "Keep the window on top" on, both windows float; clicking Cabal
    // would otherwise slide it over the timer.
    if (overlay?.isVisible()) overlay.moveTop()
  })

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
let overlayAnchor = null
let overlayExpanded = false
let overlayHeight = 360
let buddies = null
let drag = null

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi))
const areaAround = (b) => screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }).workArea

// Shown for the whole session, including while Cabal itself is open or maximized.
function overlayWanted() {
  return sessionStartedAt !== null && settings.sessionOverlay
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
  contents.send('cabal:overlay-session', sessionStartedAt)
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
  overlay.setAlwaysOnTop(true, 'floating')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  const contents = overlay.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())

  overlay.on('blur', endDrag)
  overlay.on('closed', () => {
    clearInterval(drag?.timer)
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
  if (!win || !rules.isAppUrl(win.webContents.getURL(), ORIGINS)) return showWindow()
  if (action.type === 'open-dm') showWindow()
  win.webContents.send('cabal:buddy-action', action)
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
