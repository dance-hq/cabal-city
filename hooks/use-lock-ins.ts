'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

export type LockedIn = { focus: string | null; startedAt: number }

export const lockInsKey = (communityId: string) => ['lock-ins', communityId] as const

type Row = { user_id: string; focus: string | null; running_since: string; worked_seconds: number; server_now: string }

// Who's locked in right now and chose to show it, keyed by user id.
export function useLockIns(communityId: string) {
  const { data } = useSWR(
    lockInsKey(communityId),
    async () => {
      const { data, error } = await createClient().rpc('community_lock_ins', { p_community: communityId })
      if (error) throw error
      return { rows: (data ?? []) as Row[], receivedAt: Date.now() }
    },
    { refreshInterval: 30_000 },
  )
  return useMemo(() => {
    const map = new Map<string, LockedIn>()
    for (const r of data?.rows ?? []) {
      const skew = data!.receivedAt - Date.parse(r.server_now)
      map.set(r.user_id, { focus: r.focus, startedAt: Date.parse(r.running_since) + skew - r.worked_seconds * 1000 })
    }
    return map
  }, [data])
}
