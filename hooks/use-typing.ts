'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

const SHOW_MS = 4000
const SEND_EVERY_MS = 2500

// Typing indicators ride a private broadcast channel ("chan:<id>"). The
// database policy on realtime.messages only lets people who can read the
// conversation join it. Nothing is stored.
export function useTyping(channelId: string, userId: string) {
  const [typers, setTypers] = useState<Record<string, number>>({})
  const channel = useRef<RealtimeChannel | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const supabase = createClient()
    let ch: RealtimeChannel | null = null
    let cancelled = false
    setTypers({})
    supabase.realtime.setAuth().finally(() => {
      if (cancelled) return
      ch = supabase
        .channel(`chan:${channelId}`, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const who = (payload as { user_id?: string; stop?: boolean }).user_id
          if (!who || who === userId) return
          setTypers((t) => {
            const next = { ...t }
            if ((payload as { stop?: boolean }).stop) delete next[who]
            else next[who] = Date.now()
            return next
          })
        })
        .subscribe()
      channel.current = ch
    })
    const sweep = setInterval(() => {
      setTypers((t) => {
        const now = Date.now()
        const entries = Object.entries(t).filter(([, at]) => now - at < SHOW_MS)
        return entries.length === Object.keys(t).length ? t : Object.fromEntries(entries)
      })
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(sweep)
      channel.current = null
      if (ch) void supabase.removeChannel(ch)
    }
  }, [channelId, userId])

  const ping = useCallback(() => {
    const now = Date.now()
    if (now - lastSent.current < SEND_EVERY_MS) return
    lastSent.current = now
    void channel.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } })
  }, [userId])

  const stop = useCallback(() => {
    if (!lastSent.current) return
    lastSent.current = 0
    void channel.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, stop: true } })
  }, [userId])

  return { typers: Object.keys(typers), ping, stop }
}
