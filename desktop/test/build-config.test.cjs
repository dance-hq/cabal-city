const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const pkg = require('../package.json')

// Discord treats any process with a name from its game list as that game: it
// draws its game overlay on top and shows friends "Playing …". These are the
// Windows names it lists for CABAL Online and Cabal 2 (discord.com/api/v9/applications/detectable).
const DISCORD_GAME_EXES = ['cabal.exe', 'cabalmain.exe', 'cabal2main.exe']

test('the Windows app is not named like a game Discord detects', () => {
  const name = pkg.build.win.executableName
  assert.ok(name, 'build.win.executableName must be set; without it the file is Cabal.exe (= CABAL Online to Discord)')
  assert.ok(!DISCORD_GAME_EXES.includes(`${name}.exe`.toLowerCase()), `${name}.exe is on Discord's game list`)
})

test('the installer re-points old shortcuts at the renamed app', () => {
  assert.equal(pkg.build.nsis.include, 'build/installer.nsh')
  const script = fs.readFileSync(path.join(__dirname, '..', pkg.build.nsis.include), 'utf8')
  assert.match(script, /!macro customInstall/)
  for (const link of ['$newStartMenuLink', '$newDesktopLink', 'User Pinned\\TaskBar']) {
    assert.ok(script.includes(link), `installer.nsh should re-point ${link}`)
  }
})
