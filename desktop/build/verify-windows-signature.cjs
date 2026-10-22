// electron-builder afterSign hook, added to the build config only by the release
// workflow when Windows signing is on. It runs after the app's .exe is signed and before
// the installer is built or anything is uploaded, so a bad signature stops the release.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function verifyWindowsSignature(context) {
  if (context.electronPlatformName !== 'win32') return
  const publisher = process.env.WINDOWS_PUBLISHER_NAME
  // productFilename is win.executableName when set (cabal-desktop).
  const name = `${context.packager.appInfo.productFilename}.exe`
  const exe = path.join(context.appOutDir, name)
  const script = [
    `$s = Get-AuthenticodeSignature -LiteralPath '${exe.replace(/'/g, "''")}'`,
    "[pscustomobject]@{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress",
  ].join('; ')
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })
  const { status, subject } = JSON.parse(out)
  if (status !== 'Valid') throw new Error(`${name} is not validly signed (status: ${status}, signer: ${subject || 'none'})`)
  if (publisher && !subject.includes(`CN=${publisher}`)) {
    throw new Error(`${name} is signed by "${subject}", not "${publisher}" (WINDOWS_PUBLISHER_NAME must match the certificate name exactly)`)
  }
  console.log(`  • ${name} signature OK: ${subject}`)
}
