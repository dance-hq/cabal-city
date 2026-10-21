const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../src/rules.cjs')

test('only the app origin (and https extras) are trusted', () => {
  const origins = rules.allowedOrigins('https://cabal.example.com/', ['http://evil.example', 'https://extra.example'])
  assert.deepEqual([...origins], ['https://cabal.example.com', 'https://extra.example'])
  assert.equal(rules.isAppUrl('https://cabal.example.com/app?c=1', origins), true)
  assert.equal(rules.isAppUrl('https://cabal.example.com.evil.io/app', origins), false)
  assert.equal(rules.isAppUrl('javascript:alert(1)', origins), false)
})

test('plain http is allowed only for local development', () => {
  assert.equal(rules.allowedOrigins('http://localhost:3000').has('http://localhost:3000'), true)
  assert.equal(rules.allowedOrigins('http://cabal.example.com').size, 0)
})

test('only ordinary links open in the browser', () => {
  assert.equal(rules.canOpenExternally('https://github.com'), true)
  assert.equal(rules.canOpenExternally('mailto:a@b.co'), true)
  assert.equal(rules.canOpenExternally('file:///etc/passwd'), false)
  assert.equal(rules.canOpenExternally('smb://host/share'), false)
  assert.equal(rules.canOpenExternally('not a url'), false)
})

test('deep links open conversations and invites, nothing else', () => {
  const id = '0d09001d-2d0a-4e4f-8810-f7668750d6ac'
  assert.deepEqual(rules.deepLink(`cabal://c/${id.toUpperCase()}`), { kind: 'channel', id })
  assert.deepEqual(rules.deepLink('cabal://join/abc123XYZ'), { kind: 'join', code: 'abc123XYZ' })
  assert.equal(rules.deepLink('cabal://c/../../etc'), null)
  assert.equal(rules.deepLink('cabal://join/a b'), null)
  assert.equal(rules.deepLink('https://c/x'), null)
  assert.deepEqual(rules.findDeepLink(['/app', '--hidden', 'cabal://join/abcdef']), { kind: 'join', code: 'abcdef' })
})

test('settings from disk and from the page are cleaned', () => {
  assert.deepEqual(rules.normalizeSettings({ alwaysOnTop: 'yes', closeToTray: false, extra: 1 }), {
    ...rules.DEFAULT_SETTINGS,
    closeToTray: false,
  })
  assert.deepEqual(rules.settingsPatch({ launchAtLogin: true, shortcut: ' Alt+K ', __proto__: { x: 1 } }), {
    launchAtLogin: true,
    shortcut: 'Alt+K',
  })
  assert.deepEqual(rules.settingsPatch('nope'), {})
})

test('a window saved on a missing screen comes back on screen', () => {
  const displays = [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }]
  const fallback = { width: 980, height: 680 }
  assert.deepEqual(rules.restoreBounds({ x: 100, y: 100, width: 400, height: 600 }, displays, fallback), {
    x: 100, y: 100, width: 400, height: 600,
  })
  assert.deepEqual(rules.restoreBounds({ x: 3000, y: 100, width: 400, height: 600 }, displays, fallback), {
    width: 400, height: 600,
  })
  assert.deepEqual(rules.restoreBounds(null, displays, fallback), fallback)
})

test('a session start from the page must be a sensible time', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  assert.equal(rules.sessionStart(now - 5 * 60_000, now), now - 5 * 60_000)
  assert.equal(rules.sessionStart(null, now), null)
  assert.equal(rules.sessionStart('123', now), null)
  assert.equal(rules.sessionStart(Number.NaN, now), null)
  assert.equal(rules.sessionStart(now + 10 * 60_000, now), null)
  assert.equal(rules.sessionStart(now - 2 * 24 * 3600_000, now), null)
})

test('the corner timer stays on a screen, bottom-right by default', () => {
  const size = { width: 128, height: 34 }
  const primary = { x: 0, y: 25, width: 1440, height: 875 }
  const displays = [{ workArea: primary }]
  assert.deepEqual(rules.overlayPosition(null, displays, primary, size), { x: 1292, y: 846 })
  assert.deepEqual(rules.overlayPosition({ x: 40, y: 60 }, displays, primary, size), { x: 40, y: 60 })
  // Dragged onto a monitor that's gone, or half off the edge: back to the corner.
  assert.deepEqual(rules.overlayPosition({ x: 2000, y: 60 }, displays, primary, size), { x: 1292, y: 846 })
  assert.deepEqual(rules.overlayPosition({ x: 1400, y: 60 }, displays, primary, size), { x: 1292, y: 846 })
  assert.equal(rules.normalizeSettings({ sessionOverlay: false }).sessionOverlay, false)
  assert.equal(rules.normalizeSettings(null).sessionOverlay, true)
})

