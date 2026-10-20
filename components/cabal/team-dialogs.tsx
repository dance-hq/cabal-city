'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from './avatar'
import { useCabal } from './store'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import type { Channel } from '@/lib/types'

export function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { community, open: openChannel } = useCabal()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const { refreshChannels } = useCabal()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const supabase = createClient()
    const { data: teamId, error } = await supabase.rpc('create_team', { p_community: community.id, p_name: name.trim() })
    if (error) {
      setBusy(false)
      toast.error(friendlyError(error))
      return
    }
    const { data } = await supabase.rpc('my_channels', { p_community: community.id })
    refreshChannels()
    const ch = (data as Channel[] | null)?.find((c) => c.team_id === teamId)
    setBusy(false)
    setName('')
    onOpenChange(false)
    if (ch) openChannel(ch.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              A private room for your startup or crew. Only people you invite can see it or read its messages.
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Create team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type TeamMember = { user_id: string; role: 'owner' | 'member' }
type PendingInvite = { id: string; user_id: string }

export function TeamManageDialog({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  channel: Channel
}) {
  const { userId, members, profileById, refreshChannels, open: openChannel } = useCabal()
  const teamId = channel.team_id!
  const isOwner = channel.team_role === 'owner'
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const team = useSWR(open ? ['team', teamId] : null, async () => {
    const supabase = createClient()
    const [m, i] = await Promise.all([
      supabase.from('team_members').select('user_id, role').eq('team_id', teamId),
      isOwner ? supabase.from('team_invites').select('id, user_id').eq('team_id', teamId) : Promise.resolve({ data: [], error: null }),
    ])
    if (m.error) throw m.error
    return { members: (m.data ?? []) as TeamMember[], invites: (i.data ?? []) as PendingInvite[] }
  })

  const inTeam = new Set(team.data?.members.map((m) => m.user_id))
  const invited = new Set(team.data?.invites.map((i) => i.user_id))
  const q = query.trim().toLowerCase()
  const candidates = members.filter(
    (m) =>
      !inTeam.has(m.user_id) &&
      !invited.has(m.user_id) &&
      q.length > 0 &&
      (m.profile.display_name?.toLowerCase().includes(q) || m.profile.username?.toLowerCase().includes(q)),
  )

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
    return true
  }

  const supabase = createClient()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channel.team_name}</DialogTitle>
          <DialogDescription>Private team. Messages are visible only to the people listed here.</DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="team-invite-search">Invite a teammate</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="team-invite-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search community members"
                className="pl-8"
              />
            </div>
            {q && (
              <ul className="flex max-h-40 flex-col overflow-y-auto rounded-md border">
                {candidates.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No matching members.</li>}
                {candidates.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2 px-3 py-1.5">
                    <Avatar name={m.profile.display_name ?? ''} url={m.profile.avatar_url} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {m.profile.display_name}{' '}
                      <span className="font-mono text-xs text-muted-foreground">@{m.profile.username}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Invite ${m.profile.display_name} (@${m.profile.username})`}
                      disabled={busyId === m.user_id}
                      onClick={async () => {
                        const ok = await run(
                          m.user_id,
                          () => supabase.rpc('invite_to_team', { p_team: teamId, p_user: m.user_id }),
                          `Invited ${m.profile.display_name}`,
                        )
                        if (ok) setQuery('')
                      }}
                    >
                      Invite
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            Members · {team.data?.members.length ?? '…'}
          </h3>
          {team.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
          <ul className="flex flex-col">
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
