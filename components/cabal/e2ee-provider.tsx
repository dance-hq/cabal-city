'use client'

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { E2eeSession } from '@/lib/e2ee/session'

type E2ee = ReturnType<E2eeSession['getSnapshot']> & {
  session: E2eeSession
  unlockOpen: boolean
  setUnlockOpen(open: boolean): void
  recoveryOpen: boolean
  setRecoveryOpen(open: boolean): void
}

const Ctx = createContext<E2ee | null>(null)

export function useE2ee() {
  const e = useContext(Ctx)
  if (!e) throw new Error('useE2ee must be used inside E2eeProvider')
  return e
}

export const requestsKey = (userId: string) => ['e2ee-requests', userId] as const

export function E2eeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [session] = useState(() => new E2eeSession(createClient(), userId))
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { mutate } = useSWRConfig()
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  useEffect(() => {
    void session.start()
  }, [session])

  // A hiccup reaching the server on start: try again when the connection's back.
  useEffect(() => {
    if (snap.status !== 'error') return
    const retry = () => void session.start()
    const timer = setTimeout(retry, 15_000)
    window.addEventListener('online', retry)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', retry)
    }
  }, [snap.status, session])

  // This device's keys changed: open everything sealed again.
  useEffect(() => {
    if (snap.version === 0) return
    void mutate((key) => Array.isArray(key) && ['messages', 'home-latest', 'e2ee-peer'].includes(key[0]))
  }, [snap.version, mutate])

  useEffect(() => {
    if (snap.madeRecovery) setRecoveryOpen(true)
  }, [snap.madeRecovery, snap.recovery])

  // Another device asking to be unlocked shows up here straight away.
  useEffect(() => {
    if (snap.status !== 'ready') return
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    void supabase.realtime.setAuth().finally(() => {
      if (cancelled) return
      channel = supabase
        .channel(`e2ee:${userId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'e2ee_device_requests', filter: `user_id=eq.${userId}` },
          () => void mutate(requestsKey(userId)),
        )
        .subscribe()
    })
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [snap.status, userId, mutate])

  const value = useMemo(
    () => ({ ...snap, session, unlockOpen, setUnlockOpen, recoveryOpen, setRecoveryOpen }),
    [snap, session, unlockOpen, recoveryOpen],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
