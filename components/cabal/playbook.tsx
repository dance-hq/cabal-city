'use client'

import useSWR from 'swr'
import { ArrowUpRight, BookOpen, Check, Hash, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { PLAYBOOK, PRODUCT_HUNT_URL, noticedDone, withItem, type Noticed, type PlaybookId, type PlaybookItem } from '@/lib/playbook'
import { useCabal } from './store'
import { useWorkSession } from './work-session'

const INTRO = 'A few good ways to settle in. Do any of them, all of them, or none.'

export function usePlaybook() {
  const { community, userId, settings, updateSettings } = useCabal()
  const progress = useSWR(['playbook-progress', community.id, userId], async () => {
    const { data, error } = await createClient().rpc('playbook_progress', { p_community: community.id })
    if (error) throw error
    return ((data as Noticed[] | null) ?? [])[0] ?? null
  })
  const noticed = noticedDone(progress.data)
  const ticked = new Set(settings.playbook_done)
  const isDone = (id: PlaybookId) => noticed.has(id) || ticked.has(id)
  return {
    isDone,
    wasNoticed: (id: PlaybookId) => noticed.has(id),
    allDone: PLAYBOOK.every((i) => isDone(i.id)),
    hidden: settings.playbook_hidden,
    tick: (id: PlaybookId, on: boolean) => updateSettings({ playbook_done: withItem(settings.playbook_done, id, on) }),
    setHidden: (hidden: boolean) => updateSettings({ playbook_hidden: hidden }),
    recheck: () => void progress.mutate(),
  }
}

// The four items. `onLeave` runs when an action takes you somewhere else.
function PlaybookList({ onLeave }: { onLeave?: () => void }) {
  const playbook = usePlaybook()
  return (
    <ul className="flex flex-col divide-y">
      {PLAYBOOK.map((item) => (
        <PlaybookRow key={item.id} item={item} playbook={playbook} onLeave={onLeave} />
      ))}
    </ul>
  )
}

function PlaybookRow({
  item,
  playbook,
  onLeave,
}: {
  item: PlaybookItem
  playbook: ReturnType<typeof usePlaybook>
  onLeave?: () => void
}) {
  const done = playbook.isDone(item.id)
  const noticed = playbook.wasNoticed(item.id)
  return (
    <li className="flex gap-3 py-3.5 first:pt-1 last:pb-1">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-disabled={noticed || undefined}
        aria-label={noticed ? `${item.title}: done` : `Mark "${item.title}" ${done ? 'not done' : 'done'}`}
        title={noticed ? 'Done. Cabal noticed.' : undefined}
        onClick={() => !noticed && playbook.tick(item.id, !done)}
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-ring',
          done ? 'border-online bg-online text-background' : 'border-muted-foreground/40 hover:border-foreground',
          noticed && 'cursor-default',
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} aria-hidden />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('text-sm leading-snug font-medium', done && 'text-muted-foreground')}>{item.title}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">{item.body}</p>
        {item.note && <p className="text-xs leading-relaxed text-muted-foreground/80 text-pretty">{item.note}</p>}
        <Actions id={item.id} done={done} onLeave={onLeave} recheck={playbook.recheck} />
      </div>
    </li>
  )
}

const ACTION =
  'inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'

function Actions({ id, done, onLeave, recheck }: { id: PlaybookId; done: boolean; onLeave?: () => void; recheck: () => void }) {
  const { channels, open } = useCabal()
  const session = useWorkSession()
  const room = (slug: string) => channels.find((c) => c.kind === 'room' && c.slug === slug)

  const roomLink = (slug: string) => {
    const c = room(slug)
    if (!c) return null
    return (
      <button
        type="button"
        className={cn(ACTION, 'font-mono')}
        onClick={() => {
          open(c.id)
          onLeave?.()
        }}
      >
        <Hash className="size-3" aria-hidden />
        {slug}
      </button>
    )
  }

  let actions: React.ReactNode = null
  if (id === 'product-hunt') {
    actions = (
      <a href={PRODUCT_HUNT_URL} target="_blank" rel="noopener noreferrer" className={ACTION}>
        Open Product Hunt
        <ArrowUpRight className="size-3" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    )
  } else if (id === 'introduce') {
    actions = roomLink('introductions')
  } else if (id === 'lock-in') {
    if (done || !session.ready) return null
    actions =
      session.status === 'none' ? (
        <button
          type="button"
          className={ACTION}
          onClick={async () => {
            if (await session.lockIn()) {
              recheck()
              onLeave?.()
            }
          }}
        >
          Lock in now
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">You&apos;re locked in right now.</span>
      )
  } else if (id === 'support') {
    actions = (
      <>
        {roomLink('launches')}
        {roomLink('asks')}
      </>
    )
  }
  return actions ? <div className="mt-1.5 flex flex-wrap items-center gap-2">{actions}</div> : null
}

// Home: a quiet card for members who haven't tucked it away.
export function PlaybookCard() {
  const playbook = usePlaybook()
  if (playbook.hidden) return null

  function hide() {
    void playbook.setHidden(true)
    toast.message('Playbook tucked away', { description: 'It\u2019s always at the bottom of Home if you want it.' })
  }

  return (
    <section aria-labelledby="playbook-card-title" className="rounded-lg border bg-card/50 px-4 pt-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="playbook-card-title" className="text-sm font-semibold">
            The Cabal Playbook
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">{INTRO}</p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="-mt-0.5 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Hide the Playbook"
          title="Hide"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2">
        <PlaybookList />
      </div>
      {playbook.allDone && (
        <div className="mt-2 flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-[13px] text-muted-foreground">That&apos;s the whole Playbook. Enjoy the work.</p>
          <button
            type="button"
            onClick={hide}
            className="shrink-0 rounded px-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tuck it away
          </button>
        </div>
      )}
    </section>
  )
}

// Home: always there once the card is hidden.
export function PlaybookLink() {
  const { settings, setPlaybookOpen } = useCabal()
  if (!settings.playbook_hidden) return null
  return (
    <button
      type="button"
      onClick={() => setPlaybookOpen(true)}
      className="-mx-2 flex items-center gap-2 self-start rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BookOpen className="size-3.5 shrink-0" aria-hidden />
      The Cabal Playbook
    </button>
  )
}

export function PlaybookDialog() {
  const { playbookOpen, setPlaybookOpen, settings, updateSettings } = useCabal()
  return (
    <Dialog open={playbookOpen} onOpenChange={setPlaybookOpen}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="px-5 pt-5 pb-2">
          <DialogTitle>The Cabal Playbook</DialogTitle>
          <DialogDescription className="mt-1 text-[13px] leading-relaxed text-pretty">{INTRO}</DialogDescription>
        </div>
        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <PlaybookList onLeave={() => setPlaybookOpen(false)} />
        </div>
        {settings.playbook_hidden && (
          <div className="border-t px-5 py-3">
            <button
              type="button"
              onClick={() => void updateSettings({ playbook_hidden: false })}
              className="rounded px-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Keep it on Home
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// #launches: one quiet line until you're set up on Product Hunt.
export function LaunchesNote() {
  const playbook = usePlaybook()
  if (playbook.isDone('product-hunt')) return null
  return (
    <div className="mx-4 mt-3 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <span className="min-w-0 flex-1 text-pretty">
        New to Product Hunt? An account makes it easy to try and support what people here launch.
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <a
          href={PRODUCT_HUNT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Product Hunt
          <ArrowUpRight className="size-3" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <button
          type="button"
          onClick={() => void playbook.tick('product-hunt', true)}
          className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          I&apos;m set up
        </button>
      </span>
    </div>
  )
}
