// Pure decisions the shell makes, kept free of Electron so they can be tested with node --test.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE = /^[A-Za-z0-9_-]{6,64}$/

const DEFAULT_SETTINGS = Object.freeze({
  launchAtLogin: false,
  alwaysOnTop: false,
  closeToTray: true,
  shortcut: 'CommandOrControl+Alt+C',
  sessionOverlay: true,
})

const BOOLEAN_SETTINGS = ['launchAtLogin', 'alwaysOnTop', 'closeToTray', 'sessionOverlay']

// Same as `build.appId` in package.json (a test holds them equal). The packaged
// app can't read that file's `build` section: electron-builder strips it.
const APP_ID = 'community.cabal.desktop'

// --- asking you to pin Cabal to the taskbar / Dock ---------------------------------
// No installer can pin itself (Windows and macOS both forbid it), so Cabal asks:
// on first run, then at most twice more a few days apart, until it's pinned or
// you say stop.

const PIN_MAX_ASKS = 3
const PIN_ASK_GAP_MS = 3 * 24 * 60 * 60 * 1000
const PIN_ANSWERS = new Set(['shown', 'later', 'never', 'pinned'])

function normalizePinState(raw) {
  const s = { asks: 0, lastAskedAt: null, done: false }
  if (raw && typeof raw === 'object') {
    if (Number.isInteger(raw.asks) && raw.asks >= 0) s.asks = Math.min(raw.asks, 99)
    if (Number.isFinite(raw.lastAskedAt)) s.lastAskedAt = raw.lastAskedAt
    if (raw.done === true) s.done = true
  }
  return s
}

function pinAskDue(state, pinned, now) {
  if (pinned === true || state.done || state.asks >= PIN_MAX_ASKS) return false
  return state.lastAskedAt === null || now - state.lastAskedAt >= PIN_ASK_GAP_MS
}

function pinAnswer(state, answer, now) {
  if (!PIN_ANSWERS.has(answer)) return state
  if (answer === 'shown') return { ...state, asks: state.asks + 1, lastAskedAt: now }
  if (answer === 'never' || answer === 'pinned') return { ...state, done: true }
  return state
}

// Windows: `links` are the taskbar's pinned shortcuts, read with shell.readShortcutLink.
function taskbarHasApp(links, execPath, appId) {
  const exe = String(execPath || '').toLowerCase()
  return links.some(
    (link) =>
      link &&
      (link.appUserModelId === appId || (exe !== '' && typeof link.target === 'string' && link.target.toLowerCase() === exe)),
  )
}

// macOS: `dockOutput` is `defaults read com.apple.dock persistent-apps`;
// `bundleUrl` is the app bundle as a file:// URL.
function dockKeepsApp(dockOutput, bundleUrl) {
  if (typeof dockOutput !== 'string' || typeof bundleUrl !== 'string' || !bundleUrl) return false
  const want = bundleUrl.replace(/\/?$/, '/').toLowerCase()
  for (const match of dockOutput.matchAll(/"?_CFURLString"?\s*=\s*"([^"]+)"/g)) {
    if (match[1].replace(/\/?$/, '/').toLowerCase() === want) return true
  }
  return false
}

function originOf(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

// The app origin plus any extras from app.json. Plain http is only allowed for localhost.
function allowedOrigins(appUrl, extras = []) {
  const set = new Set()
  for (const candidate of [appUrl, ...extras]) {
    const origin = originOf(candidate)
    if (!origin) continue
    const { protocol, hostname } = new URL(origin)
    if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') continue
    set.add(origin)
  }
  return set
}

function isAppUrl(url, origins) {
  const origin = originOf(url)
  return origin !== null && origins.has(origin)
}

// Links the app can't show itself go to the person's browser — but only ordinary ones.
function canOpenExternally(url) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

// cabal://c/<channel-id> opens a conversation; cabal://join/<code> opens an invite.
function deepLink(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'cabal:') return null
  const parts = [u.hostname, ...u.pathname.split('/')].filter(Boolean)
  if (parts[0] === 'c' && UUID.test(parts[1] ?? '')) return { kind: 'channel', id: parts[1].toLowerCase() }
  if (parts[0] === 'join' && INVITE.test(parts[1] ?? '')) return { kind: 'join', code: parts[1] }
  return null
}

