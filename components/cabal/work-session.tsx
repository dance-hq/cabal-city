'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { createClient } from '@/lib/supabase/client'
import { desktop } from '@/lib/desktop'
import { friendlyError } from '@/lib/errors'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { describeSession, NO_LOCK_IN, readAwayMs, readLockIn, type LockInState } from '@/lib/session'
import { lockInsKey } from '@/hooks/use-lock-ins'
import { refreshLockInHours } from '@/hooks/use-lock-in-hours'
import { LockInNoteDialog } from './lock-in-note'
import { useCabal } from './store'

// Locking in is separate from being in Cabal: opening the app never starts
// or asks for a session. The clock runs while Cabal is open, minimized or
// behind other apps; a session that stopped because Cabal was closed or the
// computer slept picks back up on its own when Cabal is open again (the
// server closes it after 3 hours away, and any session at 8 hours).
type WorkSession = LockInState & {
  ready: boolean
  // Set briefly after the session picked back up, so the bar can say how
  // long you were away (that time didn't count).
  awayMs: number | null
  dismissAway(): void
  lockIn(): Promise<boolean>
  pause(): Promise<void>
  resume(): Promise<void>
  end(): Promise<void>
  setFocus(focus: string): Promise<boolean>
  // Opens the "what did you get done?" note for a finished session.
  addNote(session: { id: string; seconds: number; note?: string | null }): void
}

type NoteTarget = { id: string; seconds: number; note: string | null }

const Ctx = createContext<WorkSession | null>(null)

export function useWorkSession() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useWorkSession must be used inside WorkSessionProvider')
  return s
}

// For things that also show in the desktop chat window, which has no session
// of its own (the main window runs it).
export function useWorkSessionIfAny() {
  return useContext(Ctx)
}

const BEAT_MS = 60_000
const AWAY_NOTE_MS = 5 * 60_000

