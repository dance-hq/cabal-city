'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, Bug, Hammer, MessageSquare, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { githubUrl } from '@/lib/config'
import { ago } from '@/lib/time'
import { arrangeIdeas, shipHeading, shortDate, type BoardTab, type Idea, type Ship } from '@/lib/board'
import { CabalStar, GithubLink, StatusLabel, VoteButton, useBoard, useShips } from './board-parts'
import { Avatar } from './avatar'
import { PageHeader, Segmented } from './page-header'
import { IdeaDetail } from './idea-detail'
import { ShipDialog } from './ship-dialog'
import { SuggestDialog } from './suggest-dialog'
import { FeedbackDialog } from './feedback-dialog'
import { useCabal } from './store'

// The old feedback box hands ideas over to the board, text and all.
type Draft = { title: string; body: string }
let pendingDraft: Draft | null = null
export function suggestOnBoard(draft: Draft) {
  pendingDraft = draft
  window.dispatchEvent(new Event('cabal:suggest'))
}

export function BuildCabal({ compact }: { compact?: boolean }) {
  const { open } = useCabal()
  const board = useBoard()
  const ships = useShips()
  const [tab, setTab] = useState<BoardTab>('popular')
  const [openIdea, setOpenIdea] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState<Draft | null>(null)
  const [reporting, setReporting] = useState(false)

  useEffect(() => {
    const take = () => {
      if (!pendingDraft) return
      setSuggesting(pendingDraft)
      pendingDraft = null
    }
    take()
    window.addEventListener('cabal:suggest', take)
    return () => window.removeEventListener('cabal:suggest', take)
  }, [])

  const ideas = board.data ?? []
  const idea = openIdea ? ideas.find((i) => i.id === openIdea) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader
        title="Build Cabal"
        icon={<Hammer className="size-4 text-muted-foreground" aria-hidden />}
        compact={compact}
        onBack={() => (openIdea ? setOpenIdea(null) : open(null))}
        backLabel={openIdea ? 'All ideas' : 'Back to everyone'}
      >
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bug className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Report a bug</span>
          <span className="sr-only sm:hidden">Report a bug</span>
        </button>
        <button
          type="button"
          onClick={() => setSuggesting({ title: '', body: '' })}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Suggest an improvement</span>
          <span className="sm:hidden">Suggest</span>
        </button>
      </PageHeader>

      <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-6">
          {openIdea ? (
            <IdeaDetail
              ideaId={openIdea}
              idea={idea}
              loading={board.isLoading}
              ship={ships.data?.find((s) => s.idea_id === openIdea)}
              onBack={() => setOpenIdea(null)}
            />
          ) : (
            <>
              <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
                Cabal is open source and shaped by the people who use it. Suggest what should get better, back the ideas you
                want, and see what shipped.
                {githubUrl && (
                  <>
                    {' '}
                    <a
                      href={githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      The code is on GitHub
                      <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  </>
                )}
              </p>

              <TodaysShip ships={ships.data} loading={ships.isLoading} onOpenIdea={setOpenIdea} />

              <section className="flex flex-col gap-3" aria-label="Community ideas">
                <Segmented
                  label="Sort ideas"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'popular', label: 'Popular' },
                    { value: 'recent', label: 'Recent' },
                    { value: 'shipped', label: 'Shipped' },
                  ]}
                />
                {tab === 'shipped' ? (
                  <ShipList ships={ships.data} loading={ships.isLoading} onOpenIdea={setOpenIdea} />
                ) : board.isLoading ? (
                  <RowsSkeleton />
                ) : board.error ? (
                  <p className="text-sm text-muted-foreground">
                    Couldn&apos;t load ideas.{' '}
                    <button type="button" onClick={() => board.mutate()} className="text-foreground underline underline-offset-2">
                      Try again
                    </button>
                  </p>
                ) : (
                  <IdeaList ideas={arrangeIdeas(ideas, tab)} onOpen={setOpenIdea} onSuggest={() => setSuggesting({ title: '', body: '' })} />
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <FeedbackDialog open={reporting} onOpenChange={setReporting} />
      <SuggestDialog
        draft={suggesting}
        onClose={() => setSuggesting(null)}
        onOpenIdea={(id) => {
          setSuggesting(null)
          setOpenIdea(id)
        }}
      />
    </div>
  )
}

function TodaysShip({
  ships,
  loading,
  onOpenIdea,
}: {
  ships: Ship[] | undefined
  loading: boolean
  onOpenIdea: (id: string) => void
}) {
  const { isAdmin, profileById } = useCabal()
  const [posting, setPosting] = useState(false)
  const latest = ships?.[0]
  const by = latest?.suggested_by ? profileById(latest.suggested_by) : undefined

  return (
    <section aria-label="Latest improvement" className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <CabalStar className="size-3.5 shrink-0" />
        <h2 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
          {latest ? `${shipHeading(latest.shipped_at)} · ${shortDate(latest.shipped_at)}` : 'Today’s ship'}
        </h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setPosting(true)}
            className="ml-auto rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Post a ship
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          <div className="h-5 w-2/3 animate-pulse rounded bg-accent" />
          <div className="h-10 w-full animate-pulse rounded bg-accent/60" />
        </div>
      ) : !latest ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nothing has shipped from here yet. Each improvement shows up here the day it&apos;s released.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-lg leading-snug font-semibold text-balance">{latest.title}</p>
          {latest.body && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{latest.body}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {by && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={by.display_name ?? '?'} url={by.avatar_url} size={18} />
                Suggested by {by.display_name ?? by.username}
              </span>
            )}
            {latest.idea_id && (
              <button
                type="button"
                onClick={() => onOpenIdea(latest.idea_id!)}
                className="rounded underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                See the idea
              </button>
            )}
            {latest.github_url && <GithubLink url={latest.github_url} />}
          </div>
        </div>
      )}
      <ShipDialog open={posting} onOpenChange={setPosting} />
    </section>
  )
}

