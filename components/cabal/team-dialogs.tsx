'use client'

import { useState } from 'react'
import useSWR, { mutate as mutateGlobal } from 'swr'
import { Loader2, Lock, Search, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Avatar } from './avatar'
import { useCabal } from './store'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { isMakersTeam } from '@/lib/config'
import { isOwnTeamImageUrl } from '@/lib/team-images'
import { cn } from '@/lib/utils'
import type { Channel, TeamRoom, TeamVisibility } from '@/lib/types'
import { TeamImagesEditor, TeamMark, refreshTeamImages } from './team-images'

const teamRoomsKey = (communityId: string) => ['team-rooms', communityId] as const

export function useTeamRooms(communityId: string) {
  return useSWR(
    teamRoomsKey(communityId),
    async () => {
      const { data, error } = await createClient().rpc('community_teams', { p_community: communityId })
      if (error) throw error
      return (data ?? []) as TeamRoom[]
    },
    { refreshInterval: 60_000 },
  )
}

export function refreshTeamRooms(communityId: string) {
  return mutateGlobal(teamRoomsKey(communityId))
}

export type TeamMember = { user_id: string; role: 'owner' | 'member' }

const teamMembersKey = (teamId: string) => ['team-members', teamId] as const

// Who's on a team. Joins and leaves aren't live, so this refreshes every
// minute and whenever the room posts a notice (see PeoplePanel).
export function useTeamMembers(teamId: string | null) {
  return useSWR(
    teamId ? teamMembersKey(teamId) : null,
    async () => {
      const { data, error } = await createClient().from('team_members').select('user_id, role').eq('team_id', teamId!)
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
    { refreshInterval: 60_000 },
  )
}

export function refreshTeamMembers(teamId: string) {
  return mutateGlobal(teamMembersKey(teamId))
}

export function TeamIcon({
  visibility,
  logo,
  className,
}: {
  visibility: TeamVisibility | null
  logo?: string | null
  className?: string
}) {
  if (logo && isOwnTeamImageUrl(logo)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className={cn(className, 'rounded-[3px] bg-muted object-cover')} />
  }
  const Icon = visibility === 'public' ? Users : Lock
  return <Icon className={className} aria-hidden />
}

export async function openTeam(communityId: string, teamId: string, openChannel: (id: string) => void, refresh: () => void) {
  const { data } = await createClient().rpc('my_channels', { p_community: communityId })
  refresh()
  void refreshTeamRooms(communityId)
  const ch = (data as Channel[] | null)?.find((c) => c.team_id === teamId)
  if (ch) openChannel(ch.id)
}

// "Founded by Ada", "Ada & Grace", "Ada and 2 others", with their faces.
export function Founders({ ownerIds }: { ownerIds: string[] }) {
  const { profileById } = useCabal()
  const owners = ownerIds.map((id) => profileById(id)).filter((p): p is NonNullable<typeof p> => !!p?.display_name)
  if (owners.length === 0) return null
  const names =
    owners.length === 1
      ? owners[0].display_name
      : owners.length === 2
        ? `${owners[0].display_name} & ${owners[1].display_name}`
        : `${owners[0].display_name} and ${owners.length - 1} others`
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1.5" aria-hidden>
        {owners.slice(0, 3).map((p) => (
          <span key={p.id} className="rounded-full ring-2 ring-card">
            <Avatar name={p.display_name ?? ''} url={p.avatar_url} size={18} />
          </span>
        ))}
      </span>
      <span className="truncate">Founded by {names}</span>
    </span>
  )
}

// A quiet nod to the team that makes Cabal.
export function MakersTag() {
  return <span className="font-mono text-[10.5px] tracking-wider text-mark uppercase">Founding team</span>
}

export function activeLabel(iso: string | null) {
  if (!iso) return 'no messages yet'
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 2) return 'active now'
  if (minutes < 60) return `active ${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `active ${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `active ${days}d ago` : 'quiet lately'
}

