'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, Link2, Loader2, Search, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Avatar } from './avatar'
import { useCabal } from './store'
import { useTeamMembers } from './team-dialogs'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { config } from '@/lib/config'
import type { Channel } from '@/lib/types'

const SHOWN = 40

// Public teams: anyone on them can invite (people could join on their own
// anyway). Invite-only teams: only owners, because the invite is the access.
export function canInvite(channel: Channel) {
  return (
    channel.kind === 'team' &&
    !!channel.team_id &&
    (channel.team_role === 'owner' || channel.team_visibility === 'public')
  )
}

// A link for people who aren't on Cabal yet: signs them up for the community,
// then lands them on the team with a one-tap Join.
export async function copyTeamInviteLink(communityId: string, channel: Channel) {
  const { data, error } = await createClient().rpc('community_invite_code', { p_community: communityId })
  if (error || !data) {
    toast.error(friendlyError(error) || "Couldn't get an invite link.")
    return
  }
  const base = config.appUrl || window.location.origin
  const link = `${base}/join/${data}?c=${channel.id}`
  const name = channel.team_name ?? 'the team'
  try {
    await navigator.clipboard.writeText(link)
    toast.success('Invite link copied', {
      description: `Works for anyone, even if they're not on Cabal yet. It opens ${name} after they sign up.`,
      duration: 4000,
    })
  } catch {
    toast.message(`Invite link to ${name}`, { description: link, closeButton: true, duration: Infinity })
  }
}

