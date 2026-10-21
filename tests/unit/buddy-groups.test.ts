import { describe, expect, it } from 'vitest'
import { arrangeBuddies, cleanGroupName, nextGroupPosition, type BuddyGroup } from '@/lib/buddy-groups'
import type { ShownStatus } from '@/lib/types'

const person = (user_id: string, status: ShownStatus, name = user_id) => ({ user_id, status, name })
const group = (id: string, position: number, name = id): BuddyGroup => ({ id, name, position, collapsed: false })

describe('arrangeBuddies', () => {
  it('puts grouped people who are around in their group and everyone else in Here now', () => {
    const out = arrangeBuddies(
      [person('ana', 'online'), person('bo', 'online'), person('cy', 'away')],
      [group('g1', 0)],
      [{ member_id: 'ana', group_id: 'g1' }],
    )
    expect(out.groups[0].online.map((p) => p.user_id)).toEqual(['ana'])
    expect(out.here.map((p) => p.user_id)).toEqual(['bo', 'cy'])
    expect(out.offline).toEqual([])
  })

  it('counts offline group members in the total but lists them with Offline', () => {
    const out = arrangeBuddies(
      [person('ana', 'offline'), person('bo', 'online')],
      [group('g1', 0)],
      [
        { member_id: 'ana', group_id: 'g1' },
        { member_id: 'bo', group_id: 'g1' },
      ],
    )
    expect(out.groups[0].total).toBe(2)
    expect(out.groups[0].online.map((p) => p.user_id)).toEqual(['bo'])
    expect(out.offline.map((p) => p.user_id)).toEqual(['ana'])
  })

  it('keeps empty groups and orders groups by position', () => {
    const out = arrangeBuddies([], [group('late', 2), group('early', 0)], [])
    expect(out.groups.map((g) => g.group.id)).toEqual(['early', 'late'])
    expect(out.groups.every((g) => g.total === 0)).toBe(true)
  })

  it('ignores placements in groups that no longer exist', () => {
    const out = arrangeBuddies([person('ana', 'online')], [], [{ member_id: 'ana', group_id: 'gone' }])
    expect(out.here.map((p) => p.user_id)).toEqual(['ana'])
  })

  it('sorts within each section with the given comparison', () => {
    const out = arrangeBuddies(
      [person('b', 'online', 'Bea'), person('a', 'online', 'Ann')],
      [],
      [],
      (x, y) => y.name.localeCompare(x.name),
    )
    expect(out.here.map((p) => p.name)).toEqual(['Bea', 'Ann'])
  })
})

describe('group names', () => {
  it('trims, squashes spaces and caps the length', () => {
    expect(cleanGroupName('  Night   owls ')).toBe('Night owls')
    expect(cleanGroupName('   ')).toBeNull()
    expect(cleanGroupName('x'.repeat(80))).toHaveLength(40)
  })

  it('adds new groups after the last one', () => {
    expect(nextGroupPosition([])).toBe(0)
    expect(nextGroupPosition([group('a', 0), group('b', 4)])).toBe(5)
  })
})
