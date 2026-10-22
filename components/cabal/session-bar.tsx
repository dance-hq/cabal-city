'use client'

import { useRef, useState } from 'react'
import { ChartNoAxesColumn, Pause, Play, Target, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeSession, formatSession, shortDuration } from '@/lib/session'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { LockInPanel } from './lock-in-panel'
import { useElapsed, useWorkSession } from './work-session'

type Place = 'header' | 'sidebar'

// Locking in is one tap: no form. Ending is one tap too. Everything else
// (your hours, who's heads down, the week's board, what you're on) opens from
// the control itself, so there's no extra page or menu item.
//
// It sits at the top right of whatever you have open, so it's always in the
// same place and one tap away.
export function LockInControl() {
  const session = useWorkSession()
  if (!session.ready) return <div className="h-7 w-20 shrink-0" aria-hidden />
  return (
    <WithPanel place="header">
      {session.status === 'none' ? <Start place="header" /> : session.status === 'running' ? <Running place="header" /> : <Paused place="header" />}
    </WithPanel>
  )
}

// Phones show one screen at a time, so the list of people (their home screen)
// carries it too, right under your name.
export function SessionBar() {
  const session = useWorkSession()
  if (!session.ready) return <div className="h-11" aria-hidden />
  return (
    <div className="px-3 pb-2">
      <WithPanel place="sidebar">
        {session.status === 'none' ? (
          <Start place="sidebar" />
        ) : session.status === 'running' ? (
          <Running place="sidebar" />
        ) : (
          <Paused place="sidebar" />
        )}
      </WithPanel>
    </div>
  )
}

