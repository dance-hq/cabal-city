'use client'

import { useEffect, useState } from 'react'
import { useSWRConfig } from 'swr'
import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { FOCUS_MAX, shortDuration } from '@/lib/session'
import { DAY_LETTERS, dayIndex, hours, share, weekRange, withRunning, zoneCity, type LockInStats } from '@/lib/lock-in-hours'
import { lockInsKey, useLockIns } from '@/hooks/use-lock-ins'
import { refreshLockInHours, useLockInBoard, useLockInStats } from '@/hooks/use-lock-in-hours'
import { Avatar } from './avatar'
import { useCabal } from './store'
import { useElapsed, useWorkSession } from './work-session'

// What opens from the Lock in control: your hours, who's heads down right
// now, and this week's board. Nothing here interrupts anyone.
export function LockInPanel({ onNavigate }: { onNavigate(): void }) {
  const { community } = useCabal()
  const session = useWorkSession()
  const stats = useLockInStats(community.id, null)
  const elapsed = useElapsed(session.status === 'running' ? session.startedAt : null)
  const runningMs = session.status === 'running' ? elapsed : session.status === 'paused' ? session.workedMs : 0
  const mine = stats.data ? withRunning(stats.data, runningMs) : null

  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3 px-4 pt-4 pb-4" aria-label="Your Lock in hours">
        <Label>You</Label>
        <Totals stats={mine} />
        {mine && <WeekStrip stats={mine} />}
        {session.status !== 'none' && <FocusField />}
      </section>
      <Divider />
      <section className="flex flex-col gap-2 px-4 py-4" aria-label="Locked in now">
        <LockedInList limit={6} onNavigate={onNavigate} dense />
      </section>
      <Divider />
      <section className="flex flex-col gap-2 px-4 py-4" aria-label="Weekly board">
        <WeekBoard onNavigate={onNavigate} switcher />
      </section>
      <Prefs />
    </div>
  )
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase', className)}>{children}</h3>
}

function Divider() {
  return <div className="h-px bg-border" aria-hidden />
}

