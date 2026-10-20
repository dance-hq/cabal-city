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

test('badge counts are whole, positive and capped', () => {
  assert.equal(rules.badgeCount(3), 3)
  assert.equal(rules.badgeCount(-1), 0)
  assert.equal(rules.badgeCount(2.5), 0)
  assert.equal(rules.badgeCount(5000), 999)
})
