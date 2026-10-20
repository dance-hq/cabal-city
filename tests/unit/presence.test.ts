import { describe, expect, it } from 'vitest'
import { compareByPresence, foldPresence, statusOf } from '@/lib/presence'
import { PRESENCE_TTL_MS } from '@/lib/config'
import type { PresenceSession } from '@/lib/types'

const now = Date.parse('2026-10-20T12:00:00Z')
const session = (over: Partial<PresenceSession>): PresenceSession => ({
  id: crypto.randomUUID(),
  user_id: 'u1',
  community_id: 'c1',
  availability: 'online',
  room_id: null,
  last_seen: new Date(now - 1000).toISOString(),
  ...over,
})

describe('foldPresence', () => {
  it('drops sessions older than the TTL (sleep, lost Wi-Fi, crash)', () => {
    const map = foldPresence([session({ last_seen: new Date(now - PRESENCE_TTL_MS - 1).toISOString() })], now)
    expect(statusOf(map, 'u1')).toBe('offline')
  })

  it('counts several sessions once and keeps the most available status', () => {
    const map = foldPresence([session({ availability: 'away' }), session({ availability: 'online' })], now)
    expect(map.size).toBe(1)
    expect(statusOf(map, 'u1')).toBe('online')
  })

  it('respects do-not-disturb from any session', () => {
    const map = foldPresence([session({ availability: 'online' }), session({ availability: 'dnd' })], now)
    expect(statusOf(map, 'u1')).toBe('dnd')
  })

  it('collects the rooms someone is sitting in', () => {
    const map = foldPresence([session({ room_id: 'lobby' }), session({ room_id: 'intro' })], now)
    expect([...map.get('u1')!.rooms].sort()).toEqual(['intro', 'lobby'])
  })
})

describe('compareByPresence', () => {
  it('sorts online first, then dnd, away, offline, then by name', () => {
    const people = [
      { status: 'offline' as const, name: 'Al' },
      { status: 'away' as const, name: 'Bo' },
      { status: 'online' as const, name: 'zed' },
      { status: 'online' as const, name: 'Amy' },
      { status: 'dnd' as const, name: 'Cy' },
    ]
    expect(people.sort(compareByPresence).map((p) => p.name)).toEqual(['Amy', 'zed', 'Cy', 'Bo', 'Al'])
  })
})