function IdeaList({ ideas, onOpen, onSuggest }: { ideas: Idea[]; onOpen: (id: string) => void; onSuggest: () => void }) {
  const { profileById, userId } = useCabal()
  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed px-4 py-6">
        <p className="text-sm font-medium">No open ideas yet</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          What would make Cabal better for you? A title is enough to start.
        </p>
        <button
          type="button"
          onClick={onSuggest}
          className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3.5" aria-hidden />
          Suggest an improvement
        </button>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y border-y">
      {ideas.map((i) => {
        const author = profileById(i.author_id)
        return (
          <li key={i.id} className={cn('flex items-center gap-3 py-3', i.hidden && 'opacity-50')}>
            <VoteButton idea={i} />
            <button
              type="button"
              onClick={() => onOpen(i.id)}
              className="-my-1 flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm leading-snug font-medium text-pretty">
                {i.title}
                {i.hidden && <span className="font-normal text-muted-foreground"> (hidden)</span>}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <StatusLabel status={i.status} />
                <span aria-hidden>·</span>
                <span>{i.author_id === userId ? 'You' : (author?.display_name ?? 'A member')}</span>
                <span aria-hidden>·</span>
                <span>{ago(i.created_at)}</span>
                {i.comments > 0 && (
                  <span className="inline-flex items-center gap-1" aria-label={`${i.comments} comments`}>
                    <span aria-hidden>·</span>
                    <MessageSquare className="size-3" aria-hidden />
                    {i.comments}
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

function ShipList({
  ships,
  loading,
  onOpenIdea,
}: {
  ships: Ship[] | undefined
  loading: boolean
  onOpenIdea: (id: string) => void
}) {
  const { profileById } = useCabal()
  if (loading) return <RowsSkeleton />
  if (!ships?.length) {
    return <p className="py-2 text-sm text-muted-foreground">Nothing has shipped yet. It&apos;ll be listed here when it does.</p>
  }
  return (
    <ul className="flex flex-col divide-y border-y">
      {ships.map((s) => {
        const by = s.suggested_by ? profileById(s.suggested_by) : undefined
        return (
          <li key={s.id} className="flex gap-4 py-3">
            <time dateTime={s.shipped_at} className="w-14 shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">
              {shortDate(s.shipped_at)}
            </time>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-sm leading-snug font-medium text-pretty">{s.title}</p>
              {s.body && <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">{s.body}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {by && <span>Suggested by {by.display_name ?? by.username}</span>}
                {s.idea_id && (
                  <button
                    type="button"
                    onClick={() => onOpenIdea(s.idea_id!)}
                    className="rounded underline decoration-border underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Discussion
                  </button>
                )}
                {s.github_url && <GithubLink url={s.github_url} />}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-accent/60" />
      ))}
    </div>
  )
}
