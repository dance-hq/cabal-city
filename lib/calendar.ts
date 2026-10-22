export type CalendarEvent = {
  id: string
  title: string
  host: string | null
  starts_at: string
  ends_at: string | null
  venue: string
  url: string | null
  summary: string | null
  time_zone: string
}

export type PendingEvent = CalendarEvent & { submitted_by: string | null; created_at: string }

// Every Cabal event is in Chicago, so a venue that only names the city adds
// nothing on screen. It stays in the saved event for calendar files and shares.
const CITY_ONLY = /^\s*chicago\s*(,?\s*(il|illinois)\.?)?\s*$/i

export function place(venue: string): string | null {
  return CITY_ONLY.test(venue) ? null : venue.trim() || null
}

// Events without an end time are treated as this long.
export const DEFAULT_LENGTH_MS = 3 * 60 * 60 * 1000

export function endOf(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>): number {
  return e.ends_at ? Date.parse(e.ends_at) : Date.parse(e.starts_at) + DEFAULT_LENGTH_MS
}

export function happeningNow(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, now = Date.now()): boolean {
  return Date.parse(e.starts_at) <= now && now < endOf(e)
}

// YYYY-MM-DD of an instant, as seen in a time zone.
export function dayKey(at: number | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(at),
  )
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function dayLabel(key: string, timeZone: string, now = Date.now()): { lead: string | null; date: string } {
  const today = dayKey(now, timeZone)
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: y === Number(today.slice(0, 4)) ? undefined : 'numeric',
    timeZone: 'UTC',
  })
  const lead = key === today ? 'Today' : key === addDays(today, 1) ? 'Tomorrow' : null
  return { lead, date }
}

export function clock(at: string, timeZone: string): string {
  return new Date(at)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    .replace(':00', '')
}

export function timeRange(e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'time_zone'>): string {
  const start = clock(e.starts_at, e.time_zone)
  if (!e.ends_at) return start
  const end = clock(e.ends_at, e.time_zone)
  if (dayKey(e.ends_at, e.time_zone) === dayKey(e.starts_at, e.time_zone)) return `${start} – ${end}`
  const endDay = dayLabel(dayKey(e.ends_at, e.time_zone), e.time_zone).date
  return `${start} – ${endDay}, ${end}`
}

// "America/Chicago" → "Chicago"
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
}

export function groupByDay(events: CalendarEvent[], now = Date.now()) {
  const groups: { key: string; events: CalendarEvent[] }[] = []
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    // Something that started earlier and is still going sits under today.
    const startKey = dayKey(e.starts_at, e.time_zone)
    const today = dayKey(now, e.time_zone)
    const key = startKey < today ? today : startKey
    const last = groups[groups.length - 1]
    if (last?.key === key) last.events.push(e)
    else groups.push({ key, events: [e] })
  }
  return groups
}

export function shareText(e: CalendarEvent, now = Date.now()): string {
  const { lead, date } = dayLabel(dayKey(e.starts_at, e.time_zone), e.time_zone, now)
  const when = `${lead ? `${lead}, ` : ''}${date}, ${timeRange(e)}`
  return `${e.title}: ${when} at ${e.venue}.${e.url ? ` ${e.url}` : ''}`
}

// Form fields (wall-clock in the community's zone) → values for the RPC.
// An end time earlier than the start means it runs past midnight.
export function toLocalRange(date: string, start: string, end: string): { starts: string; ends: string | null } {
  const starts = `${date}T${start}`
  if (!end) return { starts, ends: null }
  return { starts, ends: `${end > start ? date : addDays(date, 1)}T${end}` }
}

export function fromLocal(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  const [date, time = ''] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

function icsStamp(at: number): string {
  return new Date(at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}

export function toIcs(e: CalendarEvent, origin: string): string {
  const description = [e.summary, e.host ? `Hosted by ${e.host}` : null, e.url].filter(Boolean).join('\n')
  const host = (() => {
    try {
      return new URL(origin).hostname
    } catch {
      return 'cabal'
    }
  })()
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cabal//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@${host}`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(Date.parse(e.starts_at))}`,
    `DTEND:${icsStamp(endOf(e))}`,
    `SUMMARY:${icsText(e.title)}`,
    `LOCATION:${icsText(e.venue)}`,
    description ? `DESCRIPTION:${icsText(description)}` : null,
    e.url ? `URL:${e.url}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}
