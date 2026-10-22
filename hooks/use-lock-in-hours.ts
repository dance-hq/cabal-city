'use client'

import useSWR, { type ScopedMutator } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { readBoard, readStats } from '@/lib/lock-in-hours'

// Someone else's numbers, or yours when `userId` is null. Null data = they
// don't share them.
export function useLockInStats(communityId: string, userId: string | null, enabled = true) {
  return useSWR(
    enabled ? ['lock-in-stats', communityId, userId ?? 'me'] : null,
    async () => {
      const { data, error } = await createClient().rpc('lock_in_stats', {
        p_community: communityId,
        p_user: userId,
      })
      if (error) throw error
      return readStats(data)
    },
    { refreshInterval: 5 * 60_000, keepPreviousData: true },
  )
}

export function useLockInBoard(communityId: string, weeksAgo = 0, enabled = true) {
  return useSWR(
    enabled ? ['lock-in-board', communityId, weeksAgo] : null,
    async () => {
      const { data, error } = await createClient().rpc('lock_in_board', {
        p_community: communityId,
        p_weeks_ago: weeksAgo,
      })
      if (error) throw error
      return readBoard(data)
    },
    { refreshInterval: 2 * 60_000, keepPreviousData: true },
  )
}

// After a session ends or a setting changes, everything hours-related.
export function refreshLockInHours(mutate: ScopedMutator) {
  return mutate((key) => Array.isArray(key) && (key[0] === 'lock-in-stats' || key[0] === 'lock-in-board'))
}
