// Lock in hours as the server reports them (finished sessions only), plus the
// small bits of arithmetic the app does on top: adding the running timer to
// your own numbers, labels, and week ranges in the community's time zone.

export type RecentSession = {
  id: string
  startedAt: number
  endedAt: number
  seconds: number
  focus: string | null
  note: string | null
}

export type LockInStats = {
  todaySeconds: number
  weekSeconds: number
  allSeconds: number
  sessions: number
  // Monday..Sunday of this week, seconds per day.
  days: number[]
  self: boolean
  // On the weekly board (and sharing these numbers on their profile).
  board: boolean
  // Shows up in "Locked in now". Only known for yourself.
  live: boolean
  timeZone: string
  weekStart: number
  recent: RecentSession[]
}

export type BoardRow = { userId: string; seconds: number; sessions: number; rank: number }

export type Board = {
  weekStart: number
  weekEnd: number
  timeZone: string
  joined: boolean
  rows: BoardRow[]
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function readStats(raw: unknown): LockInStats | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const days = Array.isArray(r.days) ? r.days.map(num) : []
  while (days.length < 7) days.push(0)
  return {
    todaySeconds: num(r.today_seconds),
    weekSeconds: num(r.week_seconds),
    allSeconds: num(r.all_seconds),
    sessions: num(r.sessions),
    days: days.slice(0, 7),
    self: r.self === true,
    board: r.board === true,
    live: r.live !== false,
    timeZone: typeof r.time_zone === 'string' ? r.time_zone : 'UTC',
    weekStart: Date.parse(String(r.week_start)),
    recent: Array.isArray(r.recent)
      ? r.recent.map((s: Record<string, unknown>) => ({
          id: String(s.id),
          startedAt: Date.parse(String(s.started_at)),
          endedAt: Date.parse(String(s.ended_at)),
          seconds: num(s.worked_seconds),
          focus: typeof s.focus === 'string' ? s.focus : null,
          note: typeof s.note === 'string' ? s.note : null,
        }))
      : [],
  }
}

export function readBoard(raw: unknown): Board | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    weekStart: Date.parse(String(r.week_start)),
    weekEnd: Date.parse(String(r.week_end)),
    timeZone: typeof r.time_zone === 'string' ? r.time_zone : 'UTC',
    joined: r.joined === true,
    rows: Array.isArray(r.rows)
      ? r.rows.map((row: Record<string, unknown>) => ({
          userId: String(row.user_id),
          seconds: num(row.seconds),
          sessions: num(row.sessions),
          rank: num(row.rank),
        }))
      : [],
  }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// 0 = Monday, in the given time zone.
export function dayIndex(timeZone: string, at = Date.now()): number {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at)
  return Math.max(0, WEEKDAYS.indexOf(day))
}

// Your own numbers with the session that's running right now added in. It
// lands on today, like it will once you end it.
export function withRunning(stats: LockInStats, runningMs: number, at = Date.now()): LockInStats {
  const extra = Math.max(0, Math.floor(runningMs / 1000))
  if (!extra) return stats
  const days = [...stats.days]
  days[dayIndex(stats.timeZone, at)] += extra
  return {
    ...stats,
    todaySeconds: stats.todaySeconds + extra,
    weekSeconds: stats.weekSeconds + extra,
    allSeconds: stats.allSeconds + extra,
    days,
  }
}

// "0m", "42m", "2h 05m"; past 100 hours just "124h".
export function hours(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60))
  const h = Math.floor(minutes / 60)
  if (!h) return `${minutes}m`
  if (h >= 100) return `${h}h`
  return `${h}h ${String(minutes % 60).padStart(2, '0')}m`
}

// "Oct 19 – 25", or "Sep 28 – Oct 4" across a month. `end` is exclusive.
export function weekRange(start: number, end: number, timeZone: string): string {
  const last = end - 1
  const month = (t: number) => new Intl.DateTimeFormat('en-US', { timeZone, month: 'short' }).format(t)
  const day = (t: number) => new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(t)
  return month(start) === month(last)
    ? `${month(start)} ${day(start)} – ${day(last)}`
    : `${month(start)} ${day(start)} – ${month(last)} ${day(last)}`
}

// 'America/Chicago' -> 'Chicago'.
export function zoneCity(timeZone: string): string {
  const city = timeZone.split('/').pop() ?? timeZone
  return city.replace(/_/g, ' ')
}

// Bar length relative to the top of the board; anything above zero is visible.
export function share(seconds: number, top: number): number {
  if (seconds <= 0 || top <= 0) return 0
  return Math.max(0.04, Math.min(1, seconds / top))
}

export const NOTE_MAX = 280
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