function findDeepLink(argv) {
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith('cabal://')) return deepLink(arg)
  }
  return null
}

function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS }
  if (raw && typeof raw === 'object') {
    for (const key of BOOLEAN_SETTINGS) {
      if (typeof raw[key] === 'boolean') s[key] = raw[key]
    }
    if (typeof raw.shortcut === 'string' && raw.shortcut.length <= 60) s.shortcut = raw.shortcut.trim()
  }
  return s
}

// Only accept known keys of the right type from the page.
function settingsPatch(raw) {
  const patch = {}
  if (!raw || typeof raw !== 'object') return patch
  for (const key of BOOLEAN_SETTINGS) {
    if (typeof raw[key] === 'boolean') patch[key] = raw[key]
  }
  if (typeof raw.shortcut === 'string' && raw.shortcut.length <= 60) patch.shortcut = raw.shortcut.trim()
  return patch
}

// A saved window position is only reused if most of it lands on a screen that still exists.
function restoreBounds(saved, displays, fallback) {
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return fallback
  const width = Math.max(320, Math.min(saved.width, 2400))
  const height = Math.max(420, Math.min(saved.height, 1800))
  const visible = displays.some((d) => {
    const a = d.workArea
    const overlapX = Math.min(saved.x + width, a.x + a.width) - Math.max(saved.x, a.x)
    const overlapY = Math.min(saved.y + height, a.y + a.height) - Math.max(saved.y, a.y)
    return overlapX >= Math.min(160, width) && overlapY >= 80
  })
  return visible ? { x: saved.x, y: saved.y, width, height } : { ...fallback, width, height }
}

function badgeCount(n) {
  return Number.isInteger(n) && n > 0 ? Math.min(n, 999) : 0
}

// When the page says a session started. Anything odd (not a number, in the
// future, older than a day) means "no session" rather than a wrong clock.
function sessionStart(raw, now) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw > now + 60_000 || raw < now - 24 * 60 * 60 * 1000) return null
  return Math.round(raw)
}

// The corner timer goes back where it was dragged, as long as it would be
// fully on a screen that still exists; otherwise bottom-right of the main one.
function overlayPosition(saved, displays, primaryArea, size, margin = 20) {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    const onScreen = displays.some((d) => {
      const a = d.workArea
      return (
        saved.x >= a.x &&
        saved.y >= a.y &&
        saved.x + size.width <= a.x + a.width &&
        saved.y + size.height <= a.y + a.height
      )
    })
    if (onScreen) return { x: Math.round(saved.x), y: Math.round(saved.y) }
  }
  return {
    x: primaryArea.x + primaryArea.width - size.width - margin,
    y: primaryArea.y + primaryArea.height - size.height - margin,
  }
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi))

// Where the corner window goes. Closed, it's the pill at `anchor`. Open, the
// list grows from the pill toward the middle of the screen: from a pill on the
// right half it lines up with the pill's right edge, from the bottom half it
// grows upward. Always kept fully on the screen.
function overlayBounds(anchor, pill, panel, area) {
  if (!panel) return { x: Math.round(anchor.x), y: Math.round(anchor.y), width: pill.width, height: pill.height }
  const width = Math.min(panel.width, area.width)
  const height = clamp(panel.height, pill.height, area.height)
  const right = anchor.x + pill.width / 2 > area.x + area.width / 2
  const below = anchor.y + pill.height / 2 > area.y + area.height / 2
  const x = right ? anchor.x + pill.width - width : anchor.x
  const y = below ? anchor.y + pill.height - height : anchor.y
  return {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width,
    height,
  }
}

