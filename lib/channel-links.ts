import { channelRef } from './text'
import type { TeamVisibility } from './types'

export type LinkableChannel = {
  id: string
  kind: 'room' | 'team'
  slug: string | null
  team_id: string | null
  team_name: string | null
  team_visibility: TeamVisibility | null
  joined: boolean
  member_count: number | null
  welcome: string | null
}

// What people type and see after the #: the room's slug, or the team's name.
export function channelName(c: Pick<LinkableChannel, 'kind' | 'slug' | 'team_name'>): string {
  return (c.kind === 'team' ? c.team_name : c.slug) ?? 'channel'
}

// How a channel link reads where only plain text fits (notifications, previews).
// Anything you can't see stays nameless.
export function linkLabel(channels: readonly { id: string; kind: string; slug: string | null; team_name: string | null }[]) {
  return (channelId: string) => {
    const c = channels.find((x) => x.id === channelId)
    return c && c.kind !== 'dm' ? `#${channelName(c as Pick<LinkableChannel, 'kind' | 'slug' | 'team_name'>)}` : '#private-channel'
  }
}

// "#" right before the caret, optionally followed by what you've typed so far.
// Not inside a word or a link (…/page#section), and stops at a space.
export function channelQuery(beforeCaret: string): { query: string; start: number } | null {
  const m = beforeCaret.match(/(^|[\s([{"'])#([^\s#<>]{0,40})$/)
  if (!m) return null
  return { query: m[2], start: beforeCaret.length - m[2].length - 1 }
}

export function matchChannels(list: LinkableChannel[], query: string, excludeId?: string, limit = 6): LinkableChannel[] {
  const q = query.toLowerCase()
  const scored: { c: LinkableChannel; score: number }[] = []
  for (const c of list) {
    if (c.id === excludeId) continue
    const name = channelName(c).toLowerCase()
    let score: number
    if (!q) score = 2
    else if (name.startsWith(q)) score = 0
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) score = 1
    else if (name.includes(q)) score = 2
    else continue
    scored.push({ c, score: score * 4 + (c.joined ? 0 : 2) + (c.kind === 'room' ? 0 : 1) })
  }
  return scored
    .sort((a, b) => a.score - b.score || channelName(a.c).localeCompare(channelName(b.c)))
    .slice(0, limit)
    .map((s) => s.c)
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Turns "#cabal-chat" and "#Dance Technologies" into stored links on send.
// `picked` (name → id) comes from the suggestions you chose, so it wins when
// two teams share a name. Otherwise only names that match exactly one channel
// become links; anything else stays as you typed it.
export function encodeChannelLinks(body: string, picked: ReadonlyMap<string, string>, list: LinkableChannel[]): string {
  const byName = new Map<string, string | null>()
  for (const c of list) {
    const key = channelName(c).toLowerCase()
    byName.set(key, byName.has(key) ? null : c.id)
  }
  for (const [name, id] of picked) byName.set(name.toLowerCase(), id)

  const names = [...byName.entries()].filter((e): e is [string, string] => !!e[1]).sort((a, b) => b[0].length - a[0].length)
  if (!names.length) return body
  const pattern = new RegExp(`(^|[\\s([{"'])#(${names.map(([n]) => escape(n)).join('|')})(?![\\w-])`, 'gi')
  return body.replace(pattern, (_, lead: string, name: string) => `${lead}${channelRef(byName.get(name.toLowerCase())!)}`)
}
