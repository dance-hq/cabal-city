'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { useCabal } from './store'
import { openTeam } from './team-dialogs'
import { TeamMark, useTeamImages } from './team-images'
import type { TeamVisibility } from '@/lib/types'

type Place = {
  kind: 'team' | 'room'
  channel_id: string | null
  team_id: string | null
  team_name: string | null
  visibility: TeamVisibility | null
  role: 'owner' | 'member' | 'admin' | null
  joined: boolean
}

type Team = Place & { kind: 'team'; team_id: string }

// member_places also returns the rooms someone has posted in; a profile only
// shows their teams.
function useTeams(communityId: string, personId: string) {
  return useSWR(['member-places', communityId, personId], async () => {
    const { data, error } = await createClient().rpc('member_places', { p_community: communityId, p_user: personId })
    if (error) throw error
    return ((data ?? []) as Place[])
      .filter((p): p is Team => p.kind === 'team' && p.team_id !== null)
      .sort((a, b) => {
        if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1
        return (a.team_name ?? '').localeCompare(b.team_name ?? '')
      })
  })
}

function TeamRowMark({ teamId, visibility }: { teamId: string; visibility: TeamVisibility | null }) {
  const logo = useTeamImages(teamId).data?.logo_url ?? null
  return <TeamMark logo={logo} visibility={visibility} size={24} className="rounded-md" />
}

// The teams someone is on, on their profile card. Picking one takes you there
// (joining a public team first if you're not on it).
export function MemberPlaces({ personId, self, onNavigate }: { personId: string; self: boolean; onNavigate: () => void }) {
  const { community, open, refreshChannels } = useCabal()
  const teams = useTeams(community.id, personId)
  const [busy, setBusy] = useState<string | null>(null)

  async function go(t: Team) {
    if (t.joined) {
      if (!t.channel_id) return
      onNavigate()
      open(t.channel_id)
      return
    }
    setBusy(t.team_id)
    const { error } = await createClient().rpc('join_team', { p_team: t.team_id })
    if (error) {
      setBusy(null)
      toast.error(friendlyError(error))
      void teams.mutate()
      return
    }
    await openTeam(community.id, t.team_id, open, refreshChannels)
    setBusy(null)
    onNavigate()
  }

  if (teams.error) return <p className="text-xs text-muted-foreground">{"Couldn't load their teams."}</p>
  if (!teams.data) return null
  if (teams.data.length === 0 && !self) return null

  return (
    <section className="flex w-full flex-col gap-1" aria-labelledby={`teams-${personId}`}>
      <h3 id={`teams-${personId}`} className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        Teams
      </h3>
      {teams.data.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{"You're not on a team yet."}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {teams.data.map((t) => {
            const label = t.team_name ?? 'Team'
            const tag = t.role === 'admin' ? 'Admin' : t.role === 'owner' ? 'Owner' : null
            const spoken = [`${label} team`, tag, t.joined ? null : 'you can join'].filter(Boolean).join(', ')
            return (
              <li key={t.team_id}>
                <button
                  type="button"
                  onClick={() => go(t)}
                  disabled={busy !== null}
                  aria-label={spoken}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <TeamRowMark teamId={t.team_id} visibility={t.visibility} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {busy === t.team_id ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    !t.joined && <span className="shrink-0 text-xs font-medium text-flag">Join</span>
                  )}
                  {tag && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{tag}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
