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
import { showDmToast } from './dm-toast'
import { foldPresence, type UserPresence } from '@/lib/presence'
import { listenForPopouts, viewedInPopout } from '@/lib/popout'
import { personLabel } from '@/lib/mentions'
import { mentions, plainText } from '@/lib/text'
import { charCount, isLong, previewOf, titleOf } from '@/lib/long-text'
import { linkLabel } from '@/lib/channel-links'
import { AttachmentError, attachmentPath, filesLabel, releaseLocal, removeUploads, upload } from '@/lib/attachments'
import { useE2ee } from './e2ee-provider'
import type {
  Availability,
  Channel,
  Community,
  LocalFile,
  Message,
  PresenceSession,
  Profile,
  Settings,
  ShownStatus,
  TeamVisibility,
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
  team: { name: string; visibility: TeamVisibility } | null
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
  send(channelId: string, body: string, retryId?: string, files?: LocalFile[]): Promise<boolean>
  discard(channelId: string, id: string): void
  refreshChannels(): void
  refreshMembers(): void
  refreshInvites(): void
  refreshBlocks(): void
  profileOpen: string | null
  showProfile(id: string | null): void
  settingsOpen: boolean
  setSettingsOpen(open: boolean): void
  playbookOpen: boolean
  setPlaybookOpen(open: boolean): void
}

const Ctx = createContext<Store | null>(null)

export function useCabal() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useCabal must be used inside CabalProvider')
  return s
}

// Places in the main pane that aren't conversations. They share `active` with
// channel ids so back buttons, the URL and "reopen where you were" just work.
export const VIEWS = { opportunities: 'opportunities', calendar: 'calendar', build: 'build' } as const
export type View = (typeof VIEWS)[keyof typeof VIEWS]
export function isView(id: string | null | undefined): id is View {
  return id === VIEWS.opportunities || id === VIEWS.calendar || id === VIEWS.build
}

export const messagesKey = (channelId: string) => ['messages', channelId] as const
export const MESSAGE_COLUMNS = 'id, channel_id, author_id, kind, body, sealed, long_text, long_chars, files, created_at, deleted_at'

// Keeps a conversation in time order when an incoming message took a moment to open.
function insertInOrder(list: Message[], m: Message): Message[] {
  if (list.some((x) => x.id === m.id)) return list
  let i = list.length
  while (i > 0 && list[i - 1].created_at > m.created_at) i--
  return [...list.slice(0, i), m, ...list.slice(i)]
}

