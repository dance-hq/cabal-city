'use client'

import useSWR from 'swr'
import { ArrowUpRight, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { STAR_POINTS } from '@/lib/brand'
import { IDEA_STATUS_LABEL, githubLabel, type Idea, type IdeaStatus, type Ship } from '@/lib/board'

export const boardKey = ['idea-board'] as const
export const shipsKey = ['ships'] as const

export function useBoard() {
  return useSWR(
    boardKey,
    async () => {
      const { data, error } = await createClient().rpc('idea_board')
      if (error) throw error
      return data as Idea[]
    },
    { refreshInterval: 60_000 },
  )
}

export function useShips() {
  return useSWR(
    shipsKey,
    async () => {
      const { data, error } = await createClient().rpc('recent_ships', { p_limit: 30 })
      if (error) throw error
      return data as Ship[]
    },
    { refreshInterval: 120_000 },
  )
}

export function useVote() {
  const board = useBoard()
  return async (idea: Pick<Idea, 'id' | 'voted' | 'status'>) => {
    if (idea.status === 'shipped' && !idea.voted) return
    board.mutate(
      (cur) =>
        cur?.map((i) => (i.id === idea.id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i)),
      { revalidate: false },
    )
    const { error } = await createClient().rpc('toggle_idea_vote', { p_idea: idea.id })
    if (error) toast.error(friendlyError(error))
    board.mutate()
  }
}

export function CabalStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon points={STAR_POINTS} fill="var(--brand-star)" />
    </svg>
  )
}

export function GithubLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {githubLabel(url)}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  )
}

export function StatusLabel({ status }: { status: IdeaStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[10.5px] tracking-wider uppercase',
        status === 'building' ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {status === 'building' && <span className="size-1.5 rounded-full bg-flag" aria-hidden />}
      {status === 'shipped' && <CabalStar className="size-2.5" />}
      {IDEA_STATUS_LABEL[status]}
    </span>
  )
}

export function VoteButton({ idea, size = 'sm' }: { idea: Idea; size?: 'sm' | 'lg' }) {
  const vote = useVote()
  const shipped = idea.status === 'shipped'
  const label = shipped
    ? `${idea.votes} supported this`
    : idea.voted
      ? `You support this. ${idea.votes} total. Remove your support`
      : `Support this idea. ${idea.votes} so far`
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        vote(idea)
      }}
      disabled={shipped && !idea.voted}
      aria-pressed={idea.voted}
      aria-label={label}
      title={label}
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-md border font-mono leading-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
        size === 'sm' ? 'h-11 w-10 gap-0.5 text-xs' : 'h-14 w-14 gap-1 text-sm',
        idea.voted ? 'border-flag/60 bg-flag/15 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <ChevronUp className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />
      {idea.votes}
    </button>
  )
}
