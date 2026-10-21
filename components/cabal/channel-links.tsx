'use client'

import { useCallback, useEffect, useState } from 'react'
import useSWR, { mutate as mutateGlobal } from 'swr'
import { Hash, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { config } from '@/lib/config'
import { channelName, type LinkableChannel } from '@/lib/channel-links'
import { TeamIcon, openTeam } from './team-dialogs'
import { useCabal } from './store'

const linkablesKey = (communityId: string) => ['linkable-channels', communityId] as const

export function useLinkableChannels() {
  const { community } = useCabal()
  return useSWR(
    linkablesKey(community.id),
    async () => {
      const { data, error } = await createClient().rpc('linkable_channels', { p_community: community.id })
      if (error) throw error
      return (data ?? []) as LinkableChannel[]
    },
    { refreshInterval: 120_000, dedupingInterval: 10_000 },
  )
}

// The app's own addresses, so a pasted link to a conversation reads as a channel.
export function appOrigins(): string[] {
  const origins = new Set<string>()
  if (typeof window !== 'undefined') origins.add(window.location.origin)
  if (config.appUrl) {
    try {
      origins.add(new URL(config.appUrl).origin)
    } catch {}
  }
  return [...origins]
}

export function channelLinkUrl(channelId: string) {
  const base = config.appUrl || window.location.origin
  return `${base}/app?c=${channelId}`
}

export async function copyChannelLink(channelId: string, name: string) {
  const link = channelLinkUrl(channelId)
  try {
    await navigator.clipboard.writeText(link)
    toast.success(`Link to ${name} copied`, {
      description: 'Paste it in any conversation, or send it to someone outside Cabal.',
      duration: 3500,
    })
  } catch {
    toast.message(`Link to ${name}`, { description: link, closeButton: true, duration: Infinity })
  }
}

// Opens whatever a channel link points at: straight in if you're already
// there, a short "join?" step for public teams, an honest note otherwise.
export function useOpenLinkedChannel() {
  const { channels, open, refreshChannels, community } = useCabal()
  const linkables = useLinkableChannels()
  const [joining, setJoining] = useState<LinkableChannel | null>(null)

  const go = useCallback(
    async (channelId: string) => {
      if (channels.some((c) => c.id === channelId)) {
        open(channelId)
        return
      }
      const list = linkables.data ?? (await linkables.mutate()) ?? []
      const target = list.find((c) => c.id === channelId)
      if (!target) {
        toast.message("You can't open that one", { description: "It's invite-only, or it was removed." })
        return
      }
      if (target.kind === 'team' && !target.joined) {
        setJoining(target)
        return
      }
      refreshChannels()
      open(channelId)
    },
    [channels, open, refreshChannels, linkables],
  )

  const dialog = (
    <JoinTeamDialog
      team={joining}
      onOpenChange={(o) => !o && setJoining(null)}
      onJoined={async (t) => {
        await openTeam(community.id, t.team_id!, open, refreshChannels)
        void mutateGlobal(linkablesKey(community.id))
        setJoining(null)
      }}
    />
  )
  return { go, dialog }
}

function JoinTeamDialog({
  team,
  onOpenChange,
  onJoined,
}: {
  team: LinkableChannel | null
  onOpenChange: (o: boolean) => void
  onJoined: (t: LinkableChannel) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={!!team} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {team && (
          <>
            <DialogHeader>
              <DialogTitle>{`Join ${team.team_name}?`}</DialogTitle>
              <DialogDescription>
                {team.member_count ?? 0} {team.member_count === 1 ? 'member' : 'members'} · public team
              </DialogDescription>
            </DialogHeader>
            {team.welcome && (
              <p className="text-sm leading-relaxed text-pretty whitespace-pre-wrap text-foreground/85">{team.welcome}</p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Not now
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const { error } = await createClient().rpc('join_team', { p_team: team.team_id })
                  if (error) {
                    setBusy(false)
                    toast.error(friendlyError(error))
                    return
                  }
                  await onJoined(team)
                  setBusy(false)
                }}
              >
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Join and open
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ChannelChip({ channelId }: { channelId: string }) {
  const { channels } = useCabal()
  const linkables = useLinkableChannels()
  const { go, dialog } = useOpenLinkedChannel()

  const mine = channels.find((c) => c.id === channelId)
  const known = linkables.data?.find((c) => c.id === channelId)
  const target = mine && mine.kind !== 'dm' ? { kind: mine.kind, slug: mine.slug, team_name: mine.team_name, team_visibility: mine.team_visibility } : known

  // A link to something new (a team made a minute ago) shows up after one refresh.
  const missing = !target && !!linkables.data
  const { mutate } = linkables
  useEffect(() => {
    if (missing) void mutate()
  }, [missing, mutate])

  if (!target) {
    return (
      <span
        className="rounded-sm bg-muted px-1 text-muted-foreground"
        title={linkables.isLoading ? undefined : "Invite-only, or it was removed"}
      >
        <Lock className="mr-0.5 inline size-3 -translate-y-px" aria-hidden />
        {linkables.isLoading ? 'channel' : 'private channel'}
      </span>
    )
  }

  const name = channelName(target)
  return (
    <>
      <button
        type="button"
        onClick={() => go(channelId)}
        className={cn(
          'rounded-sm bg-mark/12 px-1 font-medium text-mark hover:bg-mark/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          target.kind === 'room' && 'font-mono text-[0.95em]',
        )}
      >
        {target.kind === 'team' ? (
          <TeamIcon visibility={target.team_visibility} className="mr-0.5 inline size-3 -translate-y-px" />
        ) : (
          <Hash className="inline size-3 -translate-y-px" aria-hidden />
        )}
        {name}
        <span className="sr-only">{target.kind === 'team' ? ' team' : ' channel'}</span>
      </button>
      {dialog}
    </>
  )
}
