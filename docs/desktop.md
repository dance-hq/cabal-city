# The desktop app

`desktop/` is a small Electron shell. It opens your hosted Cabal (`appUrl` in `desktop/app.json`, or `CABAL_APP_URL` while developing) and adds what a browser tab can't:

- a tray / menu bar icon with the unread DM count
- a dock or taskbar badge, and a flashing taskbar when a new DM arrives in the background
- a global show/hide shortcut (default `Ctrl/Cmd+Alt+C`, changeable in Settings)
- start at login, keep on top, and close-to-tray, all in Settings → Desktop
- `cabal://c/<conversation-id>` and `cabal://join/<invite-code>` links
- a "can't reach Cabal" screen that retries on its own
- telling your friends you went offline before the app quits or the computer sleeps
- automatic updates from GitHub Releases

## Security

- The page runs sandboxed with context isolation and no Node access. The only bridge is `window.cabalDesktop` (`src/preload.cjs`), and the main process ignores bridge calls from any page that isn't your Cabal.
- The window can only show your Cabal's address. Other links open in your browser, and only `https`, `http` and `mailto` links are opened at all.
- The only web permissions granted are notifications and copying to the clipboard.
- Only `appUrl` and the extra `allowedOrigins` in `app.json` are trusted, and plain `http` is accepted only for `localhost`.

The decisions above live in `src/rules.cjs` and are tested in `test/rules.test.cjs` (`npm run check`).

## Develop

```bash
cd desktop
npm install
npm run dev     # against http://localhost:3000 (run `pnpm dev` at the repo root first)
```

## Release

1. In GitHub, set the repository **variable** `CABAL_APP_URL` to your deployed site.
2. Push a tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. `.github/workflows/desktop-release.yml` builds macOS (Apple Silicon and Intel `.dmg`), Windows (one installer for x64 and Arm) and Linux (`.AppImage`, `.deb`), then publishes them to a GitHub Release. The app version follows the tag.

You can also run the workflow by hand from the Actions tab. That keeps the installers as build artifacts without publishing a release.

### Signing (optional)

Unsigned builds work, but macOS Gatekeeper and Windows SmartScreen warn on first open.

**macOS.** Add these repository secrets:

| Secret | For |
| --- | --- |
| `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD` | Developer ID Application certificate |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization |

macOS auto-update only works for signed builds. That's an Apple rule.

**Windows** signs with [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/) (formerly Trusted Signing). No certificate file ever sits on the build machine. Set these on the repository:

| Name | Kind | Value |
| --- | --- | --- |
| `AZURE_SIGNING_ENDPOINT` | variable | Your signing account's region endpoint, e.g. `https://eus.codesigning.azure.net/` |
| `AZURE_SIGNING_ACCOUNT` | variable | Signing account name |
| `AZURE_SIGNING_PROFILE` | variable | Certificate profile name |
| `WINDOWS_PUBLISHER_NAME` | variable | The name on the certificate, exactly as validated (e.g. `Dance Technologies Inc.`) |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | secrets | An app registration with the *Artifact Signing Certificate Profile Signer* role on the profile |

Setting `AZURE_SIGNING_ENDPOINT` turns signing on. From then on, a release with any of the others missing, or one whose `Cabal.exe` doesn't come out validly signed by that publisher, fails before anything is uploaded. Signed installs only accept updates signed by the same publisher, so never go back to unsigned or change the publisher name.
