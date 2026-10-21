'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Hash, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { useCabal } from './store'
import { TeamIcon, openTeam } from './team-dialogs'
import type { TeamVisibility } from '@/lib/types'

type Place = {
  kind: 'team' | 'room'
  channel_id: string | null
  slug: string | null
  team_id: string | null
  team_name: string | null
  visibility: TeamVisibility | null
  role: 'owner' | 'member' | 'admin' | null
  joined: boolean
  posts: number | null
  last_posted_at: string | null
}

function usePlaces(communityId: string, personId: string) {
  return useSWR(['member-places', communityId, personId], async () => {
    const { data, error } = await createClient().rpc('member_places', { p_community: communityId, p_user: personId })
    if (error) throw error
    return ((data ?? []) as Place[]).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'team' ? -1 : 1
      if (a.kind === 'team') {
        if ((a.role === 'owner') !== (b.role === 'owner')) return a.role === 'owner' ? -1 : 1
        return (a.team_name ?? '').localeCompare(b.team_name ?? '')
      }
      return (b.posts ?? 0) - (a.posts ?? 0)
    })
  })
}

// The teams someone is on and the channels they talk in, on their profile card.
// Picking one takes you there (joining a public team first if you're not on it).
export function MemberPlaces({ personId, self, onNavigate }: { personId: string; self: boolean; onNavigate: () => void }) {
  const { community, open, refreshChannels } = useCabal()
  const places = usePlaces(community.id, personId)
  const [busy, setBusy] = useState<string | null>(null)

  async function go(p: Place) {
    if (p.kind === 'room' || p.joined) {
      if (!p.channel_id) return
      onNavigate()
      open(p.channel_id)
      return
    }
    setBusy(p.team_id)
    const { error } = await createClient().rpc('join_team', { p_team: p.team_id })
    if (error) {
      setBusy(null)
      toast.error(friendlyError(error))
      void places.mutate()
      return
    }
    await openTeam(community.id, p.team_id!, open, refreshChannels)
    setBusy(null)
    onNavigate()
  }

  if (places.error) return <p className="text-xs text-muted-foreground">{"Couldn't load their channels."}</p>
  if (!places.data) return null

  return (
    <section className="flex w-full flex-col gap-1" aria-labelledby={`places-${personId}`}>
      <h3 id={`places-${personId}`} className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        Channels &amp; teams
      </h3>
      {places.data.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {self ? "You're not on a team and haven't posted lately." : "Not on a team and hasn't posted lately."}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {places.data.map((p) => {
            const label = p.kind === 'team' ? (p.team_name ?? 'Team') : (p.slug ?? '')
            const tag = p.role === 'admin' ? 'Admin' : p.role === 'owner' ? 'Owner' : null
            const meta =
              p.kind === 'team'
                ? p.joined
                  ? null
                  : 'Join'
                : p.posts
                  ? `${p.posts} ${p.posts === 1 ? 'message' : 'messages'}`
                  : null
            const spoken = [
              p.kind === 'team' ? `${label} team` : `#${label}`,
              tag,
              meta === 'Join' ? 'you can join' : meta,
            ]
              .filter(Boolean)
              .join(', ')
            return (
              <li key={p.kind === 'team' ? `t-${p.team_id}` : `r-${p.channel_id}`}>
                <button
                  type="button"
                  onClick={() => go(p)}
                  disabled={busy !== null}
                  aria-label={spoken}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  {p.kind === 'team' ? (
                    <TeamIcon visibility={p.visibility} className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Hash className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={p.kind === 'room' ? 'min-w-0 flex-1 truncate font-mono text-[13px]' : 'min-w-0 flex-1 truncate'}>
                    {label}
                  </span>
                  {busy === p.team_id && p.kind === 'team' ? (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    meta && (
                      <span className={meta === 'Join' ? 'shrink-0 text-xs font-medium text-flag' : 'shrink-0 text-xs text-muted-foreground'}>
                        {meta}
                      </span>
                    )
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
