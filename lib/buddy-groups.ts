import { compareByPresence } from './presence'
import type { ShownStatus } from './types'

export const GROUP_NAME_MAX = 40
export const GROUP_LIMIT = 30

export type BuddyGroup = { id: string; name: string; position: number; collapsed: boolean }
export type BuddyPlacement = { member_id: string; group_id: string }

type Person = { user_id: string; name: string; status: ShownStatus }

export type ArrangedGroup<T> = { group: BuddyGroup; online: T[]; total: number }
export type ArrangedBuddies<T> = { groups: ArrangedGroup<T>[]; here: T[]; offline: T[] }

// AIM-style: each of your groups lists who in it is around ("2/5"), anyone
// around you haven't grouped is in Here now, and everybody offline waits at
// the bottom together.
export function arrangeBuddies<T extends Person>(
  people: T[],
  groups: BuddyGroup[],
  placements: BuddyPlacement[],
  compare: (a: T, b: T) => number = compareByPresence,
): ArrangedBuddies<T> {
  const ordered = [...groups].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const slots = new Map(ordered.map((group) => [group.id, { group, online: [] as T[], total: 0 }]))
  const groupOf = new Map<string, string>()
  for (const p of placements) if (slots.has(p.group_id)) groupOf.set(p.member_id, p.group_id)

  const here: T[] = []
  const offline: T[] = []
  for (const person of people) {
    const slot = slots.get(groupOf.get(person.user_id) ?? '')
    if (slot) slot.total += 1
    if (person.status === 'offline') offline.push(person)
    else if (slot) slot.online.push(person)
    else here.push(person)
  }
  for (const slot of slots.values()) slot.online.sort(compare)
  here.sort(compare)
  offline.sort(compare)
  return { groups: [...slots.values()], here, offline }
}

export function cleanGroupName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, GROUP_NAME_MAX).trim()
  return name || null
}

export function nextGroupPosition(groups: BuddyGroup[]): number {
  return groups.reduce((max, g) => Math.max(max, g.position), -1) + 1
}

// What the desktop corner list gets: just enough to draw names and dots.
export type OverlayPerson = {
  id: string
  name: string
  status: ShownStatus
  note: string | null
  unread: number
  group: string | null
}
export type OverlayGroup = { id: string; name: string; collapsed: boolean; total: number; people: OverlayPerson[] }
export type OverlayBuddies = { groups: OverlayGroup[]; here: OverlayPerson[]; offline: OverlayPerson[] }

// What the corner list can ask for. The desktop app checks the shape; the page
// checks it again against your real list before doing anything.
export type BuddyAction =
  | { type: 'open-dm'; userId: string }
  | { type: 'move'; userId: string; groupId: string | null }
  | { type: 'create-group'; name: string; userId: string | null }
  | { type: 'rename-group'; groupId: string; name: string }
  | { type: 'delete-group'; groupId: string }
  | { type: 'collapse-group'; groupId: string; collapsed: boolean }
