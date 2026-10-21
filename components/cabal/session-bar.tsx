'use client'

import { useState } from 'react'
import { Pause, Play, Target, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { describeSession, formatSession, shortDuration } from '@/lib/session'
import { useElapsed, useWorkSession } from './work-session'

// Locking in is one tap: no form, no "what are you on". People who want to
// say what they're doing already have their status message for that.
export function SessionBar() {
  const session = useWorkSession()
  const busy = useBusy()

  if (!session.ready) return <div className="h-10" aria-hidden />

  if (session.status === 'none') {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          disabled={busy.on}
          onClick={() => busy.run(session.lockIn)}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Target className="size-3.5" aria-hidden />
          Lock in
        </button>
      </div>
    )
  }

  return <div className="px-3 pb-2">{session.status === 'running' ? <Running /> : <Paused />}</div>
}

function Running() {
  const { startedAt, awayMs, dismissAway, pause, end } = useWorkSession()
  const elapsed = useElapsed(startedAt)
  const busy = useBusy()
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-sidebar-accent/70 py-1.5 pr-1 pl-2.5">
      <div className="flex items-center gap-2.5">
        <span className="breathing-light [--light-color:var(--flag)] [--light:7px]" aria-hidden />
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-xs">
          <span className="text-foreground">Locked in</span>
          <span
            role="timer"
            className="font-mono font-medium tabular-nums text-foreground"
            aria-label={describeSession(elapsed)}
          >
            {formatSession(elapsed)}
          </span>
        </p>
        <IconAction label="Pause" disabled={busy.on} onClick={() => busy.run(pause)}>
          <Pause className="size-3.5" aria-hidden />
        </IconAction>
        <TextAction disabled={busy.on} onClick={() => busy.run(end)}>
          End
        </TextAction>
      </div>
      {awayMs !== null && (
        <p role="status" className="flex min-w-0 items-center gap-1 pl-[17px] text-[11.5px] leading-relaxed text-muted-foreground">
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
      )}
    </div>
  )
}

function Paused() {
  const { workedMs, pausedBy, resume, end } = useWorkSession()
  const busy = useBusy()
  // 'away' only shows for a moment while Cabal checks back in and picks it up.
  const waking = pausedBy === 'away'
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-dashed py-1.5 pr-1 pl-2.5">
      <div className="flex items-center gap-2.5">
        <span className="size-[7px] shrink-0 rounded-full border border-muted-foreground" aria-hidden />
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-xs text-muted-foreground">
          <span>{waking ? 'Picking back up' : 'Paused at'}</span>
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
      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
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
