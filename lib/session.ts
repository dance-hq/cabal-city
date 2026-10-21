// The lock-in timer counts seconds so you can see it moving: 0:42, 12:05, 1:02:33.
export function formatSession(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

// Whole minutes, for screen readers and summaries.
export function describeSession(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes === 0) return 'under a minute'
  const hours = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  return parts.join(' ')
}

// "42m" / "1h 05m" for someone else's session in a list: present, not ticking.
export function shortDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  if (!hours) return `${minutes}m`
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

export const FOCUS_MAX = 120

export type LockInState = {
  status: 'none' | 'running' | 'paused'
  // Local-clock ms the timer would have started at if it had never paused.
  startedAt: number | null
  workedMs: number
  focus: string | null
  shared: boolean
  // 'away' = Cabal was closed or asleep; it picks back up on its own.
  pausedBy: 'you' | 'away' | null
}

export const NO_LOCK_IN: LockInState = {
  status: 'none',
  startedAt: null,
  workedMs: 0,
  focus: null,
  shared: false,
  pausedBy: null,
}

// Gaps shorter than this aren't worth mentioning when a session picks back up.
export const AWAY_NOTE_MIN_MS = 60_000

type RawLockIn = {
  running_since: string | null
  worked_seconds: number
  paused_at: string | null
  paused_by?: 'you' | 'away' | null
  focus: string | null
  shared: boolean
  now: string
  away_seconds?: number
}

// Reads the server's answer, correcting for this computer's clock being off.
export function readLockIn(raw: unknown, localNow = Date.now()): LockInState {
  if (!raw || typeof raw !== 'object') return NO_LOCK_IN
  const r = raw as RawLockIn
  const workedMs = Math.max(0, (r.worked_seconds ?? 0) * 1000)
  const base = { focus: r.focus ?? null, shared: !!r.shared, workedMs }
  if (r.paused_at || !r.running_since) {
    return { ...base, status: 'paused', startedAt: null, pausedBy: r.paused_by === 'you' ? 'you' : 'away' }
  }
  const skew = localNow - Date.parse(r.now)
  return { ...base, status: 'running', startedAt: Date.parse(r.running_since) + skew - workedMs, pausedBy: null }
}

// How long Cabal was away, when the server just picked the session back up.
export function readAwayMs(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const seconds = (raw as RawLockIn).away_seconds
  return typeof seconds === 'number' && seconds * 1000 >= AWAY_NOTE_MIN_MS ? seconds * 1000 : null
}
