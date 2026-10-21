'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Compass,
  FolderPlus,
  Hash,
  Link2,
  Lock,
  MessageSquareWarning,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { MeCard } from './me-card'
import { SessionBar } from './session-bar'
import { ConnectionBanner } from './connection-banner'
import { WelcomeCard } from './welcome-card'
import { BrowseTeamsDialog, CreateTeamDialog, TeamIcon, useTeamRooms } from './team-dialogs'
import { FeedbackDialog } from './feedback-dialog'
import { useCabal } from './store'
import { compareByPresence } from '@/lib/presence'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { STATUS_LABEL } from './status-dot'
import { GroupMenu, GroupNameDialog, PERSON_DRAG_TYPE, PersonMenu, type Naming } from './buddy-group-ui'
import { useBuddyGroups } from '@/hooks/use-buddy-groups'
import { arrangeBuddies, type BuddyGroup } from '@/lib/buddy-groups'
import type { Channel, ShownStatus } from '@/lib/types'

export async function copyInviteLink(communityId: string) {
  const { data, error } = await createClient().rpc('community_invite_code', { p_community: communityId })
  if (error || !data) {
    toast.error(friendlyError(error) || "Couldn't get an invite link.")
    return
  }
  const link = `${window.location.origin}/join/${data}`
  try {
    await navigator.clipboard.writeText(link)
    toast.success('Invite link copied', { description: link, closeButton: true, duration: 3000 })
  } catch {
    // Clipboard blocked: the link has to be copied by hand, so it stays until dismissed.
    toast.message('Invite link', { description: link, closeButton: true, duration: Infinity })
  }
}

