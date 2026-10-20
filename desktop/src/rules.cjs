// Pure decisions the shell makes, kept free of Electron so they can be tested with node --test.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVITE = /^[A-Za-z0-9_-]{6,64}$/

const DEFAULT_SETTINGS = Object.freeze({
  launchAtLogin: false,
  alwaysOnTop: false,
  closeToTray: true,
  shortcut: 'CommandOrControl+Alt+C',
})

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
    for (const key of ['launchAtLogin', 'alwaysOnTop', 'closeToTray']) {
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
  for (const key of ['launchAtLogin', 'alwaysOnTop', 'closeToTray']) {
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

module.exports = {
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
}
