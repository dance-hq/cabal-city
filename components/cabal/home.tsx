'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { Compass, Hash, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { compareByPresence } from '@/lib/presence'
import { shortDuration } from '@/lib/session'
import { ago } from '@/lib/time'
import { useLockIns } from '@/hooks/use-lock-ins'
import type { Channel, Message, Profile, ShownStatus } from '@/lib/types'
import { Avatar } from './avatar'
import { copyInviteLink } from './buddy-list'
import { MESSAGE_COLUMNS, useCabal } from './store'
import { BrowseTeamsDialog, CreateTeamDialog, TeamIcon, useTeamRooms } from './team-dialogs'

const RECENT = 6

// What you see with nothing open: who's around, who's locked in, and where
// the conversation has been. Everything here is real; quiet looks quiet.
export function Home() {
  const { community, members, userId, statusOf, channels, channelsLoading } = useCabal()
  const lockIns = useLockIns(community.id)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const here = useMemo(
    () =>
      members
        .filter((m) => m.user_id !== userId)
        .map((m) => ({ ...m, status: statusOf(m.user_id), name: m.profile.display_name ?? m.profile.username ?? '' }))
        .filter((m) => m.status !== 'offline')
        .sort(compareByPresence),
    [members, userId, statusOf],
  )

  const recent = useMemo(
    () =>
      channels
        .filter((c) => c.last_message_at)
        .sort((a, b) => Date.parse(b.last_message_at!) - Date.parse(a.last_message_at!))
        .slice(0, RECENT),
    [channels],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between gap-3 border-b px-5">
        <h1 className="truncate text-sm font-semibold">{community.name}</h1>
        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {here.length} here
          {lockIns.size > 0 ? ` · ${lockIns.size} locked in` : ''}
        </p>
      </header>

      <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-8">
            <LockedIn lockIns={lockIns} now={now} />
            <Recent channels={recent} loading={channelsLoading} now={now} />
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <HereNow people={here} />
            <Channels />
          </div>
        </div>
      </div>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</h2>
      {children}
    </section>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{children}</p>
}

function LockedIn({ lockIns, now }: { lockIns: ReturnType<typeof useLockIns>; now: number }) {
  const { profileById, userId, showProfile } = useCabal()
  const rows = [...lockIns.entries()]
    .map(([id, l]) => ({ id, ...l, profile: profileById(id) }))
    .filter((r) => r.profile)
    .sort((a, b) => a.startedAt - b.startedAt)

  return (
    <Block label={`Locked in · ${rows.length}`}>
      {rows.length === 0 ? (
        <Quiet>
          Nobody&apos;s locked in right now. When you want to focus, tap Lock in in the sidebar.
        </Quiet>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => {
            const name = r.profile!.display_name ?? r.profile!.username ?? 'Someone'
            const mine = r.id === userId
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => showProfile(r.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar name={name} url={r.profile!.avatar_url} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm leading-tight font-medium">
                      {name}
                      {mine && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="truncate text-[13px] leading-snug text-muted-foreground">
                      {r.profile!.status_text || 'Heads down'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-flag" aria-hidden />
                    {shortDuration(now - r.startedAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}

function useLatest(channels: Channel[]) {
  const key = channels.map((c) => `${c.id}:${c.last_message_at}`).join(',')
  return useSWR(key ? ['home-latest', key] : null, async () => {
    const supabase = createClient()
    const found = await Promise.all(
      channels.map(async (c) => {
        const { data } = await supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('channel_id', c.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        return [c.id, data as Message | null] as const
      }),
    )
    return new Map(found)
  }).data
}

function Recent({ channels, loading, now }: { channels: Channel[]; loading: boolean; now: number }) {
  const { open, profileById, userId, channels: all } = useCabal()
  const latest = useLatest(channels)
  const intro = all.find((c) => c.kind === 'room' && c.slug === 'introductions')

  function title(c: Channel) {
    if (c.kind === 'room') return `#${c.slug}`
    if (c.kind === 'team') return c.team_name ?? 'Team'
    const p = profileById(c.other_user_id)
    return p?.display_name ?? p?.username ?? 'Former member'
  }

  return (
    <Block label="Recent">
      {loading ? (
        <div className="flex flex-col gap-3 py-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-accent/60" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <Quiet>
          No conversations yet.{' '}
          {intro ? (
            <button
              type="button"
              onClick={() => open(intro.id)}
              className="rounded font-mono text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Say hello in #introductions
            </button>
          ) : (
            'Say hello in a channel.'
          )}
        </Quiet>
      ) : (
        <ul className="flex flex-col">
          {channels.map((c) => {
            const m = latest?.get(c.id)
            const author = m?.author_id === userId ? 'You' : profileById(m?.author_id)?.display_name
            const dm = c.kind === 'dm'
            const unread = c.unread > 0 && !c.muted
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                    {c.kind === 'room' ? (
                      <Hash className="size-3.5" aria-hidden />
                    ) : c.kind === 'team' ? (
                      <TeamIcon visibility={c.team_visibility} className="size-3.5" />
                    ) : (
                      <DmAvatar userId={c.other_user_id} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'truncate text-sm leading-tight',
                          c.kind === 'room' && 'font-mono text-[13px]',
                          unread ? 'font-semibold' : 'font-medium',
                        )}
                      >
                        {title(c)}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                        {ago(c.last_message_at!, now)}
                      </span>
                    </span>
                    <span className={cn('truncate text-[13px] leading-snug', unread ? 'text-foreground' : 'text-muted-foreground')}>
                      {m ? (
                        m.kind === 'system' ? (
                          <span className="italic">{m.body}</span>
                        ) : (
                          <>
                            {!dm || author === 'You' ? `${author ?? 'Someone'}: ` : ''}
                            {m.body}
                          </>
                        )
                      ) : (
                        '\u00a0'
                      )}
                    </span>
                  </span>
                  {unread && (
                    <span
                      className="mt-0.5 inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10.5px] font-semibold text-primary-foreground"
                      aria-label={`${c.unread} unread`}
                    >
                      {c.unread >= 100 ? '99+' : c.unread}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}

function DmAvatar({ userId }: { userId: string | null }) {
  const { profileById, statusOf } = useCabal()
  const p = profileById(userId)
  return <Avatar name={p?.display_name ?? '?'} url={p?.avatar_url} size={20} status={userId ? statusOf(userId) : undefined} />
}

type Person = { user_id: string; name: string; status: ShownStatus; profile: Profile }

function HereNow({ people }: { people: Person[] }) {
  const { openDm, community } = useCabal()
  return (
    <Block label={`Here now · ${people.length}`}>
      {people.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Quiet>Nobody else is around right now. Messages you send will be waiting for them.</Quiet>
          <InviteButton communityId={community.id} />
        </div>
      ) : (
        <ul className="flex flex-col">
          {people.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                onClick={() => openDm(p.user_id)}
                aria-label={`Message ${p.name}`}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar name={p.name} url={p.profile.avatar_url} size={24} status={p.status} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-tight">{p.name}</span>
                  {p.profile.status_text && (
                    <span className="truncate text-[11.5px] leading-tight text-muted-foreground">{p.profile.status_text}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

function Channels() {
  const { channels, presence, open, community, userId } = useCabal()
  const teamRooms = useTeamRooms(community.id)
  const [browsing, setBrowsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const rooms = channels.filter((c) => c.kind === 'room').sort((a, b) => a.position - b.position)
  const joinable = teamRooms.data?.filter((r) => !r.joined && r.visibility === 'public').length ?? 0

  return (
    <Block label="Channels">
      <ul className="flex flex-col">
        {rooms.map((r) => {
          const count = [...presence].filter(([id, p]) => id !== userId && p.rooms.has(r.id)).length
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => open(r.id)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Hash className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-[13px] leading-tight">{r.slug}</span>
                  {r.topic && <span className="truncate text-[11.5px] leading-tight text-muted-foreground">{r.topic}</span>}
                </span>
                {count > 0 && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground" aria-label={`${count} in here now`}>
                    {count} in
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={() => setBrowsing(true)}
        className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Compass className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1">{joinable > 0 ? `${joinable} open team${joinable === 1 ? '' : 's'} to join` : 'Browse teams'}</span>
      </button>
      <BrowseTeamsDialog open={browsing} onOpenChange={setBrowsing} onCreate={() => setCreating(true)} />
      <CreateTeamDialog open={creating} onOpenChange={setCreating} />
    </Block>
  )
}

function InviteButton({ communityId }: { communityId: string }) {
  return (
    <button
      type="button"
      onClick={() => copyInviteLink(communityId)}
      className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Link2 className="size-3.5" aria-hidden />
      Invite a builder
    </button>
  )
}