export function InviteToTeamDialog({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  channel: Channel
}) {
  const { community, userId, members, statusOf, channels } = useCabal()
  const teamId = channel.team_id!
  const isOwner = channel.team_role === 'owner'
  const isPublic = channel.team_visibility === 'public'
  const allowed = canInvite(channel)
  const team = useTeamMembers(open ? teamId : null)
  // Owners can see who's already been invited; everyone else only sees what
  // they invited in this sitting.
  const pending = useSWR(open && isOwner ? ['team-invites', teamId] : null, async () => {
    const { data, error } = await createClient().from('team_invites').select('user_id').eq('team_id', teamId)
    if (error) throw error
    return new Set((data ?? []).map((i) => i.user_id as string))
  })
  const [query, setQuery] = useState('')
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const dmPartners = useMemo(
    () => new Set(channels.filter((c) => c.kind === 'dm' && c.other_user_id).map((c) => c.other_user_id!)),
    [channels],
  )
  const onTeam = useMemo(() => new Set(team.data?.map((m) => m.user_id)), [team.data])

  const q = query.trim().toLowerCase().replace(/^@/, '')
  const people = useMemo(() => {
    const rank = (id: string) => (statusOf(id) !== 'offline' ? 0 : dmPartners.has(id) ? 1 : 2)
    return members
      .filter((m) => m.user_id !== userId && !onTeam.has(m.user_id))
      .filter(
        (m) =>
          !q ||
          m.profile.display_name?.toLowerCase().includes(q) ||
          m.profile.username?.toLowerCase().includes(q) ||
          m.profile.company?.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          rank(a.user_id) - rank(b.user_id) ||
          (a.profile.display_name ?? '').localeCompare(b.profile.display_name ?? ''),
      )
  }, [members, userId, onTeam, q, statusOf, dmPartners])

  async function invite(id: string, name: string) {
    setBusyId(id)
    const { error } = await createClient().rpc('invite_to_team', { p_team: teamId, p_user: id })
    setBusyId(null)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    setSent((s) => new Set(s).add(id))
    toast.success(`Invited ${name}`, { description: `They'll see it in Cabal and can join with one tap.`, duration: 2500 })
  }

  const teamName = channel.team_name ?? 'this team'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery('')
      }}
    >
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-balance">Invite people to {teamName}</DialogTitle>
          <DialogDescription>
            {!allowed
              ? 'This team is invite-only, so only its owners can invite people. Ask one of them to add someone.'
              : isPublic
                ? `They'll get an invite in Cabal. Anyone in ${community.name} can also find it and join on their own.`
                : 'Invite-only. The people you invite are the only ones who can see or read it.'}
          </DialogDescription>
        </DialogHeader>

        {allowed && (
          <>
            <label className="relative block">
              <span className="sr-only">Search people</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, @username or company"
                className="pl-8"
                autoComplete="off"
              />
            </label>

            {team.isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
            ) : people.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm leading-relaxed text-muted-foreground">
                {q
                  ? `Nobody in ${community.name} matches "${query.trim()}".`
                  : `Everyone in ${community.name} is already on ${teamName}.`}
                {isPublic && ' Share an invite link below to bring someone new.'}
              </p>
            ) : (
              <ul className="-mx-2 flex max-h-72 flex-col overflow-y-auto" aria-label="People you can invite">
                {people.slice(0, SHOWN).map((m) => {
                  const name = m.profile.display_name ?? m.profile.username ?? 'Member'
                  const status = statusOf(m.user_id)
                  const invited = sent.has(m.user_id) || !!pending.data?.has(m.user_id)
                  const detail = m.profile.status_text || m.profile.company
                  return (
                    <li key={m.user_id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent">
                      <Avatar name={name} url={m.profile.avatar_url} size={28} status={status} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm leading-tight">
                          {name} <span className="font-mono text-xs text-muted-foreground">@{m.profile.username}</span>
                        </span>
                        {detail && <span className="truncate text-xs leading-tight text-muted-foreground">{detail}</span>}
                      </span>
                      {invited ? (
                        <span className="inline-flex h-7 shrink-0 items-center gap-1 px-2 text-xs text-muted-foreground">
                          <Check className="size-3.5" aria-hidden />
                          Invited
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId !== null}
                          onClick={() => invite(m.user_id, name)}
                          aria-label={`Invite ${name} (@${m.profile.username})`}
                        >
                          {busyId === m.user_id && <Loader2 className="animate-spin" aria-hidden />}
                          Invite
                        </Button>
                      )}
                    </li>
                  )
                })}
                {people.length > SHOWN && (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">
                    {people.length - SHOWN} more. Search to find someone.
                  </li>
                )}
              </ul>
            )}

            {isPublic && (
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">Not on Cabal yet?</span>
                  <span className="text-xs leading-relaxed text-muted-foreground text-pretty">
                    Send them a link. It signs them up and opens {teamName}.
                  </span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => copyTeamInviteLink(community.id, channel)}>
                  <Link2 aria-hidden />
                  Copy link
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// On someone's profile: invite them to a team of yours they're not on yet.
export function InviteToTeamButton({ personId, name }: { personId: string; name: string }) {
  const { channels } = useCabal()
  const mine = channels.filter(canInvite)
  const teamIds = mine.map((c) => c.team_id!)
  const theirs = useSWR(teamIds.length ? ['their-teams', personId, teamIds.join(',')] : null, async () => {
    const { data, error } = await createClient()
      .from('team_members')
      .select('team_id')
      .eq('user_id', personId)
      .in('team_id', teamIds)
    if (error) throw error
    return new Set((data ?? []).map((r) => r.team_id as string))
  })
  const [sent, setSent] = useState<Set<string>>(() => new Set())

  const onTheirs = theirs.data
  if (!onTheirs) return null
  const options = mine.filter((c) => !onTheirs.has(c.team_id!))
  if (options.length === 0) return null

  async function invite(c: Channel) {
    const { error } = await createClient().rpc('invite_to_team', { p_team: c.team_id!, p_user: personId })
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    setSent((s) => new Set(s).add(c.team_id!))
    toast.success(`Invited ${name} to ${c.team_name}`)
  }

  if (options.length === 1) {
    const c = options[0]
    const done = sent.has(c.team_id!)
    return (
      <Button variant="secondary" disabled={done} onClick={() => invite(c)}>
        {done ? <Check aria-hidden /> : <UserPlus aria-hidden />}
        {done ? 'Invited' : `Invite to ${c.team_name}`}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: 'secondary' })}>
        <UserPlus aria-hidden />
        Invite to team
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((c) => (
          <DropdownMenuItem key={c.id} disabled={sent.has(c.team_id!)} onClick={() => invite(c)}>
            {c.team_name}
            {sent.has(c.team_id!) && <span className="ml-auto text-xs text-muted-foreground">Invited</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const nudgeKey = (teamId: string) => `cabal:invite-nudge-dismissed:${teamId}`

// Shown in a team that's still just you: the moment inviting matters most.
export function TeamInviteNudge({ channel, onInvite }: { channel: Channel; onInvite: () => void }) {
  const team = useTeamMembers(channel.team_id)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(nudgeKey(channel.team_id!)) === '1'
    } catch {
      return false
    }
  })
  if (dismissed || !canInvite(channel) || !team.data || team.data.length > 1) return null

  return (
    <aside aria-label="Invite your team" className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
      <UserPlus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-pretty text-muted-foreground">
        <span className="text-foreground">{"It's just you in here so far."}</span> Invite your cofounders and
        teammates, by name or with a link if they&apos;re not on Cabal yet.
      </p>
      <Button size="sm" variant="secondary" onClick={onInvite}>
        Invite people
      </Button>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(nudgeKey(channel.team_id!), '1')
          } catch {}
          setDismissed(true)
        }}
        aria-label="Hide this suggestion"
        title="Hide this suggestion"
        className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </aside>
  )
}
