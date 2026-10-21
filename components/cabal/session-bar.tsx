'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { useElapsed, useWorkSession } from './work-session'
import { describeSession, formatSession } from '@/lib/session'

export function SessionBar() {
  const { startedAt, start, end } = useWorkSession()
  const elapsed = useElapsed(startedAt)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  if (startedAt === null) {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(start)}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Play className="size-3.5" aria-hidden />
          Start a session
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 pb-2">
      <div className="flex h-8 items-center gap-2.5 rounded-md bg-sidebar-accent/70 pr-1 pl-2.5">
        <span className="breathing-light [--light:7px]" aria-hidden />
        <p className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
          <span className="text-muted-foreground">In session</span>
          <span className="font-mono font-medium tabular-nums" aria-label={describeSession(elapsed)}>
            {formatSession(elapsed)}
          </span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(end)}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          End
        </button>
      </div>
    </div>
  )
}