test('the open buddy list grows from the pill toward the middle of the screen', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 }
  const pill = { width: 128, height: 34 }
  const panel = { width: 248, height: 400 }
  // Closed: just the pill where it was left.
  assert.deepEqual(rules.overlayBounds({ x: 10, y: 20 }, pill, null, area), { x: 10, y: 20, width: 128, height: 34 })
  // Top-left pill: list hangs down and to the right from it.
  assert.deepEqual(rules.overlayBounds({ x: 20, y: 20 }, pill, panel, area), { x: 20, y: 20, width: 248, height: 400 })
  // Bottom-right pill (the default): list grows up and to the left, its corner on the pill's.
  assert.deepEqual(rules.overlayBounds({ x: 1292, y: 846 }, pill, panel, area), { x: 1172, y: 480, width: 248, height: 400 })
  // Never taller than the screen, never off it.
  const tall = rules.overlayBounds({ x: 20, y: 20 }, pill, { width: 248, height: 5000 }, area)
  assert.equal(tall.height, 900)
  assert.equal(tall.y, 0)
})

test('an open list dragged somewhere new reopens in the same spot', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 }
  const pill = { width: 128, height: 34 }
  const panel = { width: 248, height: 400 }
  for (const bounds of [
    { x: 30, y: 40, width: 248, height: 400 },
    { x: 1100, y: 450, width: 248, height: 400 },
    { x: 900, y: 60, width: 248, height: 400 },
  ]) {
    const anchor = rules.anchorFromBounds(bounds, pill, area)
    assert.deepEqual(rules.overlayBounds(anchor, pill, panel, area), bounds)
  }
  // A closed pill's own bounds are its anchor.
  assert.deepEqual(rules.anchorFromBounds({ x: 1292, y: 846, width: 128, height: 34 }, pill, area), { x: 1292, y: 846 })
})

test('the list height the corner asks for is kept sensible', () => {
  assert.equal(rules.panelHeight(300), 300)
  assert.equal(rules.panelHeight(20), 160)
  assert.equal(rules.panelHeight(9999), 520)
  assert.equal(rules.panelHeight(NaN), 160)
})

const ANA = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'

test('the corner only gets the fields it draws from the buddy list', () => {
  const list = rules.buddySnapshot({
    groups: [
      { id: GROUP, name: '  Night   owls ', collapsed: true, total: 3, people: [{ id: ANA, name: 'Ana', status: 'online', unread: 2, extra: 'x' }] },
      { id: 'not-a-uuid', name: 'Bad', people: [] },
    ],
    here: [{ id: ANA, name: '', status: 'sleeping', note: 'heads down' }],
    offline: 'nope',
  })
  assert.equal(list.groups.length, 1)
  assert.equal(list.groups[0].name, 'Night owls')
  assert.deepEqual(list.groups[0].people[0], { id: ANA, name: 'Ana', status: 'online', note: null, unread: 2, group: null })
  assert.deepEqual(list.here[0], { id: ANA, name: 'Someone', status: 'offline', note: 'heads down', unread: 0, group: null })
  assert.deepEqual(list.offline, [])
  assert.equal(rules.buddySnapshot(null), null)
  const many = Array.from({ length: 800 }, () => ({ id: ANA, name: 'A', status: 'online' }))
  assert.equal(rules.buddySnapshot({ here: many }).here.length, 600)
})

