# Desktop release security — October 2026

Part D of the [October 2026 audit](./audit-2026-10.md). Based on the published v0.1.3 assets (inspected byte by byte) and the configuration on branch `v0/build-cabal-application-093736a4`.

What's shared by all three platforms:

- **Runtime.** One Electron shell (Electron 44) that loads the hosted Cabal. Every window is sandboxed, with context isolation and no Node access. The only bridge is `window.cabalDesktop`, and it only answers the main window showing Cabal's own origin. Web permissions are limited to notifications and sanitized clipboard writes. Links outside Cabal open in the browser (`https`, `http`, `mailto` only).
- **Fuses.** v0.1.3 ships stock settings (RunAsNode, NODE_OPTIONS and `--inspect` on; asar integrity off). The next release turns them off, makes the app load only from `app.asar` and validates its integrity (CAB-03).
- **Provenance.** Builds come from `.github/workflows/desktop-release.yml` on GitHub-hosted runners, from a tag only admins can create. From the next tag, the release also carries `SHA256SUMS.txt` and a signed build-provenance attestation for every file:

  ```bash
  gh attestation verify Cabal-0.1.4-mac-arm64.dmg -R dance-hq/cabal-city
  ```

  v0.1.0–v0.1.3 have neither.

- **Updates.** `electron-updater`, GitHub provider, checks every 6 hours and installs on quit. The update is checked against the SHA-512 in the release's `latest*.yml`. Both live in the same mutable release, so trust rests on GitHub account security until builds are signed (CAB-02).

## macOS

| | |
| --- | --- |
| Signing | **Unsigned.** Only the linker's ad-hoc signature: no Developer ID, not notarized, `CodeResources` empty. |
| Installer integrity | `.dmg` and `.zip` per architecture. No signature, no published checksum before v0.1.4. Gatekeeper blocks first open, and people have to override it. |
| Sandboxing and privileges | Hardened runtime on. Entitlements are only `allow-jit` and `network.client`. No camera, microphone, contacts or files. |
| Updates | **Don't work** while unsigned (Squirrel.Mac requires a signature). Installed copies stay on their version until the user downloads again. |
| Provenance | Attestation and checksums from v0.1.4. |
| To be trustworthy publicly | Apple Developer Program membership, a Developer ID Application certificate and notarization. Add the five secrets in `docs/desktop.md`, then cut a release. After that, verify `spctl -a -vv Cabal.app` says "accepted, source=Notarized Developer ID". |

## Windows

| | |
| --- | --- |
| Signing | **Unsigned.** The PE security directory is empty. |
| Installer integrity | One-click NSIS installer, per-user (no admin rights), x64 and Arm. SmartScreen warns. Checksums from v0.1.4. |
| Sandboxing and privileges | Runs as the user. No elevation and no services. Same Electron sandbox as above. |
| Updates | Works, and that's the risk. Without a publisher signature, any installer whose hash matches the release's `latest.yml` is accepted. |
| Provenance | Attestation and checksums from v0.1.4. |
| To be trustworthy publicly | Azure Artifact Signing (identity validation for Dance Technologies) and the variables and secrets in `docs/desktop.md`. Once signed, installs reject updates from any other publisher, so never ship unsigned again or change the publisher name. |

## Linux

| | |
| --- | --- |
| Signing | **Unsigned** `.deb` and AppImage. This is common on Linux, but it means there's nothing to verify against. |
| Installer integrity | Checksums and attestation from v0.1.4. |
| Sandboxing and privileges | Uses Chromium's sandbox (`chrome-sandbox` helper ships in the package). No root needed for the AppImage. |
| Updates | AppImage self-updates like Windows (same hash-only trust). `.deb` doesn't auto-update. |
| Provenance | Attestation and checksums from v0.1.4. |
| To be trustworthy publicly | Publish a GPG-signed `SHA256SUMS` (or sign the `.deb`) with a key whose fingerprint is on cabal.city. Attestation covers people who use `gh`. |

## Smallest next steps

1. Tag v0.1.4 from this branch (fuses, redirect lockdown, checksums, attestation).
2. Turn on immutable releases in repository settings.
3. Buy the Apple Developer membership and set up Azure Artifact Signing, add the secrets, and release v0.1.5 signed.
4. Tell Mac users on ≤ v0.1.3 to download once by hand.