// The pill spot that puts an open list (dragged somewhere new) back exactly
// where it is — the reverse of overlayBounds.
function anchorFromBounds(bounds, pill, area) {
  const right = bounds.x + bounds.width / 2 > area.x + area.width / 2
  const below = bounds.y + bounds.height / 2 > area.y + area.height / 2
  return {
    x: Math.round(right ? bounds.x + bounds.width - pill.width : bounds.x),
    y: Math.round(below ? bounds.y + bounds.height - pill.height : bounds.y),
  }
}

function panelHeight(raw, min = 160, max = 520) {
  return Number.isFinite(raw) ? Math.round(clamp(raw, min, max)) : min
}

const STATUSES = new Set(['online', 'away', 'dnd', 'offline'])
const MAX_PEOPLE = 600
const MAX_GROUPS = 30

function text(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}
function id(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

// The buddy list the page hands over for the corner: only the fields it draws,
// capped, so a bad page can't make the corner window do anything odd.
function buddySnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null
  let budget = MAX_PEOPLE
  const people = (list) => {
    const out = []
    if (!Array.isArray(list)) return out
    for (const p of list) {
      if (budget <= 0) break
      const pid = id(p?.id)
      if (!pid) continue
      budget -= 1
      out.push({
        id: pid,
        name: text(p.name, 60) || 'Someone',
        status: STATUSES.has(p.status) ? p.status : 'offline',
        note: text(p.note, 80) || null,
        unread: badgeCount(p.unread),
        group: id(p.group),
      })
    }
    return out
  }
  const groups = []
  for (const g of Array.isArray(raw.groups) ? raw.groups.slice(0, MAX_GROUPS) : []) {
    const gid = id(g?.id)
    const name = text(g?.name, 40)
    if (!gid || !name) continue
    groups.push({
      id: gid,
      name,
      collapsed: g.collapsed === true,
      total: Number.isInteger(g.total) && g.total > 0 ? Math.min(g.total, MAX_PEOPLE) : 0,
      people: people(g.people),
    })
  }
  return { groups, here: people(raw.here), offline: people(raw.offline) }
}

// What the corner list may ask the page to do. Anything else is dropped.
function overlayAction(raw) {
  if (!raw || typeof raw !== 'object') return null
  switch (raw.type) {
    case 'open-dm': {
      const userId = id(raw.userId)
      return userId ? { type: 'open-dm', userId } : null
    }
    case 'move': {
      const userId = id(raw.userId)
      if (!userId) return null
      if (raw.groupId === null) return { type: 'move', userId, groupId: null }
      const groupId = id(raw.groupId)
      return groupId ? { type: 'move', userId, groupId } : null
    }
    case 'create-group': {
      const name = text(raw.name, 40)
      const userId = raw.userId == null ? null : id(raw.userId)
      if (!name || (raw.userId != null && !userId)) return null
      return { type: 'create-group', name, userId }
    }
    case 'rename-group': {
      const groupId = id(raw.groupId)
      const name = text(raw.name, 40)
      return groupId && name ? { type: 'rename-group', groupId, name } : null
    }
    case 'delete-group': {
      const groupId = id(raw.groupId)
      return groupId ? { type: 'delete-group', groupId } : null
    }
    case 'collapse-group': {
      const groupId = id(raw.groupId)
      return groupId && typeof raw.collapsed === 'boolean' ? { type: 'collapse-group', groupId, collapsed: raw.collapsed } : null
    }
    case 'pause-session':
      return { type: 'pause-session' }
    default:
      return null
  }
}

module.exports = {
  APP_ID,
  normalizePinState,
  pinAskDue,
  pinAnswer,
  taskbarHasApp,
  dockKeepsApp,
  overlayBounds,
  anchorFromBounds,
  panelHeight,
  buddySnapshot,
  overlayAction,
  DEFAULT_SETTINGS,
  allowedOrigins,
  isAppUrl,
  canOpenExternally,
  deepLink,
  findDeepLink,
  normalizeSettings,
  settingsPatch,
  restoreBounds,
  badgeCount,
  sessionStart,
  overlayPosition,
}
