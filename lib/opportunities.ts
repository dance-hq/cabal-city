import type { Identity } from './identity'
import { SHIP_ZONE, zoneDay } from './board'

export type OpportunityKind = 'credits' | 'funding' | 'hackathon' | 'event'

export type Opportunity = {
  id: string
  community_id: string | null
  kind: OpportunityKind
  title: string
  provider: string | null
  summary: string
  eligibility: string | null
  place: string
  deadline: string | null
  url: string
  audiences: Identity[]
  verified_at: string
  saved: boolean
}

export const OPPORTUNITY_KINDS: { value: OpportunityKind; label: string; tab: string }[] = [
  { value: 'credits', label: 'Credits & software', tab: 'Credits' },
  { value: 'funding', label: 'Funding & accelerators', tab: 'Funding' },
  { value: 'hackathon', label: 'Hackathons & competitions', tab: 'Hackathons' },
  { value: 'event', label: 'Events & speaking', tab: 'Events' },
]

export const KIND_LABEL = Object.fromEntries(OPPORTUNITY_KINDS.map((k) => [k.value, k.label])) as Record<
  OpportunityKind,
  string
>

// After this long without a fresh look at the source, say so.
export const STALE_DAYS = 90

// Whole days between two YYYY-MM-DD dates.
export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((d) => {
    const [y, m, day] = d.split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  })
  return Math.round((b - a) / 86_400_000)
}

export function today(now = Date.now()): string {
  return zoneDay(now, SHIP_ZONE)
}

export function formatDay(date: string, now = Date.now()): string {
  const [y, m, d] = date.split('-').map(Number)
  const thisYear = Number(today(now).slice(0, 4))
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: y === thisYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })
}

export function deadlineLabel(deadline: string, now = Date.now()): { text: string; soon: boolean } {
  const left = daysBetween(today(now), deadline)
  if (left <= 0) return { text: 'Closes today', soon: true }
  if (left === 1) return { text: 'Closes tomorrow', soon: true }
  if (left <= 14) return { text: `Closes in ${left} days`, soon: left <= 7 }
  return { text: `Closes ${formatDay(deadline, now)}`, soon: false }
}

export function isStale(verifiedAt: string, now = Date.now()): boolean {
  return daysBetween(verifiedAt, today(now)) > STALE_DAYS
}

// A hint from your profile, never a promise: each program decides eligibility.
export function fitsYou(o: Pick<Opportunity, 'audiences'>, identity: Identity | null | undefined): boolean {
  return !!identity && o.audiences.includes(identity)
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function shareText(o: Pick<Opportunity, 'title' | 'summary' | 'url' | 'deadline'>, now = Date.now()): string {
  const when = o.deadline ? ` (${deadlineLabel(o.deadline, now).text.toLowerCase()})` : ''
  return `${o.title}${when}: ${o.summary} ${o.url}`
}

// Soonest deadline first, then programs that fit you, then the freshest checks.
export function arrangeOpportunities(list: Opportunity[], identity: Identity | null | undefined): Opportunity[] {
  return [...list].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline || b.deadline) return a.deadline ? -1 : 1
    const fit = Number(fitsYou(b, identity)) - Number(fitsYou(a, identity))
    return fit || b.verified_at.localeCompare(a.verified_at)
  })
}
