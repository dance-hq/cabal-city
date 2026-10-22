// The Electron preload exposes `window.cabalDesktop`. In a normal browser it
// is undefined and every call below is a no-op.

import type { BuddyAction, OverlayBuddies } from './buddy-groups'

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
  // Desktop apps released before the paused corner timer don't have this.
  setPausedSession?(workedMs: number): void
  // Desktop apps released before the corner buddy list don't have these.
  setBuddies?(list: OverlayBuddies): void
  onBuddyAction?(cb: (action: BuddyAction) => void): () => void
  // Desktop apps released before the pin prompt (0.1.2 and older) don't have these.
  getPin?(): Promise<DesktopPin | null>
  answerPin?(answer: PinAnswer): void
  moveToApplications?(): Promise<boolean>
}

export type DesktopUpdate = { version: string }

// `pinned` is null when the system won't say (then the person tells us).
export type DesktopPin =
  | { supported: false }
  | { supported: true; pinned: boolean | null; needsMove: boolean; ask: boolean }

export type PinAnswer = 'shown' | 'later' | 'never' | 'pinned'

declare global {
  interface Window {
    cabalDesktop?: DesktopBridge
  }
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.cabalDesktop
}
