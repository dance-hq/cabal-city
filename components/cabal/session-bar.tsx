'use client'

import { useState } from 'react'
import { Pause, Play, Target, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeSession, formatSession, shortDuration } from '@/lib/session'
import { useElapsed, useWorkSession } from './work-session'

type Place = 'header' | 'sidebar'

// Locking in is one tap: no form, no "what are you on". People who want to
// say what they're doing already have their status message for that.
//
// It sits at the top right of whatever you have open, so it's always in the
// same place and one tap away.
export function LockInControl() {
  const session = useWorkSession()
  if (!session.ready) return <div className="h-7 w-20 shrink-0" aria-hidden />
  if (session.status === 'none') return <LockInButton place="header" />
  return session.status === 'running' ? <Running place="header" /> : <Paused place="header" />
}

// Phones show one screen at a time, so the list of people (their home screen)
// carries it too, right under your name.
export function SessionBar() {
  const session = useWorkSession()
  if (!session.ready) return <div className="h-11" aria-hidden />
  return (
    <div className="px-3 pb-2">
      {session.status === 'none' ? (
        <LockInButton place="sidebar" />
      ) : session.status === 'running' ? (
        <Running place="sidebar" />
      ) : (
        <Paused place="sidebar" />
      )}
    </div>
  )
}

function LockInButton({ place }: { place: Place }) {
  const { lockIn } = useWorkSession()
  const busy = useBusy()
  const header = place === 'header'
  return (
    <button
      type="button"
      disabled={busy.on}
      onClick={() => busy.run(lockIn)}
      title={header ? 'Start a focus timer everyone can see' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-flag font-semibold text-flag-foreground hover:bg-flag/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
        header ? 'h-7 px-2.5 text-xs' : 'h-9 w-full text-sm',
      )}
    >
      <Target className={header ? 'size-3.5' : 'size-4'} aria-hidden />
      Lock in
    </button>
  )
}

function Running({ place }: { place: Place }) {
  const { startedAt, awayMs, dismissAway, pause, end } = useWorkSession()
  const elapsed = useElapsed(startedAt)
  const busy = useBusy()
  const header = place === 'header'

  const row = (
    <>
      <span className="breathing-light [--light-color:var(--flag)] [--light:7px]" aria-hidden />
      <p className="flex min-w-0 flex-1 items-baseline gap-2 text-xs whitespace-nowrap">
        <span className={cn('text-foreground', header && 'max-md:sr-only')}>Locked in</span>
        <span role="timer" className="font-mono font-medium tabular-nums text-foreground" aria-label={describeSession(elapsed)}>
          {formatSession(elapsed)}
        </span>
      </p>
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
      <span className="size-[7px] shrink-0 rounded-full border border-muted-foreground" aria-hidden />
      <p className="flex min-w-0 flex-1 items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground">
        <span className={cn(header && 'max-md:sr-only')}>{waking ? 'Picking back up' : 'Paused at'}</span>
        <span className="font-mono tabular-nums" aria-label={describeSession(workedMs)}>
          {formatSession(workedMs)}
        </span>
      </p>
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
