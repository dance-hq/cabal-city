'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { useCabal } from '@/components/cabal/store'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import {
  GROUP_LIMIT,
  cleanGroupName,
  nextGroupPosition,
  type BuddyGroup,
  type BuddyPlacement,
} from '@/lib/buddy-groups'

type Data = { groups: BuddyGroup[]; placements: BuddyPlacement[] }
const EMPTY: Data = { groups: [], placements: [] }

async function load([, communityId, userId]: readonly [string, string, string]): Promise<Data> {
  const db = createClient()
  const [groups, placements] = await Promise.all([
    db
      .from('buddy_groups')
      .select('id, name, position, collapsed')
      .eq('owner_id', userId)
      .eq('community_id', communityId)
      .order('position'),
    db.from('buddy_group_members').select('member_id, group_id').eq('owner_id', userId).eq('community_id', communityId),
  ])
  if (groups.error) throw groups.error
  if (placements.error) throw placements.error
  return { groups: groups.data ?? [], placements: placements.data ?? [] }
}

// Your private buddy-list groups. Changes show at once and are put back if saving fails.
export function useBuddyGroups() {
  const { community, userId } = useCabal()
  const swr = useSWR(['buddy-groups', community.id, userId] as const, load, { keepPreviousData: true })
  const data = swr.data ?? EMPTY
  const { mutate } = swr

  const change = useCallback(
    async (optimistic: (d: Data) => Data, save: () => PromiseLike<{ error: unknown }>) => {
      await mutate((d) => optimistic(d ?? EMPTY), { revalidate: false })
      const { error } = await save()
      if (error) toast.error(friendlyError(error))
      await mutate()
      return !error
    },
    [mutate],
  )

  const moveTo = useCallback(
    (memberId: string, groupId: string | null) => {
      const db = createClient()
      return change(
        (d) => ({
          ...d,
          placements: [
            ...d.placements.filter((p) => p.member_id !== memberId),
            ...(groupId ? [{ member_id: memberId, group_id: groupId }] : []),
          ],
        }),
        () =>
          groupId
            ? db
                .from('buddy_group_members')
                .upsert(
                  { owner_id: userId, community_id: community.id, member_id: memberId, group_id: groupId },
                  { onConflict: 'owner_id,community_id,member_id' },
                )
            : db
                .from('buddy_group_members')
                .delete()
                .eq('owner_id', userId)
                .eq('community_id', community.id)
                .eq('member_id', memberId),
      )
    },
    [change, userId, community.id],
  )

  const createGroup = useCallback(
    async (raw: string, memberId?: string | null) => {
      const name = cleanGroupName(raw)
      const current = swr.data ?? EMPTY
      if (!name) return null
      if (current.groups.length >= GROUP_LIMIT) {
        toast.error(`You can have up to ${GROUP_LIMIT} groups.`)
        return null
      }
      const id = crypto.randomUUID()
      const position = nextGroupPosition(current.groups)
      const db = createClient()
      const ok = await change(
        (d) => ({
          groups: [...d.groups, { id, name, position, collapsed: false }],
          placements: memberId
            ? [...d.placements.filter((p) => p.member_id !== memberId), { member_id: memberId, group_id: id }]
            : d.placements,
        }),
        async () => {
          const made = await db
            .from('buddy_groups')
            .insert({ id, owner_id: userId, community_id: community.id, name, position })
          if (made.error || !memberId) return made
          return db
            .from('buddy_group_members')
            .upsert(
              { owner_id: userId, community_id: community.id, member_id: memberId, group_id: id },
              { onConflict: 'owner_id,community_id,member_id' },
            )
        },
      )
      return ok ? id : null
    },
    [change, swr.data, userId, community.id],
  )

  const renameGroup = useCallback(
    (groupId: string, raw: string) => {
      const name = cleanGroupName(raw)
      if (!name) return Promise.resolve(false)
      return change(
        (d) => ({ ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) }),
        () => createClient().from('buddy_groups').update({ name }).eq('id', groupId).eq('owner_id', userId),
      )
    },
    [change, userId],
  )

  const deleteGroup = useCallback(
    (groupId: string) =>
      change(
        (d) => ({
          groups: d.groups.filter((g) => g.id !== groupId),
          placements: d.placements.filter((p) => p.group_id !== groupId),
        }),
        () => createClient().from('buddy_groups').delete().eq('id', groupId).eq('owner_id', userId),
      ),
    [change, userId],
  )

  const setCollapsed = useCallback(
    (groupId: string, collapsed: boolean) =>
      change(
        (d) => ({ ...d, groups: d.groups.map((g) => (g.id === groupId ? { ...g, collapsed } : g)) }),
        () => createClient().from('buddy_groups').update({ collapsed }).eq('id', groupId).eq('owner_id', userId),
      ),
    [change, userId],
  )

  return {
    groups: data.groups,
    placements: data.placements,
    loading: swr.isLoading,
    moveTo,
    createGroup,
    renameGroup,
    deleteGroup,
    setCollapsed,
  }
}