test('the corner can only ask for a short list of things', () => {
  assert.deepEqual(rules.overlayAction({ type: 'open-dm', userId: ANA.toUpperCase() }), { type: 'open-dm', userId: ANA })
  assert.deepEqual(rules.overlayAction({ type: 'move', userId: ANA, groupId: null }), { type: 'move', userId: ANA, groupId: null })
  assert.deepEqual(rules.overlayAction({ type: 'move', userId: ANA, groupId: GROUP }), { type: 'move', userId: ANA, groupId: GROUP })
  assert.deepEqual(rules.overlayAction({ type: 'create-group', name: ' Co-founders ' }), {
    type: 'create-group',
    name: 'Co-founders',
    userId: null,
  })
  assert.deepEqual(rules.overlayAction({ type: 'collapse-group', groupId: GROUP, collapsed: true }), {
    type: 'collapse-group',
    groupId: GROUP,
    collapsed: true,
  })
  assert.equal(rules.overlayAction({ type: 'move', userId: ANA }), null)
  assert.equal(rules.overlayAction({ type: 'create-group', name: '   ' }), null)
  assert.equal(rules.overlayAction({ type: 'create-group', name: 'x', userId: 'bad' }), null)
  assert.equal(rules.overlayAction({ type: 'rename-group', groupId: GROUP, name: '' }), null)
  assert.equal(rules.overlayAction({ type: 'send-message', userId: ANA, body: 'hi' }), null)
  assert.equal(rules.overlayAction('open-dm'), null)
})

test('badge counts are whole, positive and capped', () => {
  assert.equal(rules.badgeCount(3), 3)
  assert.equal(rules.badgeCount(-1), 0)
  assert.equal(rules.badgeCount(2.5), 0)
  assert.equal(rules.badgeCount(5000), 999)
})

test('the window ID matches the one the installer stamps on shortcuts', () => {
  assert.equal(rules.APP_ID, require('../package.json').build.appId)
})

test('Cabal asks to be pinned on first run, then at most twice more, days apart', () => {
  const day = 24 * 60 * 60 * 1000
  let s = rules.normalizePinState(null)
  assert.equal(rules.pinAskDue(s, false, 0), true)
  s = rules.pinAnswer(s, 'shown', 0)
  assert.equal(rules.pinAskDue(s, false, day), false)
  assert.equal(rules.pinAskDue(s, false, 3 * day), true)
  s = rules.pinAnswer(rules.pinAnswer(s, 'shown', 3 * day), 'shown', 6 * day)
  assert.equal(s.asks, 3)
  assert.equal(rules.pinAskDue(s, false, 60 * day), false)
})

test('pinning, or saying stop, ends the asking', () => {
  const fresh = rules.normalizePinState({})
  assert.equal(rules.pinAskDue(fresh, true, 0), false)
  assert.equal(rules.pinAskDue(rules.pinAnswer(fresh, 'never', 0), false, 0), false)
  assert.equal(rules.pinAskDue(rules.pinAnswer(fresh, 'pinned', 0), null, 0), false)
  assert.deepEqual(rules.pinAnswer(fresh, 'later', 5), fresh)
  assert.deepEqual(rules.pinAnswer(fresh, 'whatever', 5), fresh)
  assert.deepEqual(rules.normalizePinState({ asks: -1, lastAskedAt: 'x', done: 'yes' }), fresh)
})

test('a Windows taskbar pin is found by its ID or by the program it opens', () => {
  const exe = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\cabal-desktop\\Cabal.exe'
  assert.equal(rules.taskbarHasApp([{ target: 'C:\\Windows\\explorer.exe' }, { appUserModelId: rules.APP_ID }], exe, rules.APP_ID), true)
  assert.equal(rules.taskbarHasApp([{ target: exe.toUpperCase() }], exe, rules.APP_ID), true)
  assert.equal(rules.taskbarHasApp([{ target: 'C:\\Other\\Cabal.exe' }, null], exe, rules.APP_ID), false)
  assert.equal(rules.taskbarHasApp([{ target: '' }], '', rules.APP_ID), false)
})

test('a Dock entry is found by the app bundle it points at', () => {
  const dock = `(
        {
        "tile-data" =         {
            "file-data" =             {
                "_CFURLString" = "file:///Applications/Cabal.app/";
                "_CFURLStringType" = 15;
            };
        };
    },
        {
        "tile-data" =         {
            "file-data" =             {
                "_CFURLString" = "file:///System/Applications/Mail.app/";
                "_CFURLStringType" = 15;
            };
        };
    }
)`
  assert.equal(rules.dockKeepsApp(dock, 'file:///Applications/Cabal.app'), true)
  assert.equal(rules.dockKeepsApp(dock, 'file:///Volumes/Cabal/Cabal.app'), false)
  assert.equal(rules.dockKeepsApp(null, 'file:///Applications/Cabal.app'), false)
})
