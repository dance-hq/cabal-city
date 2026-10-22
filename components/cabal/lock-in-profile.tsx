'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { hours, withRunning, type RecentSession } from '@/lib/lock-in-hours'
import { useLockInStats } from '@/hooks/use-lock-in-hours'
import { WeekStrip } from './lock-in-panel'
import { useCabal } from './store'
import { useElapsed, useWorkSession } from './work-session'

const RECENT_SHOWN = 3

// A quiet line on a profile: hours this week, all time, sessions. Your own is
// always there (with your recent sessions and notes, which only you see);
// someone else's only if they put themselves on the weekly board.
export function LockInProfile({ personId, self }: { personId: string; self: boolean }) {
  const { community } = useCabal()
  const session = useWorkSession()
  const { data } = useLockInStats(community.id, self ? null : personId)
  const elapsed = useElapsed(self && session.status === 'running' ? session.startedAt : null)
  const [all, setAll] = useState(false)
  if (!data) return null

  const runningMs = !self ? 0 : session.status === 'running' ? elapsed : session.status === 'paused' ? session.workedMs : 0
  const stats = withRunning(data, runningMs)
  const empty = stats.sessions === 0 && runningMs < 60_000
  if (!self && empty) return null
  const recent = all ? stats.recent : stats.recent.slice(0, RECENT_SHOWN)

  return (
    <section className="flex w-full flex-col gap-2" aria-label="Lock in">
      <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Lock in</h3>
      {empty ? (
        <p className="text-sm leading-relaxed text-muted-foreground">No sessions yet. Tap Lock in when you start working.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <dl className="grid grid-cols-3 gap-3">
              <Figure value={hours(stats.weekSeconds)} label="This week" />
              <Figure value={hours(stats.allSeconds)} label="All time" />
              <Figure value={String(stats.sessions)} label={stats.sessions === 1 ? 'Session' : 'Sessions'} />
            </dl>
            <WeekStrip stats={stats} />
          </div>
        </>
      )}
      {self && stats.recent.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <ul className="flex flex-col">
            {recent.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </ul>
          {stats.recent.length > RECENT_SHOWN && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="self-start rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {all ? 'Show fewer' : `Show ${stats.recent.length - RECENT_SHOWN} more`}
            </button>
          )}
        </div>
      )}
      {self && !stats.board && !empty && (
        <p className="text-xs leading-relaxed text-muted-foreground">Only you see this. You can share it from the Lock in menu.</p>
      )}
    </section>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg leading-none font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function SessionRow({ s }: { s: RecentSession }) {
  const { addNote } = useWorkSession()
  const when = new Date(s.endedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const text = s.note || s.focus
  return (
    <li className="group flex items-baseline gap-2 py-0.5 text-[13px]">
      <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{when}</span>
      <span className="w-14 shrink-0 font-mono text-[11.5px] tabular-nums">{hours(s.seconds)}</span>
      <span className={text ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-muted-foreground'}>
        {text ?? 'No note'}
      </span>
      <button
        type="button"
        onClick={() => addNote({ id: s.id, seconds: s.seconds, note: s.note })}
        aria-label={s.note ? 'Edit note' : 'Add a note'}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring max-md:opacity-100"
      >
        <Pencil className="size-3" aria-hidden />
      </button>
    </li>
  )
}
