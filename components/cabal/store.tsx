'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { HEARTBEAT_MS } from '@/lib/config'
import { desktop } from '@/lib/desktop'
import { friendlyError } from '@/lib/errors'
import { playChime, showNotification } from '@/lib/notify'
import { foldPresence, type UserPresence } from '@/lib/presence'
import { mentions } from '@/lib/text'
import type {
  Availability,
  Channel,
  Community,
  Message,
  PresenceSession,
  Profile,
  Settings,
  ShownStatus,
} from '@/lib/types'

export type Boot = {
  userId: string
  email: string
  profile: Profile
  settings: Settings
  community: Community
  role: 'member' | 'admin'
}

export type MemberRow = { user_id: string; role: 'member' | 'admin'; joined_at: string; profile: Profile }
export type InviteRow = {
  id: string
  team_id: string
  created_at: string
  team: { name: string } | null
  inviter: { display_name: string | null; username: string | null } | null
}
export type Connection = 'connecting' | 'live' | 'reconnecting' | 'offline'

type Store = {
  userId: string
  email: string
  community: Community
  isAdmin: boolean
  me: Profile
  settings: Settings
  setAvailability(a: Availability): Promise<void>
  updateSettings(patch: Partial<Omit<Settings, 'availability'>>): Promise<void>
  members: MemberRow[]
  membersLoading: boolean
  profileById(id: string | null | undefined): Profile | undefined
  presence: Map<string, UserPresence>
  statusOf(id: string): ShownStatus
  channels: Channel[]
  channelsLoading: boolean
  invites: InviteRow[]
  blocked: Set<string>
  connection: Connection
  active: string | null
  open(id: string | null): void
  openDm(userId: string): Promise<void>
  markRead(channelId: string): void
  outbox: Record<string, Message[]>
  send(channelId: string, body: string, retryId?: string): Promise<void>
  discard(channelId: string, id: string): void
  refreshChannels(): void
  refreshMembers(): void
  refreshInvites(): void
  refreshBlocks(): void
  profileOpen: string | null
  showProfile(id: string | null): void
  settingsOpen: boolean
  setSettingsOpen(open: boolean): void
}

const Ctx = createContext<Store | null>(null)

export function useCabal() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useCabal must be used inside CabalProvider')
  return s
}

export const messagesKey = (channelId: string) => ['messages', channelId] as const
export const MESSAGE_COLUMNS = 'id, channel_id, author_id, kind, body, created_at, deleted_at'

