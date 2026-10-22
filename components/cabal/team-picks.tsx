'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCabal } from './store'
import { BrowseTeamsDialog, CreateTeamDialog, Founders, MakersTag, activeLabel, openTeam, useTeamRooms } from './team-dialogs'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { isMakersTeam } from '@/lib/config'
import { isOwnTeamImageUrl } from '@/lib/team-images'
import type { TeamRoom } from '@/lib/types'
import { TeamBanner, TeamMark } from './team-images'

const PICKS = 3
const SETTLED_MS = 24 * 60 * 60 * 1000
const dismissKey = (userId: string) => `cabal:team-picks-dismissed:${userId}`

// The makers' team first, then teams that say what they're about, then the
// liveliest.
export function pickTeams(rooms: TeamRoom[]): TeamRoom[] {
  const activity = (r: TeamRoom) => Date.parse(r.last_message_at ?? r.created_at) || 0
  return rooms
    .filter((r) => r.visibility === 'public' && !r.joined)
    .sort(
      (a, b) =>
        Number(isMakersTeam(b.name)) - Number(isMakersTeam(a.name)) ||
        Number(!!b.welcome) - Number(!!a.welcome) ||
        activity(b) - activity(a),
    )
    .slice(0, PICKS)
}

// A few teams to follow, offered once someone has settled in: after they've
// said something, or from their second day. Never during sign-up, never once
// they're on a team, and "Not now" means not again.
export function TeamPicks() {
  const { community, userId, members, channels, open: openChannel, refreshChannels } = useCabal()
  const rooms = useTeamRooms(community.id)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(dismissKey(userId)) === '1'
    } catch {
      return false
    }
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [creating, setCreating] = useState(false)

  const onATeam = channels.some((c) => c.kind === 'team')
  const me = members.find((m) => m.user_id === userId)
  const settledByTime = !!me && Date.now() - Date.parse(me.joined_at) > SETTLED_MS
  const eligible = !dismissed && !onATeam && !!me

  const spoke = useSWR(eligible && !settledByTime ? ['has-spoken', userId] : null, async () => {
    const { data } = await createClient()
      .from('messages')
      .select('id')
      .eq('author_id', userId)
      .eq('kind', 'user')
      .limit(1)
    return (data?.length ?? 0) > 0
  })

  const picks = pickTeams(rooms.data ?? [])
  if (!eligible || !(settledByTime || spoke.data) || picks.length === 0) return null

  function dismiss() {
    try {
      localStorage.setItem(dismissKey(userId), '1')
    } catch {}
    setDismissed(true)
  }

  async function join(room: TeamRoom) {
    setBusyId(room.id)
    const { error } = await createClient().rpc('join_team', { p_team: room.id })
    if (error) {
      setBusyId(null)
      toast.error(friendlyError(error))
      void rooms.mutate()
      return
    }
    await openTeam(community.id, room.id, openChannel, refreshChannels)
    setBusyId(null)
  }

  return (
    <section aria-labelledby="team-picks-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="team-picks-title" className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
          Teams to follow
        </h2>
        <button
          type="button"
          onClick={dismiss}
          className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Not now
        </button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
        Founders here build out loud. Join a team to follow along, say hi, or lend a hand.
      </p>
      <ul className="flex flex-col gap-2">
        {picks.map((r) => (
          <li key={r.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
            {r.banner_url && isOwnTeamImageUrl(r.banner_url) && <TeamBanner url={r.banner_url} className="h-16" />}
            <div className="flex items-start gap-3 px-3.5 py-3">
              <TeamMark logo={r.logo_url} visibility={r.visibility} size={36} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">{r.name}</span>
                  {isMakersTeam(r.name) && <MakersTag />}
                </div>
                {r.welcome && (
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-foreground/85 text-pretty">
                    {r.welcome.replace(/\s+/g, ' ')}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Founders ownerIds={r.owner_ids} />
                  <span>
                    {r.member_count} {r.member_count === 1 ? 'member' : 'members'} · {activeLabel(r.last_message_at)}
                  </span>
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={busyId !== null} onClick={() => join(r)} aria-label={`Join ${r.name}`}>
                {busyId === r.id && <Loader2 className="animate-spin" aria-hidden />}
                Join
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setBrowsing(true)}
        className="self-start rounded text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        See all teams
      </button>
      <BrowseTeamsDialog open={browsing} onOpenChange={setBrowsing} onCreate={() => setCreating(true)} />
      <CreateTeamDialog open={creating} onOpenChange={setCreating} />
    </section>
  )
}
