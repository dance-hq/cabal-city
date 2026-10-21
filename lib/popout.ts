// A desktop chat window (opened from the corner buddy list) runs its own copy
// of the app for one conversation. It tells the main Cabal window which
// conversation it's showing, so the main window doesn't notify or count
// unread for messages you're already reading there.

const CHANNEL = 'cabal:popout'
// A focused chat window repeats itself well inside this, so a crashed one is forgotten quickly.
const FRESH_MS = 15_000
const REPEAT_MS = 5_000

type Note = { channelId: string; viewing: boolean }

const seen = new Map<string, number>()
let listening: BroadcastChannel | null = null

function supported() {
  return typeof window !== 'undefined' && 'BroadcastChannel' in window
}

// Main window: start hearing chat windows. Safe to call more than once.
export function listenForPopouts() {
  if (!supported() || listening) return
  listening = new BroadcastChannel(CHANNEL)
  listening.onmessage = (event: MessageEvent<Note>) => {
    const note = event.data
    if (!note || typeof note.channelId !== 'string') return
    if (note.viewing) seen.set(note.channelId, Date.now())
    else seen.delete(note.channelId)
  }
}

export function viewedInPopout(channelId: string) {
  const at = seen.get(channelId)
  return at !== undefined && Date.now() - at < FRESH_MS
}

// Chat window: say what's on screen while this window has focus. Returns a cleanup.
export function announceViewing(channelId: string) {
  if (!supported()) return () => {}
  const out = new BroadcastChannel(CHANNEL)
  const post = (viewing: boolean) => out.postMessage({ channelId, viewing } satisfies Note)
  const update = () => post(document.visibilityState === 'visible' && document.hasFocus())
  update()
  const timer = setInterval(update, REPEAT_MS)
  const gone = () => post(false)
  window.addEventListener('focus', update)
  window.addEventListener('blur', update)
  window.addEventListener('pagehide', gone)
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', update)
    window.removeEventListener('blur', update)
    window.removeEventListener('pagehide', gone)
    gone()
    out.close()
  }
}

// The chat window's own small desktop bridge (desktop/src/chat-preload.cjs).
export type ChatBridge = {
  openInCabal(): void
  close(): void
}

declare global {
  interface Window {
    cabalChat?: ChatBridge
  }
}

export function chatBridge(): ChatBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.cabalChat
}
