'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Pause, Play, Target } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { describeSession, FOCUS_MAX, formatSession } from '@/lib/session'
import { useCabal } from './store'
import { useElapsed, useWorkSession } from './work-session'

const SHARE_KEY = 'cabal:lock-in-share'

export function SessionBar() {
  const session = useWorkSession()
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null)

  if (!session.ready) return <div className="h-10" aria-hidden />

  if (editing) {
    return (
      <div className="px-3 pb-2">
        <LockInForm mode={editing} onDone={() => setEditing(null)} />
      </div>
    )
  }

  if (session.status === 'none') {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Target className="size-3.5" aria-hidden />
          Lock in
        </button>
      </div>
    )
  }

  return (
    <div className="px-3 pb-2">
      {session.status === 'running' ? (
        <Running onEdit={() => setEditing('edit')} />
      ) : (
        <Paused onEdit={() => setEditing('edit')} />
      )}
    </div>
  )
}

function Running({ onEdit }: { onEdit: () => void }) {
  const { startedAt, focus, shared, pause, end } = useWorkSession()
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
      <FocusLine focus={focus} shared={shared} onEdit={onEdit} />
    </div>
  )
}

function Paused({ onEdit }: { onEdit: () => void }) {
  const { workedMs, focus, shared, resume, end } = useWorkSession()
  const busy = useBusy()
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-dashed py-1.5 pr-1 pl-2.5">
      <div className="flex items-center gap-2.5">
        <span className="size-[7px] shrink-0 rounded-full border border-muted-foreground" aria-hidden />
        <p className="flex min-w-0 flex-1 items-baseline gap-2 text-xs text-muted-foreground">
          <span>Paused at</span>
          <span className="font-mono tabular-nums" aria-label={describeSession(workedMs)}>
            {formatSession(workedMs)}
          </span>
        </p>
        <TextAction disabled={busy.on} onClick={() => busy.run(resume)} strong>
          <Play className="size-3" aria-hidden />
          Resume
        </TextAction>
        <TextAction disabled={busy.on} onClick={() => busy.run(end)}>
          End
        </TextAction>
      </div>
      <FocusLine focus={focus} shared={shared} onEdit={onEdit} />
    </div>
  )
}

function FocusLine({ focus, shared, onEdit }: { focus: string | null; shared: boolean; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex min-w-0 items-center gap-1.5 rounded pl-[17px] text-left text-[11.5px] leading-relaxed text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${focus ? `Working on ${focus}` : 'Add what you’re working on'}. ${shared ? 'Shown to your community' : 'Only you can see this'}. Edit`}
    >
      <span className={cn('truncate', !focus && 'italic')}>{focus || 'What are you on?'}</span>
      <span className="shrink-0 opacity-70">{shared ? '· shared' : '· just you'}</span>
    </button>
  )
}

function LockInForm({ mode, onDone }: { mode: 'new' | 'edit'; onDone: () => void }) {
  const { community } = useCabal()
  const session = useWorkSession()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [focus, setFocus] = useState(mode === 'edit' ? (session.focus ?? '') : '')
  const [shared, setShared] = useState(mode === 'edit' ? session.shared : true)
  const busy = useBusy()

  useEffect(() => {
    if (mode === 'new') setShared(localStorage.getItem(SHARE_KEY) !== '0')
    input.current?.focus()
  }, [mode])

  async function submit() {
    localStorage.setItem(SHARE_KEY, shared ? '1' : '0')
    const ok = await busy.run(() => (mode === 'new' ? session.lockIn(focus, shared) : session.edit(focus, shared)))
    if (ok) onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
      className="flex flex-col gap-2.5 rounded-md border bg-card p-2.5"
    >
      <label htmlFor={`${id}-focus`} className="text-xs font-medium">
        What are you working on?
      </label>
      <input
        ref={input}
        id={`${id}-focus`}
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
        }}
        maxLength={FOCUS_MAX}
        placeholder="Optional, e.g. the onboarding flow"
        className="h-8 w-full rounded-md border border-transparent bg-sidebar-accent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      <label htmlFor={`${id}-share`} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="text-pretty">Show it to {community.name}</span>
        <Switch id={`${id}-share`} size="sm" checked={shared} onCheckedChange={setShared} className="data-checked:bg-flag" />
      </label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground text-pretty">
        Your status stays the same. Set Do not disturb if you don&apos;t want messages.
      </p>
      <div className="flex items-center justify-end gap-1">
        <TextAction onClick={onDone}>Cancel</TextAction>
        <button
          type="submit"
          disabled={busy.on}
          className="h-7 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {mode === 'new' ? 'Lock in' : 'Save'}
        </button>
      </div>
    </form>
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
