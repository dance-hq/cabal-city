import { PRESENCE_TTL_MS } from '@/lib/config'
import type { PresenceSession, ShownStatus } from '@/lib/types'

export type UserPresence = { status: ShownStatus; rooms: Set<string> }

const RANK: Record<string, number> = { online: 3, dnd: 2, away: 1 }

// Folds every live session into one status per person. Several sessions
// (laptop + browser tab) count once; the "most available" one wins, except
// that do-not-disturb on any session is respected over online.
export function foldPresence(sessions: PresenceSession[], now: number): Map<string, UserPresence> {
  const out = new Map<string, UserPresence>()
  for (const s of sessions) {
    if (now - new Date(s.last_seen).getTime() > PRESENCE_TTL_MS) continue
    const current = out.get(s.user_id)
    if (!current) {
      out.set(s.user_id, { status: s.availability, rooms: new Set(s.room_id ? [s.room_id] : []) })
      continue
    }
    if (s.room_id) current.rooms.add(s.room_id)
    const a = current.status
    const b = s.availability
    if (a === 'dnd' || b === 'dnd') current.status = 'dnd'
    else if ((RANK[b] ?? 0) > (RANK[a] ?? 0)) current.status = b
  }
  return out
}

export function statusOf(map: Map<string, UserPresence>, userId: string): ShownStatus {
  return map.get(userId)?.status ?? 'offline'
}

const ORDER: Record<ShownStatus, number> = { online: 0, dnd: 1, away: 2, offline: 3 }
export function compareByPresence(a: { status: ShownStatus; name: string }, b: { status: ShownStatus; name: string }) {
  return ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}
