import { describe, expect, it } from 'vitest'
import { pickTeams } from '@/components/cabal/team-picks'
import { config, isMakersTeam } from '@/lib/config'
import type { TeamRoom } from '@/lib/types'

const room = (over: Partial<TeamRoom>): TeamRoom => ({
  id: over.name ?? 'x',
  name: 'Team',
  visibility: 'public',
  member_count: 2,
  joined: false,
  last_message_at: null,
  created_at: '2026-10-01T00:00:00Z',
  welcome: null,
  owner_ids: [],
  ...over,
})

describe('team picks', () => {
  it('puts the makers first, then teams with a welcome note, then the liveliest', () => {
    const picks = pickTeams([
      room({ name: 'Busy', last_message_at: '2026-10-21T10:00:00Z' }),
      room({ name: 'Quiet', welcome: 'We build robots.', last_message_at: '2026-10-02T00:00:00Z' }),
      room({ name: config.makersTeam, last_message_at: '2026-10-03T00:00:00Z' }),
      room({ name: 'Old', last_message_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(picks.map((p) => p.name)).toEqual([config.makersTeam, 'Quiet', 'Busy'])
  })

  it('never suggests teams you are on or invite-only teams', () => {
    const picks = pickTeams([
      room({ name: 'Mine', joined: true }),
      room({ name: 'Secret', visibility: 'private' }),
      room({ name: 'Open' }),
    ])
    expect(picks.map((p) => p.name)).toEqual(['Open'])
  })

  it('matches the makers team by name, ignoring case and spacing', () => {
    expect(isMakersTeam(` ${config.makersTeam.toUpperCase()} `)).toBe(true)
    expect(isMakersTeam('Someone else')).toBe(false)
    expect(isMakersTeam(null)).toBe(false)
  })
})