// One popover for the whole control, anchored to its outer edge, so it stays
// open while the control changes shape (Lock in → running → paused).
function WithPanel({ place, children }: { place: Place; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div ref={anchor} className={cn('relative', place === 'header' ? 'shrink-0' : 'w-full')}>
        {children}
      </div>
      <PopoverContent
        anchor={anchor}
        align={place === 'header' ? 'end' : 'start'}
        className="w-[min(20.5rem,calc(100vw-1rem))]"
      >
        <PopoverTitle className="sr-only">Lock in</PopoverTitle>
        <LockInPanel onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

// Opens the panel. Inside the running/paused pill it's the label + timer.
function PanelButton({ className, children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <PopoverTrigger
      aria-label={label}
      className={cn('focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', className)}
    >
      {children}
    </PopoverTrigger>
  )
}

function Start({ place }: { place: Place }) {
  const { lockIn } = useWorkSession()
  const busy = useBusy()
  const header = place === 'header'
  return (
    <div className={cn('flex shrink-0 items-stretch', header ? 'h-7' : 'h-9 w-full')}>
      <button
        type="button"
        disabled={busy.on}
        onClick={() => busy.run(lockIn)}
        title={header ? 'Start a focus timer' : undefined}
        className={cn(
          'inline-flex flex-1 items-center justify-center gap-1.5 rounded-l-md bg-flag font-semibold text-flag-foreground hover:bg-flag/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
          header ? 'px-2.5 text-xs' : 'text-sm',
        )}
      >
        <Target className={header ? 'size-3.5' : 'size-4'} aria-hidden />
        Lock in
      </button>
      <PanelButton
        label="Your hours and this week's board"
        className={cn(
          'flex items-center justify-center rounded-r-md border-l border-flag-foreground/15 bg-flag text-flag-foreground hover:bg-flag/85',
          header ? 'w-7' : 'w-10',
        )}
      >
        <ChartNoAxesColumn className={header ? 'size-3.5' : 'size-4'} aria-hidden />
      </PanelButton>
    </div>
  )
}

function Running({ place }: { place: Place }) {
  const { startedAt, awayMs, dismissAway, pause, end, focus } = useWorkSession()
  const elapsed = useElapsed(startedAt)
  const busy = useBusy()
  const header = place === 'header'

  const row = (
    <>
      <PanelButton
        label={`Locked in for ${describeSession(elapsed)}. Your hours and this week's board`}
        className="-my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-2 self-stretch rounded py-1 pl-1.5 pr-1 text-left hover:bg-foreground/10"
      >
        <span className="breathing-light [--light-color:var(--flag)] [--light:7px]" aria-hidden />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-xs whitespace-nowrap">
          <span className={cn('text-foreground', header && 'max-md:sr-only')}>Locked in</span>
          <span role="timer" className="font-mono font-medium tabular-nums text-foreground">
            {formatSession(elapsed)}
          </span>
          {!header && focus && <span className="min-w-0 truncate text-muted-foreground">{focus}</span>}
        </span>
      </PanelButton>
      <IconAction label="Pause" disabled={busy.on} onClick={() => busy.run(pause)}>
        <Pause className="size-3.5" aria-hidden />
      </IconAction>
      <TextAction disabled={busy.on} onClick={() => busy.run(end)}>
        End
      </TextAction>
    </>
  )

  const away = awayMs !== null && (
    <p
      role="status"
      className={cn(
        'flex min-w-0 items-center gap-1 text-[11.5px] leading-relaxed text-muted-foreground',
        header
          ? 'absolute top-full right-0 z-20 mt-2 rounded-md border bg-popover py-1 pr-1 pl-2.5 whitespace-nowrap shadow-sm'
          : 'pl-[17px]',
      )}
    >
      <span className="truncate">Picked up after {shortDuration(awayMs)} away · not counted</span>
      <button
        type="button"
        onClick={dismissAway}
        aria-label="Dismiss"
        className="flex size-4 shrink-0 items-center justify-center rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3" aria-hidden />
      </button>
    </p>
  )

  if (header) {
    return (
      <div className="relative flex h-7 shrink-0 items-center gap-2 rounded-md bg-flag/15 pr-0.5 pl-2.5 ring-1 ring-flag/40 ring-inset">
        {row}
        {away}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-sidebar-accent/70 py-1.5 pr-1 pl-2.5">
      <div className="flex items-center gap-2.5">{row}</div>
      {away}
    </div>
  )
}

function Paused({ place }: { place: Place }) {
  const { workedMs, pausedBy, resume, end } = useWorkSession()
  const busy = useBusy()
  const header = place === 'header'
  // 'away' only shows for a moment while Cabal checks back in and picks it up.
  const waking = pausedBy === 'away'
  return (
    <div
      className={cn(
        'flex items-center rounded-md border border-dashed',
        header ? 'h-7 shrink-0 gap-2 pr-0.5 pl-2.5' : 'gap-2.5 py-1.5 pr-1 pl-2.5',
      )}
    >
      <PanelButton
        label={`Paused at ${describeSession(workedMs)}. Your hours and this week's board`}
        className="-my-1 -ml-1.5 flex min-w-0 flex-1 items-center gap-2 self-stretch rounded py-1 pl-1.5 pr-1 text-left hover:bg-foreground/10"
      >
        <span className="size-[7px] shrink-0 rounded-full border border-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground">
          <span className={cn(header && 'max-md:sr-only')}>{waking ? 'Picking back up' : 'Paused at'}</span>
          <span className="font-mono tabular-nums">{formatSession(workedMs)}</span>
        </span>
      </PanelButton>
      {!waking && (
        <TextAction disabled={busy.on} onClick={() => busy.run(resume)} strong>
          <Play className="size-3" aria-hidden />
          Resume
        </TextAction>
      )}
      <TextAction disabled={busy.on} onClick={() => busy.run(end)}>
        End
      </TextAction>
    </div>
  )
}

function IconAction({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  )
}

function TextAction({
  children,
  strong,
  ...props
}: { children: React.ReactNode; strong?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        strong ? 'text-foreground' : 'text-muted-foreground',
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function useBusy() {
  const [on, setOn] = useState(false)
  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setOn(true)
    try {
      return await fn()
    } finally {
      setOn(false)
    }
  }
  return { on, run }
}