export function CabalProvider({ boot, children }: { boot: Boot; children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { userId, community } = boot

  const [settings, setSettings] = useState<Settings>(boot.settings)
  const [role, setRole] = useState(boot.role)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [active, setActive] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<Record<string, Message[]>>({})
  const [profileOpen, showProfile] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessions, setSessions] = useState<Map<string, PresenceSession>>(new Map())
  const [now, setNow] = useState(() => Date.now())

  // --- data -----------------------------------------------------------------

  const membersQuery = useSWR(['members', community.id], async () => {
    const { data, error } = await supabase
      .from('community_members')
      .select('user_id, role, joined_at, profile:profiles(id, username, display_name, avatar_url, company, bio, status_text)')
      .eq('community_id', community.id)
      .is('banned_at', null)
    if (error) throw error
    return (data as unknown as MemberRow[]).filter((m) => m.profile?.username)
  // Joins arrive live; leaves, bans and deleted accounts are picked up here.
  }, { refreshInterval: 120_000 })

  const channelsQuery = useSWR(['channels', community.id], async () => {
    const { data, error } = await supabase.rpc('my_channels', { p_community: community.id })
    if (error) throw error
    return data as Channel[]
  })

  const invitesQuery = useSWR(['invites', userId], async () => {
    const { data, error } = await supabase
      .from('team_invites')
      .select('id, team_id, created_at, team:teams(name), inviter:profiles!team_invites_invited_by_fkey(display_name, username)')
      .eq('user_id', userId)
      .order('created_at')
    if (error) throw error
    return data as unknown as InviteRow[]
  })

  const blocksQuery = useSWR(['blocks', userId], async () => {
    const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId)
    if (error) throw error
    return new Set((data ?? []).map((b) => b.blocked_id as string))
  })

  const loadPresence = useCallback(async () => {
    const { data } = await supabase
      .from('presence_sessions')
      .select('id, user_id, community_id, availability, room_id, last_seen')
      .eq('community_id', community.id)
    setSessions(new Map((data ?? []).map((s) => [s.id, s as PresenceSession])))
  }, [supabase, community.id])

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data])
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])
  const profiles = useMemo(() => new Map(members.map((m) => [m.user_id, m.profile])), [members])
  const me = profiles.get(userId) ?? boot.profile
  const presence = useMemo(() => foldPresence([...sessions.values()], now), [sessions, now])

  // Keep the newest values reachable from long-lived realtime callbacks.
  const live = useRef({ channels, profiles, settings, me, active, visible: true })
  live.current = { ...live.current, channels, profiles, settings, me, active }

  // SWR's bound mutate functions are stable; the query objects are not.
  const mutateChannels = channelsQuery.mutate
  const mutateMembers = membersQuery.mutate
  const mutateInvites = invitesQuery.mutate
  const mutateBlocks = blocksQuery.mutate
  const refreshChannels = useCallback(() => void mutateChannels(), [mutateChannels])
  const refreshMembers = useCallback(() => void mutateMembers(), [mutateMembers])
  const refreshInvites = useCallback(() => void mutateInvites(), [mutateInvites])
  const refreshBlocks = useCallback(() => void mutateBlocks(), [mutateBlocks])

  // --- navigation -------------------------------------------------------------

  // Reopening Cabal puts you back in the conversation you last had open.
  const lastOpenKey = `cabal:last-open:${userId}`
  const open = useCallback(
    (id: string | null) => {
      setActive(id)
      const url = new URL(window.location.href)
      url.searchParams.delete('welcome')
      if (id) url.searchParams.set('c', id)
      else url.searchParams.delete('c')
      window.history.replaceState(null, '', url)
      try {
        if (id) localStorage.setItem(lastOpenKey, id)
        else localStorage.removeItem(lastOpenKey)
      } catch {}
    },
    [lastOpenKey],
  )

  const restored = useRef<string | null>(null)
  useEffect(() => {
    let c = new URLSearchParams(window.location.search).get('c')
    if (!c) {
      try {
        c = localStorage.getItem(lastOpenKey)
      } catch {}
      restored.current = c
    }
    if (c) setActive(c)
  }, [lastOpenKey])

  // A remembered conversation you've since left (or that was deleted) falls back to home.
  useEffect(() => {
    const id = restored.current
    if (!id || !channelsQuery.data) return
    restored.current = null
    if (!channelsQuery.data.some((c) => c.id === id)) open(null)
  }, [channelsQuery.data, open])

  const openDm = useCallback(
    async (otherId: string) => {
      const { data, error } = await supabase.rpc('open_dm', { p_other: otherId })
      if (error) {
        toast.error(friendlyError(error))
        return
      }
      await mutateChannels()
      open(data as string)
    },
    [supabase, mutateChannels, open],
  )

  // --- read state -------------------------------------------------------------

  const readTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const markRead = useCallback(
    (channelId: string) => {
      mutate(
        ['channels', community.id],
        (cur?: Channel[]) => cur?.map((c) => (c.id === channelId ? { ...c, unread: 0, last_read_at: new Date().toISOString() } : c)),
        { revalidate: false },
      )
      const timers = readTimers.current
      clearTimeout(timers.get(channelId))
      timers.set(
        channelId,
        setTimeout(() => {
          timers.delete(channelId)
          supabase.rpc('mark_read', { p_channel: channelId }).then(({ error }) => {
            if (error) console.error('[cabal] mark_read', error.message)
          })
        }, 600),
      )
    },
    [mutate, supabase, community.id],
  )

  // --- sending ----------------------------------------------------------------

  const send = useCallback(
    async (channelId: string, body: string, retryId?: string) => {
      const id = retryId ?? crypto.randomUUID()
      const draft: Message = {
        id,
        channel_id: channelId,
        author_id: userId,
        kind: 'user',
        body,
        created_at: new Date().toISOString(),
        deleted_at: null,
        pending: true,
      }
      setOutbox((o) => ({ ...o, [channelId]: [...(o[channelId] ?? []).filter((m) => m.id !== id), draft] }))
      const { data, error } = await supabase
        .from('messages')
        .insert({ id, channel_id: channelId, author_id: userId, body })
        .select(MESSAGE_COLUMNS)
        .single()
      if (error && error.code !== '23505') {
        setOutbox((o) => ({
          ...o,
          [channelId]: (o[channelId] ?? []).map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)),
        }))
        if (error.code === 'P0429') toast.error(error.message)
        return
      }
      if (data) {
        mutate(
          messagesKey(channelId),
          (cur?: Message[]) => (cur ? (cur.some((m) => m.id === id) ? cur : [...cur, data as Message]) : cur),
          { revalidate: false },
        )
      }
      setOutbox((o) => ({ ...o, [channelId]: (o[channelId] ?? []).filter((m) => m.id !== id) }))
      markRead(channelId)
    },
    [supabase, userId, mutate, markRead],
  )

  const discard = useCallback((channelId: string, id: string) => {
    setOutbox((o) => ({ ...o, [channelId]: (o[channelId] ?? []).filter((m) => m.id !== id) }))
  }, [])

  // --- settings ---------------------------------------------------------------

  const sessionId = useRef<string>('')
  if (!sessionId.current && typeof crypto !== 'undefined') sessionId.current = crypto.randomUUID()
  const activeRoom = channels.find((c) => c.id === active && c.kind === 'room')?.id ?? null
  const heartbeat = useRef<() => Promise<void>>(async () => {})

  const setAvailability = useCallback(
    async (a: Availability) => {
      const previous = live.current.settings
      setSettings((s) => ({ ...s, availability: a }))
      const { error } = await supabase.rpc('set_availability', { p_availability: a })
      if (error) {
        setSettings(previous)
        toast.error(friendlyError(error))
        return
      }
      await heartbeat.current()
    },
    [supabase],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Omit<Settings, 'availability'>>) => {
      const previous = live.current.settings
      setSettings((s) => ({ ...s, ...patch }))
      const { error } = await supabase.from('user_settings').update(patch).eq('user_id', userId)
      if (error) {
        setSettings(previous)
        toast.error(friendlyError(error))
      }
    },
    [supabase, userId],
  )

  // --- presence heartbeat -------------------------------------------------------

  const paused = useRef(false)
  heartbeat.current = async () => {
    if (paused.current) return
    const { error } = await supabase.rpc('presence_heartbeat', {
      p_session: sessionId.current,
      p_community: community.id,
      p_room: activeRoom,
    })
    if (error) {
      console.error('[cabal] heartbeat', error.message)
      if (error.code === '42501') {
        // Removed from the community (or banned) while the app was open.
        router.replace('/onboarding')
      }
    }
  }

  useEffect(() => {
    void heartbeat.current()
    const t = setInterval(() => void heartbeat.current(), HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [activeRoom, settings.availability])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  // Leave immediately on close/quit/sleep. If this never arrives (crash,
  // lost Wi-Fi) the session simply expires on the server.
  const accessToken = useRef<string | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => (accessToken.current = data.session?.access_token ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      accessToken.current = session?.access_token ?? null
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, router])

  const leave = useCallback(() => {
    const token = accessToken.current
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/presence_leave`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_session: sessionId.current }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.addEventListener('pagehide', leave)
    const d = desktop()
    const offPower = d?.onPower((state) => {
      if (state === 'suspend') {
        paused.current = true
        leave()
      } else {
        paused.current = false
        void heartbeat.current()
        void mutate(() => true)
        void loadPresence()
      }
    })
    const offQuit = d?.onBeforeQuit(() => leave())
    return () => {
      window.removeEventListener('pagehide', leave)
      offPower?.()
      offQuit?.()
    }
  }, [leave, mutate, loadPresence])

  // --- realtime ---------------------------------------------------------------

  const handleIncoming = useCallback(
    async (m: Message) => {
      mutate(
        messagesKey(m.channel_id),
        (cur?: Message[]) => (cur ? (cur.some((x) => x.id === m.id) ? cur : [...cur, m]) : cur),
        { revalidate: false },
      )
      setOutbox((o) => (o[m.channel_id]?.some((x) => x.id === m.id) ? { ...o, [m.channel_id]: o[m.channel_id].filter((x) => x.id !== m.id) } : o))

      let channel = live.current.channels.find((c) => c.id === m.channel_id)
      // A conversation we didn't know about yet (a new DM, a team we were just
      // added to): the fresh server list already counts this message.
      let counted = false
      if (!channel) {
        const fresh = await mutateChannels()
        channel = fresh?.find((c) => c.id === m.channel_id)
        if (!channel) return
        counted = true
      }
      if (m.kind === 'system' && channel.kind === 'room') refreshMembers()
      // A team note can mean it was renamed or made public/invite-only; pick that up for everyone in it.
      if (m.kind === 'system' && channel.kind === 'team' && !counted) void mutateChannels()
      if (m.author_id === userId) return

      // On screen counts as read even if another window (or the page around an
      // embedded preview) has focus; notifications still need Cabal focused.
      const onScreen = live.current.active === m.channel_id && document.visibilityState === 'visible'
      const viewing = onScreen && live.current.visible
      if (onScreen) {
        markRead(m.channel_id)
      } else if (!counted) {
        mutate(
          ['channels', community.id],
          (cur?: Channel[]) =>
            cur?.map((c) =>
              c.id === m.channel_id ? { ...c, unread: Math.min(c.unread + 1, 100), last_message_at: m.created_at } : c,
            ),
          { revalidate: false },
        )
      }

      if (m.kind !== 'user' || viewing || channel.muted) return
      const s = live.current.settings
      if (s.availability === 'dnd') return
      const author = live.current.profiles.get(m.author_id ?? '')
      const authorName = author?.display_name ?? 'Someone'
      const isDm = channel.kind === 'dm'
      const isMention = !isDm && mentions(m.body, live.current.me.username)
      if ((isDm && s.notify_dms) || (isMention && s.notify_mentions)) {
        const where = channel.kind === 'room' ? `#${channel.slug}` : channel.team_name ?? 'your team'
        showNotification({
          title: isDm ? authorName : `${authorName} in ${where}`,
          body: m.body,
          tag: m.channel_id,
          onClick: () => open(m.channel_id),
        })
        if (s.notify_sound) playChime()
      }
    },
    [mutate, mutateChannels, refreshMembers, userId, markRead, community.id, open],
  )

  // Realtime callbacks read the latest handlers through a ref, so the socket
  // subscription is created once per user/community and never churns.
  const handlers = useRef({ handleIncoming, refreshMembers, refreshInvites, refreshChannels, loadPresence })
  handlers.current = { handleIncoming, refreshMembers, refreshInvites, refreshChannels, loadPresence }

  useEffect(() => {
    let wasLive = false
    let cancelled = false
    let channel: RealtimeChannel | null = null
    const h = () => handlers.current

    const start = () => {
      if (cancelled) return
      channel = supabase
        .channel(`cabal-db:${userId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) =>
          h().handleIncoming(p.new as Message),
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => {
          const m = p.new as Message
          mutate(messagesKey(m.channel_id), (cur?: Message[]) => cur?.map((x) => (x.id === m.id ? m : x)), {
            revalidate: false,
          })
        })
        // Realtime can't filter DELETE events by column, so deletions get their
        // own unfiltered listener. The payload carries only the session id.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'presence_sessions' }, (p) => {
          const id = (p.old as { id?: string }).id
          if (id) setSessions((prev) => (prev.has(id) ? new Map([...prev].filter(([k]) => k !== id)) : prev))
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'presence_sessions', filter: `community_id=eq.${community.id}` },
          (p) => {
            if (p.eventType === 'DELETE') return
            const s = p.new as PresenceSession
            setSessions((prev) => new Map(prev).set(s.id, s))
            setNow(Date.now())
            if (!live.current.profiles.has(s.user_id)) h().refreshMembers()
          },
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (p) => {
          const updated = p.new as Profile
          mutate(
            ['members', community.id],
            (cur?: MemberRow[]) => cur?.map((m) => (m.user_id === updated.id ? { ...m, profile: { ...m.profile, ...updated } } : m)),
            { revalidate: false },
          )
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` },
          (p) => setSettings((s) => ({ ...s, ...(p.new as Settings) })),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'team_invites', filter: `user_id=eq.${userId}` },
          () => h().refreshInvites(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'channel_reads', filter: `user_id=eq.${userId}` },
          () => h().refreshChannels(),
        )
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            setConnection(navigator.onLine ? 'live' : 'offline')
            if (wasLive) {
              // Catch up on anything missed while disconnected.
              void mutate(() => true)
              void h().loadPresence()
              void heartbeat.current()
            }
            wasLive = true
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setConnection(navigator.onLine ? 'reconnecting' : 'offline')
          }
        })
    }

    void h().loadPresence()
    supabase.realtime.setAuth().finally(start)

    const onOnline = () => setConnection((c) => (c === 'offline' ? 'reconnecting' : c))
    const onOffline = () => setConnection('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, userId, community.id, mutate])

  // Channel lists can change without a realtime event (added to a team,
  // removed from one). A slow refresh keeps them honest.
  useEffect(() => {
    const t = setInterval(() => {
      refreshChannels()
      refreshInvites()
    }, 60_000)
    return () => clearInterval(t)
  }, [refreshChannels, refreshInvites])

  // Admin role can be granted server-side after load.
  useEffect(() => {
    const row = members.find((m) => m.user_id === userId)
    if (row && row.role !== role) setRole(row.role)
  }, [members, userId, role])

  // --- window focus / visibility -------------------------------------------------

  useEffect(() => {
    const update = () => {
      const onScreen = document.visibilityState === 'visible'
      live.current.visible = onScreen && document.hasFocus()
      if (onScreen && live.current.active) {
        const c = live.current.channels.find((x) => x.id === live.current.active)
        if (c && c.unread > 0) markRead(c.id)
      }
    }
    update()
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [markRead])

  // --- desktop integration ------------------------------------------------------

  const unreadDms = channels.filter((c) => c.kind !== 'room' && !c.muted).reduce((n, c) => n + c.unread, 0)
  useEffect(() => {
    desktop()?.setBadge(unreadDms)
    document.title = unreadDms > 0 ? `(${unreadDms}) Cabal` : 'Cabal'
  }, [unreadDms])

  useEffect(() => desktop()?.onNavigate((target) => open(target)), [open])

  // --- value ------------------------------------------------------------------

  const value: Store = {
    userId,
    email: boot.email,
    community,
    isAdmin: role === 'admin',
    me,
    settings,
    setAvailability,
    updateSettings,
    members,
    membersLoading: membersQuery.isLoading,
    profileById: (id) => (id ? profiles.get(id) : undefined),
    presence,
    statusOf: (id) => {
      if (id === userId) {
        return settings.availability === 'invisible' ? 'offline' : connection === 'offline' ? 'offline' : settings.availability
      }
      return presence.get(id)?.status ?? 'offline'
    },
    channels,
    channelsLoading: channelsQuery.isLoading,
    invites: invitesQuery.data ?? [],
    blocked: blocksQuery.data ?? new Set(),
    connection,
    active,
    open,
    openDm,
    markRead,
    outbox,
    send,
    discard,
    refreshChannels,
    refreshMembers,
    refreshInvites,
    refreshBlocks,
    profileOpen,
    showProfile,
    settingsOpen,
    setSettingsOpen,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
