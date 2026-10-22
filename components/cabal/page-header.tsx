'use client'

import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LockInControl } from './session-bar'

// Header for main-pane places that aren't conversations, matching Home and
// conversation headers: same height, Lock in at the far right.
export function PageHeader({
  title,
  icon,
  meta,
  compact,
  onBack,
  backLabel = 'Back to everyone',
  children,
}: {
  title: string
  icon?: React.ReactNode
  meta?: React.ReactNode
  compact?: boolean
  onBack?: () => void
  backLabel?: string
  children?: React.ReactNode
}) {
  return (
    <header className={cn('app-drag flex h-11 shrink-0 items-center gap-2 border-b pr-2', compact ? 'pl-2' : 'pl-5')}>
      {compact && onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
      )}
      <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {icon}
        <span className="truncate">{title}</span>
      </h1>
      {meta && <span className="hidden truncate font-mono text-[11px] text-muted-foreground sm:inline">{meta}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {children}
        <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
        <LockInControl />
      </div>
    </header>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="quiet-scroll -mx-1 flex gap-1 overflow-x-auto px-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value && 'bg-accent font-medium text-foreground',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="font-mono text-[11px] text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function QuietIconButton({
  label,
  onClick,
  pressed,
  children,
  className,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        pressed && 'bg-accent text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}
