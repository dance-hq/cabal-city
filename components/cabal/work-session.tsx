'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { desktop } from '@/lib/desktop'
import { friendlyError } from '@/lib/errors'
import { formatSession } from '@/lib/session'

// loading: checking for a running session. welcome: the calm start screen.
// app: Cabal itself, with or without a session running.
export type SessionPhase = 'loading' | 'welcome' | 'app'

type WorkSession = {
  phase: SessionPhase
  startedAt: number | null
  start(): Promise<boolean>
  end(): Promise<void>
  skip(): void
}

const Ctx = createContext<WorkSession | null>(null)

export function useWorkSession() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useWorkSession must be used inside WorkSessionProvider')
  return s
}

export function WorkSessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [phase, setPhase] = useState<SessionPhase>('loading')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const running = useRef<number | null>(null)
  running.current = startedAt

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.rpc('current_work_session')
      if (cancelled) return
      if (error) {
        // Never lock someone out of Cabal because the session check failed.
        setPhase('app')
        return
      }
      let start = typeof data === 'string' ? Date.parse(data) : null
      const launchedAt = desktop()?.launchedAt
      if (start !== null && launchedAt && start < launchedAt) {
        // Still open from before the desktop app last quit (or crashed): that sitting is over.
        await supabase.rpc('end_work_session')
        start = null
      }
      if (cancelled) return
      setStartedAt(start)
      setPhase(start === null ? 'welcome' : 'app')
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // The desktop app draws the corner timer from this.
  useEffect(() => {
    desktop()?.setSession?.(startedAt)
  }, [startedAt])
  useEffect(() => () => desktop()?.setSession?.(null), [])

  // Quitting the desktop app ends the session. Fired with keepalive so it
  // still goes out while the app closes.
  const token = useRef<string | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => (token.current = data.session?.access_token ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      token.current = session?.access_token ?? null
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])
  useEffect(() => {
    const off = desktop()?.onBeforeQuit(() => {
      if (running.current === null || !token.current) return
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/end_work_session`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          authorization: `Bearer ${token.current}`,
          'content-type': 'application/json',
        },
        body: '{}',
      }).catch(() => {})
    })
    return () => off?.()
  }, [])

  const start = useCallback(async () => {
    const { data, error } = await supabase.rpc('start_work_session')
    if (error || typeof data !== 'string') {
      toast.error(error ? friendlyError(error) : "Couldn't start your session. Try again.")
      return false
    }
    setStartedAt(Date.parse(data))
    setPhase('app')
    return true
  }, [supabase])

  const end = useCallback(async () => {
    const began = running.current
    const { error } = await supabase.rpc('end_work_session')
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    setStartedAt(null)
    if (began !== null) toast(`Session done: ${formatSession(Date.now() - began)}. Nice work.`)
  }, [supabase])

  const skip = useCallback(() => setPhase('app'), [])

  const value = useMemo(() => ({ phase, startedAt, start, end, skip }), [phase, startedAt, start, end, skip])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Re-renders about every ten seconds, enough for a minutes clock.
export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt === null ? 0 : now - startedAt
}