// `popout` is a desktop chat window showing one conversation. The main window
// keeps presence, notifications, the badge and "reopen where you were".
export function CabalProvider({ boot, popout = false, children }: { boot: Boot; popout?: boolean; children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const { userId, community } = boot
  const { session: e2ee } = useE2ee()

  const [settings, setSettings] = useState<Settings>(boot.settings)
  const [role, setRole] = useState(boot.role)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [active, setActive] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<Record<string, Message[]>>({})
  const [profileOpen, showProfile] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playbookOpen, setPlaybookOpen] = useState(false)
  const [sessions, setSessions] = useState<Map<string, PresenceSession>>(new Map())
  const [now, setNow] = useState(() => Date.now())

  // --- data -----------------------------------------------------------------

  const membersQuery = useSWR(['members', community.id], async () => {
    const { data, error } = await supabase
      .from('community_members')
      .select('user_id, role, joined_at, profile:profiles(id, username, display_name, avatar_url, company, bio, status_text, identities, links)')
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
      .select('id, team_id, created_at, team:teams(name, visibility), inviter:profiles!team_invites_invited_by_fkey(display_name, username)')
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
  // Who last DMed you while Cabal was in the background (drives the tab title).
  const [attention, setAttention] = useState<string | null>(null)

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
      if (popout) return
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
    [lastOpenKey, popout],
  )

  // A team invite that arrives while you're here gets a one-tap Join, so you
  // don't have to spot it in the buddy list.
  const announceInvite = useCallback(
    async (inviteId: string) => {
      const list = await mutateInvites()
      const inv = list?.find((i) => i.id === inviteId)
      if (!inv || popout) return
      toast(`${inv.inviter?.display_name ?? 'Someone'} invited you to ${inv.team?.name ?? 'a team'}`, {
        duration: 20_000,
        closeButton: true,
        action: {
          label: 'Join',
          onClick: async () => {
            const { data: teamId, error } = await supabase.rpc('respond_team_invite', { p_invite: inv.id, p_accept: true })
            void mutateInvites()
            if (error) {
              toast.error(friendlyError(error))
              return
            }
            const fresh = await supabase.rpc('my_channels', { p_community: community.id })
            void mutateChannels()
            const ch = (fresh.data as Channel[] | null)?.find((c) => c.team_id === teamId)
            if (ch) open(ch.id)
          },
        },
      })
    },
    [mutateInvites, mutateChannels, popout, supabase, community.id, open],
  )

  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (popout) return
    let c = new URLSearchParams(window.location.search).get('c')
    // A team invite link carried through sign-up (see /join/[code]).
    if (!c) {
      try {
        c = sessionStorage.getItem('cabal:open')
        sessionStorage.removeItem('cabal:open')
      } catch {}
    }
    if (!c) {
      try {
        c = localStorage.getItem(lastOpenKey)
      } catch {}
      restored.current = c
    }
    if (c) setActive(c)
  }, [lastOpenKey, popout])

  // A remembered conversation you've since left (or that was deleted) falls back to home.
  useEffect(() => {
    const id = restored.current
    if (!id || !channelsQuery.data) return
    restored.current = null
    if (isView(id)) return
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
      toast.dismiss(`dm:${channelId}`)
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
    async (channelId: string, text: string, retryId?: string, attachments?: LocalFile[]) => {
      const id = retryId ?? crypto.randomUUID()
      const files = attachments ?? []
      // Too big to read comfortably inline: sent whole, shown as a card that opens in a reader.
      // (The composer sends files and a long text as two messages.)
      const long = files.length === 0 && isLong(text)
      const body = long ? previewOf(text) : text
      const longFields = long ? { long_text: true, long_chars: charCount(text), long_body: text } : {}
      const draft: Message = {
        id,
        channel_id: channelId,
        author_id: userId,
        kind: 'user',
        body,
        ...longFields,
        ...(files.length ? { files: files.length, local_files: files } : {}),
        created_at: new Date().toISOString(),
        deleted_at: null,
        pending: true,
      }
      setOutbox((o) => ({ ...o, [channelId]: [...(o[channelId] ?? []).filter((m) => m.id !== id), draft] }))
      const fail = () =>
        setOutbox((o) => ({
          ...o,
          [channelId]: (o[channelId] ?? []).map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)),
        }))

      // Direct messages are sealed here, on this device; the server only ever sees the sealed text.
      const dm = live.current.channels.find((c) => c.id === channelId)?.kind === 'dm'
      const peer = live.current.channels.find((c) => c.id === channelId)?.other_user_id ?? null
      let uploaded: string[] = []
      const insert = async () => {
        if (files.length) {
          // Each attempt uploads under fresh ids, so a retry never meets half of an earlier one.
          removeUploads(uploaded)
          const ids = files.map(() => crypto.randomUUID())
          const paths = ids.map((fid) => attachmentPath(channelId, id, fid))
          uploaded = paths
          if (dm) {
            const sealed = await e2ee.sealWithFiles(
              channelId,
              id,
              peer ?? '',
              body,
              await Promise.all(
                files.map(async (f, i) => ({
                  id: ids[i],
                  bytes: new Uint8Array(await f.blob.arrayBuffer()),
                  meta: { name: f.name, mime: f.mime, kind: f.kind, width: f.width, height: f.height },
                })),
              ),
            )
            await Promise.all(
              sealed.files.map((f, i) =>
                upload(paths[i], new Blob([new Uint8Array(f.cipher)], { type: 'application/octet-stream' }), 'application/octet-stream'),
              ),
            )
            return supabase
              .rpc('send_message_with_files', {
                p_id: id,
                p_channel: channelId,
                p_body: '',
                p_sealed: sealed.message,
                p_files: sealed.files.map((f, i) => ({ id: ids[i], path: paths[i], sealed: f.sealed })),
              })
              .select(MESSAGE_COLUMNS)
              .single()
          }
          await Promise.all(files.map((f, i) => upload(paths[i], f.blob, f.mime)))
          return supabase
            .rpc('send_message_with_files', {
              p_id: id,
              p_channel: channelId,
              p_body: body,
              p_sealed: null,
              p_files: files.map((f, i) => ({
                id: ids[i],
                path: paths[i],
                kind: f.kind,
                mime: f.mime,
                name: f.name,
                width: f.width,
                height: f.height,
              })),
            })
            .select(MESSAGE_COLUMNS)
            .single()
        }
        if (long) {
          // One call writes the preview and the full text together, or neither.
          const sealed = dm ? await e2ee.sealLong(channelId, id, peer ?? '', text) : null
          return supabase
            .rpc('send_long_message', {
              p_id: id,
              p_channel: channelId,
              p_preview: sealed ? '' : body,
              p_preview_sealed: sealed?.preview ?? null,
              p_chars: sealed ? null : charCount(text),
              p_text: sealed ? null : text,
              p_text_sealed: sealed?.full ?? null,
            })
            .select(MESSAGE_COLUMNS)
            .single()
        }
        const row: Pick<Message, 'id' | 'channel_id' | 'author_id' | 'body' | 'sealed'> = dm
          ? { id, channel_id: channelId, author_id: userId, body: '', sealed: await e2ee.seal(channelId, id, peer ?? '', body) }
          : { id, channel_id: channelId, author_id: userId, body }
        return supabase.from('messages').insert(row).select(MESSAGE_COLUMNS).single()
      }
      let result: Awaited<ReturnType<typeof insert>>
      try {
        result = await insert()
        // They reset their keys since we looked: pick up the new one and try once more.
        if (dm && peer && result.error?.code === 'P0409') {
          e2ee.forgetPeer(peer)
          result = await insert()
        }
      } catch (err) {
        removeUploads(uploaded)
        fail()
        toast.error(err instanceof AttachmentError ? err.message : friendlyError(err))
        return false
      }
      const { data, error } = result
      if (error && error.code !== '23505') {
        removeUploads(uploaded)
        fail()
        if (error.code === 'P0429' || error.code === 'P0409' || error.code === '22023') toast.error(error.message)
        return false
      }
      if (data) {
        const row = data as Message
        const sent: Message = { ...row, ...(dm ? { body, e2ee: 'ok' as const } : {}), ...longFields }
        // The sender keeps showing the pictures from memory; nothing to download back.
        if (files.length) sent.local_files = files
        mutate(
          messagesKey(channelId),
          (cur?: Message[]) => {
            if (!cur) return cur
            // Realtime may have delivered it first; keep this device's full copy of a long message.
            if ((long || files.length) && cur.some((m) => m.id === id)) return cur.map((m) => (m.id === id ? { ...m, ...sent } : m))
            return insertInOrder(cur, sent)
          },
          { revalidate: false },
        )
      }
      setOutbox((o) => ({ ...o, [channelId]: (o[channelId] ?? []).filter((m) => m.id !== id) }))
      markRead(channelId)
      return true
    },
    [supabase, userId, mutate, markRead, e2ee],
  )

  const discard = useCallback((channelId: string, id: string) => {
    setOutbox((o) => {
      releaseLocal((o[channelId] ?? []).find((m) => m.id === id)?.local_files)
      return { ...o, [channelId]: (o[channelId] ?? []).filter((m) => m.id !== id) }
    })
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
    if (paused.current || popout) return
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
    // Closing a chat window must not mark you offline; the main window owns presence.
    if (popout) return
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
  }, [leave, mutate, loadPresence, popout])

  // --- realtime ---------------------------------------------------------------

  const handleIncoming = useCallback(
    async (raw: Message) => {
      const m = await e2ee.open(raw)
      mutate(messagesKey(m.channel_id), (cur?: Message[]) => (cur ? insertInOrder(cur, m) : cur), { revalidate: false })
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
      } else if (popout || viewedInPopout(m.channel_id)) {
        // A chat window is showing it (and marks it read), or this is a chat
        // window and the main window keeps everything else.
        return
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

      if (m.kind !== 'user' || viewing || channel.muted || popout) return
      const s = live.current.settings
      if (s.availability === 'dnd') return
      const author = live.current.profiles.get(m.author_id ?? '')
      const authorName = author?.display_name ?? 'Someone'
      const isDm = channel.kind === 'dm'
      const isMention = !isDm && mentions(m.body, { id: userId, username: live.current.me.username })
      const people = personLabel((id) => live.current.profiles.get(id))
      if ((isDm && s.notify_dms) || (isMention && s.notify_mentions)) {
        const where = channel.kind === 'room' ? `#${channel.slug}` : channel.team_name ?? 'your team'
        const preview =
          m.sealed && m.e2ee !== 'ok'
            ? 'New encrypted message'
            : !m.body && m.files
              ? filesLabel(m.files)
              : m.long_text
                ? `Long message: ${titleOf(m.body) ?? plainText(m.body, linkLabel(live.current.channels), people)}`
                : plainText(m.body, linkLabel(live.current.channels), people)
        if (isDm && live.current.visible) {
          // Looking at Cabal, just somewhere else: say so inside the app, where
          // it can't be missed (system notifications are easy to miss or blocked).
          showDmToast({
            channelId: m.channel_id,
            name: authorName,
            avatarUrl: author?.avatar_url ?? null,
            preview,
            count: Math.max(1, counted ? channel.unread : channel.unread + 1),
            onOpen: () => open(m.channel_id),
          })
        } else {
          showNotification({
            title: isDm ? `${authorName} messaged you` : `${authorName} in ${where}`,
            body: preview,
            tag: m.channel_id,
            onClick: () => open(m.channel_id),
          })
          if (isDm) setAttention(authorName)
        }
        if (s.notify_sound) playChime()
      }
    },
    [mutate, mutateChannels, refreshMembers, userId, markRead, community.id, open, e2ee, popout],
  )

  // Realtime callbacks read the latest handlers through a ref, so the socket
  // subscription is created once per user/community and never churns.
  const handlers = useRef({ handleIncoming, refreshMembers, refreshInvites, announceInvite, refreshChannels, loadPresence })
  handlers.current = { handleIncoming, refreshMembers, refreshInvites, announceInvite, refreshChannels, loadPresence }

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
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (p) => {
          const m = await e2ee.open(p.new as Message)
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
          (p) => {
            if (p.eventType === 'INSERT') void h().announceInvite((p.new as { id: string }).id)
            else h().refreshInvites()
          },
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
  }, [supabase, userId, community.id, mutate, e2ee])

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
      if (live.current.visible) setAttention(null)
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
    if (popout) return
    desktop()?.setBadge(unreadDms)
    const counted = unreadDms > 0 ? `(${unreadDms}) Cabal` : 'Cabal'
    document.title = counted
    // While you're away, the tab takes turns saying who wrote, so a DM stands
    // out in a row of tabs. It stops the moment you come back.
    if (!attention || unreadDms === 0) return
    const call = `${attention} messaged you`
    let flip = false
    const timer = window.setInterval(() => {
      flip = !flip
      document.title = flip ? call : counted
    }, 1500)
    return () => {
      window.clearInterval(timer)
      document.title = counted
    }
  }, [unreadDms, popout, attention])

  useEffect(() => desktop()?.onNavigate((target) => open(target)), [open])

  useEffect(() => {
    if (!popout) listenForPopouts()
  }, [popout])

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
    playbookOpen,
    setPlaybookOpen,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