export function BuddyList() {
  const {
    community,
    members,
    membersLoading,
    channels,
    userId,
    statusOf,
    presence,
    active,
    open,
    openDm,
    showProfile,
    setSettingsOpen,
    invites,
    refreshInvites,
    refreshChannels,
  } = useCabal()
  const [query, setQuery] = useState('')
  const [showOffline, setShowOffline] = useState(true)
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [browsingTeams, setBrowsingTeams] = useState(false)
  const [naming, setNaming] = useState<Naming | null>(null)
  const buddyGroups = useBuddyGroups()
  const teamRooms = useTeamRooms(community.id)
  const joinable = teamRooms.data?.filter((r) => !r.joined).length ?? 0

  const dmByUser = useMemo(() => {
    const map = new Map<string, Channel>()
    for (const c of channels) if (c.kind === 'dm' && c.other_user_id) map.set(c.other_user_id, c)
    return map
  }, [channels])

  const rooms = channels.filter((c) => c.kind === 'room').sort((a, b) => a.position - b.position)
  const teams = channels.filter((c) => c.kind === 'team').sort((a, b) => (a.team_name ?? '').localeCompare(b.team_name ?? ''))

  const q = query.trim().toLowerCase()
  const people = members
    .filter((m) => m.user_id !== userId)
    .map((m) => ({ ...m, status: statusOf(m.user_id), name: m.profile.display_name ?? m.profile.username ?? '' }))
    .filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.profile.username?.toLowerCase().includes(q) ||
        m.profile.company?.toLowerCase().includes(q),
    )
  const arranged = arrangeBuddies(people, buddyGroups.groups, buddyGroups.placements, (a, b) => {
    const ua = dmByUser.get(a.user_id)?.unread ?? 0
    const ub = dmByUser.get(b.user_id)?.unread ?? 0
    if ((ua > 0) !== (ub > 0) && a.status === b.status) return ub - ua
    return compareByPresence(a, b)
  })
  const here = arranged.here
  const away = arranged.offline
  const groupOf = new Map(buddyGroups.placements.map((p) => [p.member_id, p.group_id]))

  function personRow(p: (typeof people)[number]) {
    return (
      <PersonRow
        key={p.user_id}
        userId={p.user_id}
        name={p.name}
        avatarUrl={p.profile.avatar_url}
        status={p.status}
        statusText={p.profile.status_text}
        unread={dmByUser.get(p.user_id)?.unread ?? 0}
        selected={!!active && dmByUser.get(p.user_id)?.id === active}
        onOpen={() => openDm(p.user_id)}
        menu={
          <PersonMenu
            name={p.name}
            groups={buddyGroups.groups}
            currentGroup={groupOf.get(p.user_id) ?? null}
            onProfile={() => showProfile(p.user_id)}
            onMove={(groupId) => buddyGroups.moveTo(p.user_id, groupId)}
            onNewGroup={() => setNaming({ kind: 'create', memberId: p.user_id, memberName: p.name })}
          />
        }
      />
    )
  }

  async function saveName(n: Naming, name: string) {
    if (n.kind === 'create') await buddyGroups.createGroup(name, n.memberId)
    else await buddyGroups.renameGroup(n.groupId, name)
  }

  function deleteGroup(g: BuddyGroup) {
    buddyGroups.deleteGroup(g.id)
    toast.message(`Deleted ${g.name}`, { description: 'Everyone in it is back in Here now.' })
  }
  const visibleRooms = rooms.filter((r) => !q || r.slug?.includes(q))
  const visibleTeams = teams.filter((t) => !q || t.team_name?.toLowerCase().includes(q))
  const othersExist = members.some((m) => m.user_id !== userId)

  async function respond(inviteId: string, accept: boolean) {
    const { data, error } = await createClient().rpc('respond_team_invite', { p_invite: inviteId, p_accept: accept })
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    refreshInvites()
    if (accept && data) {
      const fresh = await createClient().rpc('my_channels', { p_community: community.id })
      refreshChannels()
      const ch = (fresh.data as Channel[] | null)?.find((c) => c.team_id === data)
      if (ch) open(ch.id)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between gap-2 pr-2 pl-3">
        <span className="truncate font-mono text-xs font-medium text-muted-foreground">{community.name}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Report a bug or suggest something"
            title="Report a bug or suggest something"
          >
            <MessageSquareWarning className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Settings"
          >
            <Settings className="size-4" aria-hidden />
          </button>
        </div>
      </header>
      <ConnectionBanner />
      <MeCard />
      <SessionBar />
      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search people and channels</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Find someone"
            className="h-8 w-full rounded-md border border-transparent bg-sidebar-accent pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </label>
      </div>

      <nav className="quiet-scroll min-h-0 flex-1 overflow-y-auto pb-4" aria-label="Conversations">
        <WelcomeCard />

        {invites.length > 0 && (
          <Section label="Team invites">
            {invites.map((inv) => (
              <div key={inv.id} className="mx-2 flex items-center gap-2 rounded-md border bg-card px-2.5 py-2">
                <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 text-xs leading-relaxed">
                  <span className="font-medium">{inv.team?.name ?? 'A team'}</span>
                  <span className="text-muted-foreground"> from {inv.inviter?.display_name ?? 'a teammate'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => respond(inv.id, true)}
                  className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Join ${inv.team?.name ?? 'team'}`}
                >
                  <Check className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => respond(inv.id, false)}
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Decline ${inv.team?.name ?? 'team'}`}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
          </Section>
        )}

        {visibleRooms.length > 0 && (
          <Section label="Channels">
            {visibleRooms.map((r) => {
              const here = [...presence.values()].filter((p) => p.rooms.has(r.id)).length
              return (
                <Row key={r.id} selected={active === r.id} onClick={() => open(r.id)} unread={r.unread} quiet muted={r.muted}>
                  <Hash className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className={cn('truncate font-mono text-[13px]', r.unread > 0 && !r.muted && 'font-semibold text-foreground')}>
                    {r.slug}
                  </span>
                  {here > 0 && (
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground" aria-label={`${here} here now`}>
                      {here}
                    </span>
                  )}
                </Row>
              )
            })}
          </Section>
        )}

        <Section
          label="Teams"
          action={
            <button
              type="button"
              onClick={() => setCreatingTeam(true)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Start a team"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          }
        >
          {visibleTeams.map((t) => (
            <Row key={t.id} selected={active === t.id} onClick={() => open(t.id)} unread={t.unread} muted={t.muted}>
              <TeamIcon visibility={t.team_visibility} className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={cn('truncate text-[13px]', t.unread > 0 && !t.muted && 'font-semibold text-foreground')}>
                {t.team_name}
              </span>
            </Row>
          ))}
          {!q && (
            <button
              type="button"
              onClick={() => setBrowsingTeams(true)}
              className="mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs leading-relaxed text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Compass className="size-3.5 shrink-0" aria-hidden />
              <span className="flex-1">
                {teams.length === 0 && joinable === 0 ? 'Find or start a team' : 'Browse teams'}
              </span>
              {joinable > 0 && (
                <span className="font-mono text-[11px]" aria-label={`${joinable} to join`}>
                  {joinable}
                </span>
              )}
            </button>
          )}
        </Section>

        {arranged.groups.map(({ group: g, online, total }) => {
          if (q && online.length === 0) return null
          const expanded = !g.collapsed || !!q
          return (
            <Section
              key={g.id}
              label={`${g.name} · ${online.length}/${total}`}
              collapsible
              expanded={expanded}
              onToggle={() => buddyGroups.setCollapsed(g.id, !g.collapsed)}
              onDropPerson={(id) => groupOf.get(id) !== g.id && buddyGroups.moveTo(id, g.id)}
              action={
                <GroupMenu
                  name={g.name}
                  onRename={() => setNaming({ kind: 'rename', groupId: g.id, name: g.name })}
                  onDelete={() => deleteGroup(g)}
                />
              }
            >
              {expanded && online.map(personRow)}
              {expanded && !q && online.length === 0 && (
                <p className="px-4 py-1 text-xs leading-relaxed text-muted-foreground">
                  {total === 0 ? 'Drag someone here, or use ··· on their name.' : 'Nobody in this group is around.'}
                </p>
              )}
            </Section>
          )
        })}

        <Section
          label={`Here now · ${here.length}`}
          onDropPerson={(id) => groupOf.has(id) && buddyGroups.moveTo(id, null)}
          action={
            othersExist && (
              <button
                type="button"
                onClick={() => setNaming({ kind: 'create', memberId: null })}
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="New group"
                title="New group"
              >
                <FolderPlus className="size-3.5" aria-hidden />
              </button>
            )
          }
        >
          {membersLoading && <PeopleSkeleton />}
          {here.map(personRow)}
          {!membersLoading && here.length === 0 && othersExist && !q && (
            <p className="px-4 py-1 text-xs leading-relaxed text-muted-foreground">Nobody else is around right now.</p>
          )}
        </Section>

        {away.length > 0 && (
          <Section
            label={`Offline · ${away.length}`}
            collapsible
            expanded={showOffline || !!q}
            onToggle={() => setShowOffline((v) => !v)}
          >
            {(showOffline || q) && away.map(personRow)}
          </Section>
        )}

        {q && people.length === 0 && visibleRooms.length === 0 && visibleTeams.length === 0 && (
          <p className="px-4 py-2 text-xs text-muted-foreground">{`No one matches "${query}".`}</p>
        )}

        {!membersLoading && !othersExist && !q && (
          <div className="mx-3 mt-2 flex flex-col gap-2 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">{"It's just you so far."}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {community.name} starts with whoever shows up. Send the invite link to another builder and you&apos;ll see
              them here the moment they sign in.
            </p>
            <button
              type="button"
              onClick={() => copyInviteLink(community.id)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Link2 className="size-3.5" aria-hidden />
              Copy invite link
            </button>
          </div>
        )}
      </nav>

      {othersExist && (
        <div className="shrink-0 border-t px-3 py-2">
          <button
            type="button"
            onClick={() => copyInviteLink(community.id)}
            className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Link2 className="size-3.5" aria-hidden />
            Invite a builder
          </button>
        </div>
      )}

      <CreateTeamDialog open={creatingTeam} onOpenChange={setCreatingTeam} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <BrowseTeamsDialog open={browsingTeams} onOpenChange={setBrowsingTeams} onCreate={() => setCreatingTeam(true)} />
      <GroupNameDialog naming={naming} onClose={() => setNaming(null)} onSubmit={saveName} />
    </div>
  )
}

function Section({
  label,
  action,
  children,
  collapsible,
  expanded,
  onToggle,
  onDropPerson,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  onDropPerson?: (userId: string) => void
}) {
  const [dropping, setDropping] = useState(false)
  const accepts = (e: React.DragEvent) => !!onDropPerson && e.dataTransfer.types.includes(PERSON_DRAG_TYPE)
  return (
    <section
      className={cn(
        'mt-3 flex flex-col gap-px rounded-md transition-colors first:mt-1',
        dropping && 'bg-sidebar-accent/60 ring-1 ring-ring/40',
      )}
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(e) => {
        setDropping(false)
        if (!accepts(e)) return
        e.preventDefault()
        const id = e.dataTransfer.getData(PERSON_DRAG_TYPE)
        if (id) onDropPerson?.(id)
      }}
    >
      <div className="group flex h-6 items-center justify-between pr-3 pl-4">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="-ml-1 inline-flex items-center gap-1 rounded font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn('size-3 transition-transform', expanded && 'rotate-90')} aria-hidden />
            {label}
          </button>
        ) : (
          <h2 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</h2>
        )}
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({
  children,
  selected,
  onClick,
  unread,
  quiet,
  muted,
}: {
  children: React.ReactNode
  selected: boolean
  onClick: () => void
  unread: number
  quiet?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        selected && 'bg-sidebar-accent text-sidebar-foreground',
        muted && 'opacity-60',
      )}
    >
      {children}
      {unread > 0 && !muted && <UnreadBadge count={unread} quiet={quiet} />}
    </button>
  )
}

function UnreadBadge({ count, quiet }: { count: number; quiet?: boolean }) {
  const label = count >= 100 ? '99+' : String(count)
  return (
    <span
      className={cn(
        'ml-auto inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-semibold',
        quiet ? 'bg-sidebar-accent text-foreground' : 'bg-primary text-primary-foreground',
      )}
      aria-label={`${label} unread`}
    >
      {label}
    </span>
  )
}

function PersonRow({
  userId,
  name,
  avatarUrl,
  status,
  statusText,
  unread,
  selected,
  onOpen,
  menu,
}: {
  userId: string
  name: string
  avatarUrl: string | null
  status: ShownStatus
  statusText: string | null
  unread: number
  selected: boolean
  onOpen: () => void
  menu: React.ReactNode
}) {
  const sub = statusText || (status === 'away' || status === 'dnd' ? STATUS_LABEL[status] : null)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PERSON_DRAG_TYPE, userId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'group mx-2 flex items-center rounded-md transition-colors hover:bg-sidebar-accent',
        selected && 'bg-sidebar-accent',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'page' : undefined}
        aria-label={`Message ${name}, ${STATUS_LABEL[status]}${statusText ? `, ${statusText}` : ''}${unread ? `, ${unread} unread` : ''}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar name={name} url={avatarUrl} size={28} status={status} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate text-[13px] leading-tight',
              status === 'offline' ? 'text-muted-foreground' : 'text-sidebar-foreground',
              unread > 0 && 'font-semibold text-sidebar-foreground',
            )}
          >
            {name}
          </span>
          {sub && (
            <span className={cn('truncate text-[11.5px] leading-tight text-muted-foreground', status === 'offline' && 'opacity-70')}>
              {sub}
            </span>
          )}
        </span>
        {unread > 0 && <UnreadBadge count={unread} />}
      </button>
      {menu}
    </div>
  )
}

function PeopleSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-4 py-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2.5 py-1">
          <div className="size-7 animate-pulse rounded-full bg-sidebar-accent" />
          <div className="h-3 w-24 animate-pulse rounded bg-sidebar-accent" />
        </div>
      ))}
    </div>
  )
}
