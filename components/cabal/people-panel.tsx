'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { CabalStar } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { compareByPresence } from '@/lib/presence'
import { IDENTITY_LABEL } from '@/lib/identity'
import { useLockIns } from '@/hooks/use-lock-ins'
import { Avatar } from './avatar'
import { STATUS_LABEL } from './status-dot'
import { useCabal } from './store'
import { refreshTeamMembers, useTeamMembers } from './team-dialogs'
import { useWorkSession } from './work-session'
import type { Channel, Profile, ShownStatus } from '@/lib/types'

export type PanelPerson = {
  user_id: string
  name: string
  status: ShownStatus
  profile: Profile
  // Runs the community (an admin): gets the star.
  cabalTeam: boolean
  teamOwner: boolean
  lockedIn: boolean
}

// Everyone who belongs in a conversation: the whole community for a channel,
// the team's members for a team room. Online people first.
export function usePeopleIn(channel: Channel, lastNotice: string | null) {
  const { members, statusOf, userId, community } = useCabal()
  const lockIns = useLockIns(community.id)
  const session = useWorkSession()
  const teamId = channel.kind === 'team' ? channel.team_id : null
  const team = useTeamMembers(teamId)

  // A notice in a team room is usually someone joining or leaving.
  useEffect(() => {
    if (teamId && lastNotice) void refreshTeamMembers(teamId)
  }, [teamId, lastNotice])

  return useMemo(() => {
    const roles = teamId ? new Map((team.data ?? []).map((t) => [t.user_id, t.role])) : null
    const people: PanelPerson[] = members
      .filter((m) => !roles || roles.has(m.user_id))
      .map((m) => {
        const status = statusOf(m.user_id)
        return {
          user_id: m.user_id,
          name: m.profile.display_name ?? m.profile.username ?? '',
          status,
          profile: m.profile,
          cabalTeam: m.role === 'admin',
          teamOwner: roles?.get(m.user_id) === 'owner',
          lockedIn: m.user_id === userId ? session.status === 'running' : status !== 'offline' && lockIns.has(m.user_id),
        }
      })
    const online = people.filter((p) => p.status !== 'offline').sort(compareByPresence)
    const offline = people.filter((p) => p.status === 'offline').sort(compareByPresence)
    return { online, offline, total: people.length, loading: !!teamId && team.isLoading }
  }, [members, statusOf, userId, session.status, lockIns, teamId, team.data, team.isLoading])
}

export function PeoplePanel({
  channel,
  online,
  offline,
  total,
  loading,
  onClose,
}: {
  channel: Channel
  online: PanelPerson[]
  offline: PanelPerson[]
  total: number
  loading: boolean
  // Set when the panel floats over the conversation (narrow windows).
  onClose?: () => void
}) {
  const [showOffline, setShowOffline] = useState(true)
  const title = channel.kind === 'team' ? (channel.team_name ?? 'Team') : `#${channel.slug}`

  useEffect(() => {
    if (!onClose) return
    // Capture so Escape closes the panel before the shell closes the conversation.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"]')) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <aside
      aria-label={`Members of ${title}`}
      className={cn(
        'flex w-60 shrink-0 flex-col border-l bg-sidebar',
        onClose && 'absolute inset-y-0 right-0 z-20 w-64 max-w-[85%] shadow-xl',
      )}
    >
      <div className="app-drag flex h-11 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
        <h2 className="flex min-w-0 items-baseline gap-1.5 text-sm font-semibold">
          {channel.kind === 'team' ? 'Team' : 'Members'}
          <span className="font-mono text-xs font-normal text-muted-foreground">{loading ? '…' : total}</span>
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close members"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="quiet-scroll flex-1 overflow-y-auto pb-4">
        <section className="mt-2">
          <h3 className="px-4 py-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            Online · {online.length}
          </h3>
          {online.length === 0 && !loading ? (
            <p className="px-4 py-1 text-xs leading-relaxed text-muted-foreground">Nobody&apos;s online right now.</p>
          ) : (
            <PeopleList people={online} />
          )}
        </section>

        {offline.length > 0 && (
          <section className="mt-3">
            <h3>
              <button
                type="button"
                onClick={() => setShowOffline((v) => !v)}
                aria-expanded={showOffline}
                className="flex w-full items-center gap-1 px-4 py-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className={cn('size-3 transition-transform', !showOffline && '-rotate-90')} aria-hidden />
                Offline · {offline.length}
              </button>
            </h3>
            {showOffline && <PeopleList people={offline} />}
          </section>
        )}
      </div>
    </aside>
  )
}

function PeopleList({ people }: { people: PanelPerson[] }) {
  const { showProfile, userId } = useCabal()
  return (
    <ul className="flex flex-col">
      {people.map((p) => {
        const offline = p.status === 'offline'
        const mine = p.user_id === userId
        const activity = p.lockedIn
          ? `Locked in${p.profile.status_text ? ` · ${p.profile.status_text}` : ''}`
          : p.profile.status_text || (p.status === 'away' || p.status === 'dnd' ? STATUS_LABEL[p.status] : null)
        const sub = [p.profile.identity ? IDENTITY_LABEL[p.profile.identity] : null, activity].filter(Boolean).join(' · ')
        const spoken = [
          p.name,
          p.cabalTeam && 'Cabal team',
          p.teamOwner && 'team owner',
          STATUS_LABEL[p.status],
          sub,
        ]
          .filter(Boolean)
          .join(', ')
        return (
          <li key={p.user_id}>
            <button
              type="button"
              onClick={() => showProfile(p.user_id)}
              aria-label={spoken}
              className="mx-2 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Avatar name={p.name} url={p.profile.avatar_url} size={28} status={p.status} lockedIn={p.lockedIn} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn('truncate text-[13px] leading-tight', offline ? 'text-muted-foreground' : 'text-sidebar-foreground')}
                  >
                    {p.name}
                    {mine && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {p.cabalTeam && (
                    <span title="Cabal team" className="inline-flex shrink-0">
                      <CabalStar className="size-3" />
                    </span>
                  )}
                  {p.teamOwner && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">owner</span>}
                </span>
                {sub && (
                  <span className={cn('truncate text-[11.5px] leading-tight text-muted-foreground', offline && 'opacity-70')}>
                    {sub}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