export function WorkSessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const { community } = useCabal()
  const { mutate } = useSWRConfig()
  const [ready, setReady] = useState(false)
  const [state, setState] = useState<LockInState>(NO_LOCK_IN)
  const [awayMs, setAwayMs] = useState<number | null>(null)
  const [noteFor, setNoteFor] = useState<NoteTarget | null>(null)
  const live = useRef(state)
  live.current = state

  // Starting, pausing and ending tell everyone else's "Locked in now" (and,
  // when a session ends, the weekly board) to look again. The broadcast only
  // says "something changed"; what anyone sees still comes from the server.
  const room = useRef<RealtimeChannel | null>(null)
  useEffect(() => {
    const ch = supabase
      .channel(`lock-ins:${community.id}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, ({ payload }) => {
        void mutate(lockInsKey(community.id))
        if (payload?.ended) void refreshLockInHours(mutate)
      })
      .subscribe()
    room.current = ch
    return () => {
      room.current = null
      void supabase.removeChannel(ch)
    }
  }, [supabase, community.id, mutate])
  const announce = useCallback((ended = false) => {
    void room.current?.send({ type: 'broadcast', event: 'changed', payload: { ended } })
  }, [])

  // Every server answer goes through here; a picked-back-up session also
  // carries how long Cabal was away. A session that closed on its own (8
  // hours, or 3 hours away) comes back as nothing while we thought it was on.
  const take = useCallback(
    (raw: unknown) => {
      const next = readLockIn(raw)
      if (next.status === 'none' && live.current.status !== 'none') {
        toast('Your Lock in ended. The time it ran is saved.')
        void refreshLockInHours(mutate)
        announce(true)
      }
      setState(next)
      const away = readAwayMs(raw)
      if (away !== null) setAwayMs(away)
    },
    [mutate, announce],
  )

  useEffect(() => {
    if (awayMs === null) return
    const t = setTimeout(() => setAwayMs(null), AWAY_NOTE_MS)
    return () => clearTimeout(t)
  }, [awayMs])

  const apply = useCallback(
    (raw: unknown) => {
      take(raw)
      void mutate(lockInsKey(community.id))
      announce()
    },
    [take, mutate, community.id, announce],
  )

  const call = useCallback(
    async (fn: string, args?: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) {
        toast.error(friendlyError(error))
        return { ok: false as const }
      }
      apply(data)
      return { ok: true as const }
    },
    [supabase, apply],
  )

  useEffect(() => {
    let cancelled = false
    supabase.rpc('my_lock_in').then(({ data, error }) => {
      if (cancelled) return
      if (!error) take(data)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, take])

  // While a session is on, check in about once a minute. A gap of a few
  // minutes still counts; after a longer one (sleep, crash, closed tab) the
  // server leaves the gap out and the next check-in picks the session back up.
  const awaitingWake = state.status === 'paused' && state.pausedBy === 'away'
  const running = state.status === 'running' || awaitingWake
  useEffect(() => {
    if (!running) return
    const beat = () =>
      supabase.rpc('lock_in_beat').then(({ data, error }) => {
        if (!error) take(data)
      })
    if (awaitingWake) void beat()
    const t = setInterval(beat, BEAT_MS)
    const onVisible = () => document.visibilityState === 'visible' && beat()
    document.addEventListener('visibilitychange', onVisible)
    const offPower = desktop()?.onPower((s) => s === 'resume' && beat())
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      offPower?.()
    }
  }, [running, awaitingWake, supabase, take])

  // The desktop app draws the corner timer from this. Paused, it keeps the
  // corner up with the time frozen so it can be resumed from there (desktop
  // apps without setPausedSession just hide it).
  useEffect(() => {
    const d = desktop()
    if (state.status === 'paused' && d?.setPausedSession) d.setPausedSession(state.workedMs)
    else d?.setSession?.(state.status === 'running' ? state.startedAt : null)
  }, [state.status, state.startedAt, state.workedMs])
  useEffect(() => () => desktop()?.setSession?.(null), [])

  // Quitting the desktop app stops the clock, so the time it's closed doesn't
  // count; reopening picks the session back up. The app waits for this
  // (briefly) before it quits.
  const token = useRef<string | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => (token.current = data.session?.access_token ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      token.current = session?.access_token ?? null
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase])
  useEffect(() => {
    const off = desktop()?.onBeforeQuit(async () => {
      if (live.current.status !== 'running' || !token.current) return
      const pause = fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/pause_lock_in`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          authorization: `Bearer ${token.current}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_away: true }),
      }).catch(() => {})
      await Promise.race([pause, new Promise((r) => setTimeout(r, 1500))])
    })
    return () => off?.()
  }, [])

  // One tap, no form. What you're on is optional and added afterwards; who
  // sees the session is your "Show me in Locked in now" setting.
  const lockIn = useCallback(async () => (await call('lock_in', { p_focus: null, p_shared: true })).ok, [call])
  const pause = useCallback(async () => void (await call('pause_lock_in')), [call])
  const resume = useCallback(async () => void (await call('resume_lock_in')), [call])
  const setFocus = useCallback(
    async (focus: string) => (await call('edit_lock_in', { p_focus: focus, p_shared: true })).ok,
    [call],
  )

  const addNote = useCallback(
    (s: { id: string; seconds: number; note?: string | null }) => setNoteFor({ id: s.id, seconds: s.seconds, note: s.note ?? null }),
    [],
  )

  const end = useCallback(async () => {
    const { data, error } = await supabase.rpc('finish_lock_in')
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    setState(NO_LOCK_IN)
    setAwayMs(null)
    void mutate(lockInsKey(community.id))
    void refreshLockInHours(mutate)
    announce(true)
    const done = data as { id: string; worked_seconds: number } | null
    if (!done) return
    const seconds = done.worked_seconds
    toast(`Locked in for ${describeSession(seconds * 1000)}.`, {
      description: seconds < 60 ? 'Sessions under a minute aren’t counted.' : undefined,
      action: seconds >= 60 ? { label: 'Add a note', onClick: () => addNote({ id: done.id, seconds }) } : undefined,
      duration: 8000,
    })
  }, [supabase, mutate, community.id, announce, addNote])

  const dismissAway = useCallback(() => setAwayMs(null), [])

  const value = useMemo(
    () => ({ ...state, ready, awayMs, dismissAway, lockIn, pause, resume, end, setFocus, addNote }),
    [state, ready, awayMs, dismissAway, lockIn, pause, resume, end, setFocus, addNote],
  )
  return (
    <Ctx.Provider value={value}>
      {children}
      <LockInNoteDialog
        target={noteFor}
        onClose={() => setNoteFor(null)}
        onSaved={() => void refreshLockInHours(mutate)}
      />
    </Ctx.Provider>
  )
}

// Ticks every second while the timer runs.
export function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt === null ? 0 : now - startedAt
}
