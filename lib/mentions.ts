import { personRef } from './text'
import type { Profile, ShownStatus } from './types'

export type Mentionable = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>

// What a person reads as in chat: their real name, falling back to the handle.
export function personName(p: Pick<Profile, 'username' | 'display_name'> | null | undefined): string {
  return p?.display_name?.trim() || p?.username || 'Former member'
}

// How a stored mention reads where only plain text fits (notifications, previews).
export function personLabel(lookup: (id: string) => Pick<Profile, 'username' | 'display_name'> | undefined) {
  return (userId: string) => `@${personName(lookup(userId))}`
}

// "@" right before the caret plus what you've typed so far. Not inside a word
// (so emails don't trigger it) and stops at a space.
export function mentionQuery(beforeCaret: string): { query: string; start: number } | null {
  const m = beforeCaret.match(/(^|[\s([{"'])@([^\s@<>]{0,40})$/)
  if (!m) return null
  return { query: m[2], start: beforeCaret.length - m[2].length - 1 }
}

const ONLINE: ReadonlySet<ShownStatus> = new Set<ShownStatus>(['online', 'away', 'dnd'])

// Matches the start of the real name, any word in it, or the @username.
// The person you're talking to comes first, then whoever's online, then A–Z.
export function matchPeople(
  people: readonly Mentionable[],
  query: string,
  opts: { excludeId?: string; firstId?: string | null; statusOf?: (id: string) => ShownStatus } = {},
  limit = 6,
): Mentionable[] {
  const q = query.toLowerCase()
  const scored: { p: Mentionable; score: number }[] = []
  for (const p of people) {
    if (p.id === opts.excludeId) continue
    const name = personName(p).toLowerCase()
    const handle = p.username?.toLowerCase() ?? ''
    let score: number
    if (!q) score = 2
    else if (name.startsWith(q) || handle.startsWith(q)) score = 0
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 1
    else if (name.includes(q) || handle.includes(q)) score = 2
    else continue
    const first = p.id === opts.firstId ? 0 : 1
    const online = opts.statusOf && ONLINE.has(opts.statusOf(p.id)) ? 0 : 1
    scored.push({ p, score: score * 4 + first * 2 + online })
  }
  return scored
    .sort((a, b) => a.score - b.score || personName(a.p).localeCompare(personName(b.p)))
    .slice(0, limit)
    .map((s) => s.p)
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Turns "@Ada Lovelace" (picked from the list) and "@ada" (typed) into stored
// <@id> mentions on send. `picked` (shown name → id) wins when two people share
// a name; otherwise a name only becomes a mention if it fits exactly one person.
// Usernames are unique, so a typed @username always resolves.
export function encodeMentions(body: string, picked: ReadonlyMap<string, string>, people: readonly Mentionable[]): string {
  const byName = new Map<string, string | null>()
  for (const p of people) {
    const name = p.display_name?.trim().toLowerCase()
    if (name) byName.set(name, byName.has(name) ? null : p.id)
  }
  for (const p of people) if (p.username) byName.set(p.username.toLowerCase(), p.id)
  for (const [name, id] of picked) byName.set(name.toLowerCase(), id)

  // Ambiguous names stay in the pattern (longest first) so "@Ada Lovelace" is
  // left as typed instead of "@Ada" being read as the username "ada".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length)
  if (!names.length) return body
  const pattern = new RegExp(`(^|[\\s([{"'])@(${names.map(escape).join('|')})(?![\\w-])`, 'gi')
  return body.replace(pattern, (match: string, lead: string, name: string) => {
    const id = byName.get(name.toLowerCase())
    return id ? `${lead}${personRef(id)}` : match
  })
}