function Totals({ stats }: { stats: LockInStats | null }) {
  const items = [
    ['Today', stats?.todaySeconds],
    ['This week', stats?.weekSeconds],
    ['All time', stats?.allSeconds],
  ] as const
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map(([label, seconds]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
          <dd className="font-mono text-base font-medium tabular-nums">
            {seconds === undefined ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-accent" /> : hours(seconds)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Monday to Sunday as seven quiet bars; today is the one in full colour.
export function WeekStrip({ stats, className }: { stats: LockInStats; className?: string }) {
  const today = dayIndex(stats.timeZone)
  const top = Math.max(...stats.days, 3600)
  return (
    <div className={cn('flex items-end gap-1.5', className)} role="img" aria-label={weekAria(stats)}>
      {stats.days.map((seconds, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-8 w-full items-end overflow-hidden rounded-sm bg-accent/60">
            <div
              className={cn('w-full rounded-sm', i === today ? 'bg-flag' : 'bg-flag/45')}
              style={{ height: `${share(seconds, top) * 100}%` }}
            />
          </div>
          <span className={cn('font-mono text-[10px]', i === today ? 'text-foreground' : 'text-muted-foreground')}>
            {DAY_LETTERS[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

function weekAria(stats: LockInStats) {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const worked = stats.days.map((s, i) => (s >= 60 ? `${names[i]} ${hours(s)}` : null)).filter(Boolean)
  return worked.length ? `This week: ${worked.join(', ')}` : 'Nothing yet this week'
}

// Optional, after you've started: what you're on, for you and (if you show
// your session) the people looking at "Locked in now".
function FocusField() {
  const { focus, setFocus } = useWorkSession()
  const [text, setText] = useState(focus ?? '')
  useEffect(() => setText(focus ?? ''), [focus])
  const dirty = text.trim() !== (focus ?? '')

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (dirty) await setFocus(text)
      }}
      className="flex items-center gap-2 rounded-md border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring"
    >
      <Target className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor="lock-in-focus" className="sr-only">
        What are you working on?
      </label>
      <input
        id="lock-in-focus"
        value={text}
        maxLength={FOCUS_MAX}
        placeholder="What are you working on? (optional)"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => dirty && void setFocus(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
        }}
        className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      {dirty && (
        <button type="submit" className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground hover:bg-accent">
          Save
        </button>
      )}
    </form>
  )
}

// Who's heads down right now and chose to show it. Locked in isn't "free to
// chat", so a row opens their profile, not a message.
export function LockedInList({
  limit,
  onNavigate,
  dense,
}: {
  limit?: number
  onNavigate?(): void
  dense?: boolean
}) {
  const { community, profileById, userId, showProfile } = useCabal()
  const lockIns = useLockIns(community.id)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const rows = [...lockIns.entries()]
    .map(([id, l]) => ({ id, ...l, profile: profileById(id) }))
    .filter((r) => r.profile)
    .sort((a, b) => a.startedAt - b.startedAt)
  const shown = limit ? rows.slice(0, limit) : rows

  return (
    <>
      <Label>Locked in now · {rows.length}</Label>
      {rows.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          Nobody&apos;s heads down right now.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((r) => {
            const name = r.profile!.display_name ?? r.profile!.username ?? 'Someone'
            const on = r.focus || r.profile!.status_text || 'Heads down'
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.()
                    showProfile(r.id)
                  }}
                  className={cn(
                    '-mx-2 flex w-[calc(100%+1rem)] items-center rounded-md px-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                    dense ? 'gap-2.5 py-1.5' : 'gap-3 py-2',
                  )}
                >
                  <Avatar name={name} url={r.profile!.avatar_url} size={dense ? 24 : 32} lockedIn />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('truncate leading-tight font-medium', dense ? 'text-[13px]' : 'text-sm')}>
                      {name}
                      {r.id === userId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className={cn('truncate leading-snug text-muted-foreground', dense ? 'text-[11.5px]' : 'text-[13px]')}>
                      {on}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-flag" aria-hidden />
                    {shortDuration(now - r.startedAt)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {limit && rows.length > limit && (
        <p className="font-mono text-[11px] text-muted-foreground">+{rows.length - limit} more heads down</p>
      )}
    </>
  )
}

// This week's hours from finished sessions, for members who chose to be on
// it. Resets Monday in the community's own time zone.
export function WeekBoard({
  limit,
  onNavigate,
  switcher,
}: {
  limit?: number
  onNavigate?(): void
  switcher?: boolean
}) {
  const { community, profileById, userId, showProfile, settings } = useCabal()
  const [weeksAgo, setWeeksAgo] = useState(0)
  const board = useLockInBoard(community.id, weeksAgo)
  const b = board.data

  const rows = (b?.rows ?? [])
    .map((r) => ({ ...r, profile: profileById(r.userId) }))
    .filter((r) => r.profile)
  const top = rows[0]?.seconds ?? 0
  const mineIndex = rows.findIndex((r) => r.userId === userId)
  let shown = limit ? rows.slice(0, limit) : rows
  // Keep your own row in view when you're past the cut.
  if (limit && mineIndex >= limit) shown = [...shown.slice(0, limit - 1), rows[mineIndex]]
  const joined = b?.joined ?? settings.lock_in_board

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{weeksAgo === 0 ? 'This week' : 'Last week'}</Label>
        {switcher ? (
          <div className="flex items-center gap-0.5 text-[11.5px]" role="group" aria-label="Which week">
            {[0, 1].map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weeksAgo === w}
                onClick={() => setWeeksAgo(w)}
                className={cn(
                  'rounded px-1.5 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  weeksAgo === w ? 'bg-accent text-foreground' : 'text-muted-foreground',
                )}
              >
                {w === 0 ? 'This week' : 'Last week'}
              </button>
            ))}
          </div>
        ) : (
          b && <span className="font-mono text-[11px] text-muted-foreground">{weekRange(b.weekStart, b.weekEnd, b.timeZone)}</span>
        )}
      </div>

      {!b ? (
        <div className="flex flex-col gap-2 py-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-accent/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {weeksAgo === 0 ? 'No finished sessions on the board yet this week.' : 'Nobody was on the board last week.'}
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((r) => {
            const name = r.profile!.display_name ?? r.profile!.username ?? 'Someone'
            const me = r.userId === userId
            return (
              <li key={r.userId}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.()
                    showProfile(r.userId)
                  }}
                  aria-label={`${r.rank}. ${me ? 'You' : name}, ${hours(r.seconds)}`}
                  className={cn(
                    '-mx-2 grid w-[calc(100%+1rem)] grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                    me && 'bg-flag/10 hover:bg-flag/15',
                  )}
                >
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{r.rank}</span>
                  <Avatar name={name} url={r.profile!.avatar_url} size={20} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[13px] leading-tight">
                      {name}
                      {me && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="h-1 w-full overflow-hidden rounded-full bg-accent" aria-hidden>
                      <span className="block h-full rounded-full bg-flag" style={{ width: `${share(r.seconds, top) * 100}%` }} />
                    </span>
                  </span>
                  <span className="w-14 text-right font-mono text-[11.5px] tabular-nums">{hours(r.seconds)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {b && (
        <p className="font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          {!joined
            ? "You're not on the board. Your hours stay yours."
            : mineIndex === -1 && weeksAgo === 0
              ? 'Finish a session to show up this week.'
              : `Finished sessions · resets Monday, ${zoneCity(b.timeZone)} time`}
        </p>
      )}
    </>
  )
}

// The two choices, kept right where you'd wonder about them.
function Prefs() {
  const { settings, updateSettings, community } = useCabal()
  const { mutate } = useSWRConfig()
  async function set(patch: Partial<Pick<typeof settings, 'lock_in_live' | 'lock_in_board'>>) {
    await updateSettings(patch)
    void refreshLockInHours(mutate)
    void mutate(lockInsKey(community.id))
  }
  return (
    <div className="flex flex-col gap-2.5 border-t bg-muted/40 px-4 py-3">
      <PrefRow
        id="lock-in-board"
        label="Show my hours on the board"
        hint="Also shows your Lock in numbers on your profile."
        checked={settings.lock_in_board}
        onChange={(v) => set({ lock_in_board: v })}
      />
      <PrefRow
        id="lock-in-live"
        label="Show me in Locked in now"
        checked={settings.lock_in_live}
        onChange={(v) => set({ lock_in_live: v })}
      />
    </div>
  )
}

export function PrefRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange(v: boolean): void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-[13px] leading-tight">{label}</span>
        {hint && <span className="text-[11.5px] leading-snug text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}
