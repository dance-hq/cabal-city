'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { MESSAGE_COLUMNS, messagesKey, useCabal } from '@/components/cabal/store'
import type { Message } from '@/lib/types'

const PAGE = 80

async function fetchPage(channelId: string, before?: string) {
  let q = createClient()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(PAGE)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw error
  return (data as Message[]).reverse()
}

// The newest page lives in SWR (realtime appends to it, reconnects refetch
// it). Older pages are loaded on request and kept locally.
export function useMessages(channelId: string) {
  const { outbox } = useCabal()
  const { data, error, isLoading, mutate } = useSWR(messagesKey(channelId), ([, id]) => fetchPage(id))
  const [older, setOlder] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)

  useEffect(() => {
    setOlder([])
    setHasMore(true)
  }, [channelId])

  useEffect(() => {
    if (data && data.length < PAGE && older.length === 0) setHasMore(false)
  }, [data, older.length])

  const loadOlder = useCallback(async () => {
    const oldest = older[0] ?? data?.[0]
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await fetchPage(channelId, oldest.created_at)
      setOlder((o) => [...page, ...o])
      if (page.length < PAGE) setHasMore(false)
    } finally {
      setLoadingOlder(false)
    }
  }, [older, data, loadingOlder, channelId])

  const messages = useMemo(() => {
    const seen = new Set<string>()
    const all: Message[] = []
    for (const m of [...older, ...(data ?? [])]) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      all.push(m)
    }
    for (const m of outbox[channelId] ?? []) if (!seen.has(m.id)) all.push(m)
    return all
  }, [older, data, outbox, channelId])

  return { messages, error, isLoading, retry: () => mutate(), loadOlder, hasMore, loadingOlder }
}