export function BrowseTeamsDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreate: () => void
}) {
  const { community, open: openChannel, refreshChannels } = useCabal()
  const rooms = useTeamRooms(community.id)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const list = (rooms.data ?? [])
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => {
      if (a.joined !== b.joined) return a.joined ? 1 : -1
      if (isMakersTeam(a.name) !== isMakersTeam(b.name)) return isMakersTeam(a.name) ? -1 : 1
      return (Date.parse(b.last_message_at ?? b.created_at) || 0) - (Date.parse(a.last_message_at ?? a.created_at) || 0)
    })

  async function enter(room: TeamRoom) {
    setBusyId(room.id)
    if (!room.joined) {
      const { error } = await createClient().rpc('join_team', { p_team: room.id })
      if (error) {
        setBusyId(null)
        toast.error(friendlyError(error))
        void rooms.mutate()
        return
      }
    }
    await openTeam(community.id, room.id, openChannel, refreshChannels)
    setBusyId(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Teams</DialogTitle>
          <DialogDescription>
            Where teams in {community.name} build out loud. Join any of them to follow along, say hi, or lend a hand.
          </DialogDescription>
        </DialogHeader>

        {(rooms.data?.length ?? 0) > 5 && (
          <label className="relative block">
            <span className="sr-only">Search teams</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams" className="pl-8" />
          </label>
        )}

        {rooms.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
        {rooms.error && <p className="text-sm text-muted-foreground">{"Couldn't load teams. Try again in a moment."}</p>}

        {rooms.data && rooms.data.length === 0 && (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm leading-relaxed text-muted-foreground">
            No teams yet. Start the first one for your startup or crew.
          </p>
        )}
        {rooms.data && rooms.data.length > 0 && list.length === 0 && (
          <p className="text-sm text-muted-foreground">{`No teams match "${query}".`}</p>
        )}

        {list.length > 0 && (
          <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                <TeamMark logo={r.logo_url} visibility={r.visibility} size={36} className="self-start" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {isMakersTeam(r.name) && <MakersTag />}
                  </span>
                  {r.welcome && (
                    <span className="line-clamp-2 text-xs leading-relaxed text-pretty text-foreground/80">
                      {r.welcome.replace(/\s+/g, ' ')}
                    </span>
                  )}
                  {r.owner_ids?.length > 0 && (
                    <span className="flex min-w-0 text-xs text-muted-foreground">
                      <Founders ownerIds={r.owner_ids} />
                    </span>
                  )}
                  <span className="truncate text-xs text-muted-foreground">
                    {r.member_count} {r.member_count === 1 ? 'member' : 'members'} · {activeLabel(r.last_message_at)}
                    {r.visibility === 'private' && ' · invite-only'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={r.joined ? 'ghost' : 'secondary'}
                  disabled={busyId !== null}
                  onClick={() => enter(r)}
                  aria-label={r.joined ? `Open ${r.name}` : `Join ${r.name}`}
                >
                  {busyId === r.id && <Loader2 className="animate-spin" aria-hidden />}
                  {r.joined ? 'Open' : 'Join'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
              onCreate()
            }}
          >
            Start a team
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { community, open: openChannel, refreshChannels } = useCabal()
  const [name, setName] = useState('')
  const [inviteOnly, setInviteOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { data: teamId, error } = await createClient().rpc('create_team', {
      p_community: community.id,
      p_name: name.trim(),
      p_visibility: inviteOnly ? 'private' : 'public',
    })
    if (error) {
      setBusy(false)
      toast.error(friendlyError(error))
      return
    }
    await openTeam(community.id, teamId as string, openChannel, refreshChannels)
    setBusy(false)
    setName('')
    setInviteOnly(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Start a team</DialogTitle>
            <DialogDescription>
              A home for your startup or crew. Anyone in {community.name} can find it and join. You can change the
              name or make it invite-only later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              autoFocus
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Robotics"
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="team-invite-only">Invite-only</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Hide it from everyone else. Only people you invite can see or read it.
              </p>
            </div>
            <Switch id="team-invite-only" checked={inviteOnly} onCheckedChange={setInviteOnly} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Start team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type PendingInvite = { id: string; user_id: string }

export function TeamManageDialog({
  open,
  onOpenChange,
  channel,
  onEditWelcome,
  onInvite,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  channel: Channel
  onEditWelcome?: () => void
  onInvite?: () => void
}) {
  const { community, userId, profileById, refreshChannels, open: openChannel } = useCabal()
  const teamId = channel.team_id!
  const isOwner = channel.team_role === 'owner'
  const isPublic = channel.team_visibility === 'public'
  const [busyId, setBusyId] = useState<string | null>(null)
  const [name, setName] = useState(channel.team_name ?? '')
  const [wasOpen, setWasOpen] = useState(open)
  // Start from the current name each time the dialog opens (it may have been renamed meanwhile).
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setName(channel.team_name ?? '')
  }

  const team = useSWR(open ? ['team', teamId] : null, async () => {
    const supabase = createClient()
    const [m, i] = await Promise.all([
      supabase.from('team_members').select('user_id, role').eq('team_id', teamId),
      isOwner ? supabase.from('team_invites').select('id, user_id').eq('team_id', teamId) : Promise.resolve({ data: [], error: null }),
    ])
    if (m.error) throw m.error
    return { members: (m.data ?? []) as TeamMember[], invites: (i.data ?? []) as PendingInvite[] }
  })

  async function run(id: string, fn: () => PromiseLike<{ error: unknown }>, done?: string) {
    setBusyId(id)
    const { error } = await fn()
    setBusyId(null)
    if (error) {
      toast.error(friendlyError(error))
      return false
    }
    if (done) toast.success(done)
    await team.mutate()
    void refreshTeamMembers(teamId)
    return true
  }

  const supabase = createClient()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isOwner ? 'Team settings' : channel.team_name}</DialogTitle>
          <DialogDescription>
            {isPublic
              ? `Public team. Anyone in ${community.name} can join and read it.`
              : 'Invite-only team. Messages are visible only to the people listed here.'}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const next = name.trim()
              if (next.length < 2 || next === channel.team_name) return
              const ok = await run('name', () => supabase.rpc('rename_team', { p_team: teamId, p_name: next }), 'Team renamed')
              if (ok) {
                refreshChannels()
                void refreshTeamRooms(community.id)
              }
            }}
          >
            <Label htmlFor="team-rename">Name</Label>
            <div className="flex gap-2">
              <Input
                id="team-rename"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={60}
                required
                autoComplete="off"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={busyId === 'name' || name.trim().length < 2 || name.trim() === channel.team_name}
              >
                {busyId === 'name' && <Loader2 className="animate-spin" aria-hidden />}
                Save
              </Button>
            </div>
          </form>
        )}

        {isOwner && (
          <TeamImagesEditor
            teamId={teamId}
            onChanged={() => {
              refreshChannels()
              void refreshTeamRooms(community.id)
              void refreshTeamImages(teamId)
            }}
          />
        )}

        {isOwner && onEditWelcome && (
          <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Welcome note</span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pinned at the top of the team and shown in the Teams list. Say what you&apos;re building and how people
                can help.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={onEditWelcome}>
              Edit
            </Button>
          </div>
        )}

        {isOwner && (
          <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="team-visibility">Invite-only</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isPublic
                  ? 'Hide this team so only people you invite can join. Everyone here stays.'
                  : 'Turn off to make it public. Anyone who joins can read earlier messages too.'}
              </p>
            </div>
            <Switch
              id="team-visibility"
              checked={!isPublic}
              disabled={busyId === 'visibility'}
              onCheckedChange={async (inviteOnly) => {
                const ok = await run('visibility', () =>
                  supabase.rpc('set_team_visibility', { p_team: teamId, p_visibility: inviteOnly ? 'private' : 'public' }),
                )
                if (ok) {
                  refreshChannels()
                  void refreshTeamRooms(community.id)
                }
              }}
            />
          </div>
        )}

        {onInvite && (isOwner || isPublic) && (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => {
              onOpenChange(false)
              onInvite()
            }}
          >
            <UserPlus aria-hidden />
            Invite people
          </Button>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            Members · {team.data?.members.length ?? '…'}
          </h3>
          {team.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <ul className="flex max-h-64 flex-col overflow-y-auto">
            {team.data?.members.map((m) => {
              const p = profileById(m.user_id)
              const self = m.user_id === userId
              return (
                <li key={m.user_id} className="flex items-center gap-2 py-1.5">
                  <Avatar name={p?.display_name ?? '?'} url={p?.avatar_url} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p?.display_name ?? 'Member'}
                    {self && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  {m.role === 'owner' && <span className="font-mono text-[11px] text-muted-foreground">owner</span>}
                  {isOwner && !self && (
                    <>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyId === m.user_id}
                        onClick={() =>
                          run(m.user_id, () =>
                            supabase.rpc('set_team_role', {
                              p_team: teamId,
                              p_user: m.user_id,
                              p_role: m.role === 'owner' ? 'member' : 'owner',
                            }),
                          )
                        }
                      >
                        {m.role === 'owner' ? 'Make member' : 'Make owner'}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        disabled={busyId === m.user_id}
                        onClick={() =>
                          run(
                            m.user_id,
                            () => supabase.rpc('remove_team_member', { p_team: teamId, p_user: m.user_id }),
                            `Removed ${p?.display_name ?? 'member'}`,
                          )
                        }
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {isOwner && (team.data?.invites.length ?? 0) > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Invited</h3>
            <ul className="flex flex-col">
              {team.data!.invites.map((i) => {
                const p = profileById(i.user_id)
                return (
                  <li key={i.id} className="flex items-center gap-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{p?.display_name ?? 'Member'}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busyId === i.id}
                      onClick={() => run(i.id, () => supabase.rpc('cancel_team_invite', { p_invite: i.id }))}
                    >
                      Cancel invite
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              const ok = await run(userId, () => supabase.rpc('remove_team_member', { p_team: teamId, p_user: userId }))
              if (ok) {
                onOpenChange(false)
                openChannel(null)
                refreshChannels()
                void refreshTeamRooms(community.id)
              }
            }}
          >
            Leave team
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
