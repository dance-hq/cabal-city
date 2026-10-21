// The Electron preload exposes `window.cabalDesktop`. In a normal browser it
// is undefined and every call below is a no-op.

export type DesktopSettings = {
  launchAtLogin: boolean
  alwaysOnTop: boolean
  closeToTray: boolean
  shortcut: string
  // Desktop apps released before the session timer don't have this.
  sessionOverlay?: boolean
}

export type DesktopBridge = {
  version: string
  platform: string
  show(): void
  setBadge(count: number): void
  getSettings(): Promise<DesktopSettings>
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>
  quit(): void
  onPower(cb: (state: 'suspend' | 'resume') => void): () => void
  onBeforeQuit(cb: () => Promise<void> | void): () => void
  onNavigate(cb: (target: string) => void): () => void
  // Desktop apps released before the in-app update bar don't have these.
  getUpdate?(): Promise<DesktopUpdate | null>
  installUpdate?(): void
  onUpdate?(cb: (update: DesktopUpdate) => void): () => void
  // Desktop apps released before the session timer don't have these.
  launchedAt?: number
  setSession?(startedAt: number | null): void
}

export type DesktopUpdate = { version: string }

declare global {
  interface Window {
    cabalDesktop?: DesktopBridge
  }
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.cabalDesktop
}
