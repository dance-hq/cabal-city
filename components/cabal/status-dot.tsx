import { cn } from '@/lib/utils'
import type { ShownStatus } from '@/lib/types'

export const STATUS_LABEL: Record<ShownStatus | 'invisible', string> = {
  online: 'Online',
  away: 'Away',
  dnd: 'Do not disturb',
  offline: 'Offline',
  invisible: 'Invisible',
}

// Online: solid green. Away: hollow ring. Do not disturb: rose with a bar.
// Offline: faint hollow ring. Shapes differ too, so color isn't the only cue.
export function StatusDot({
  status,
  size = 9,
  className,
  decorative,
}: {
  status: ShownStatus | 'invisible'
  size?: number
  className?: string
  // Set when a visible label next to the dot already says the status.
  decorative?: boolean
}) {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : STATUS_LABEL[status]}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        status === 'online' && 'bg-online',
        status === 'away' && 'border-2 border-muted-foreground bg-sidebar',
        status === 'dnd' && 'bg-dnd',
        (status === 'offline' || status === 'invisible') && 'border-[1.5px] border-muted-foreground/50 bg-sidebar',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {status === 'dnd' && <span className="h-[1.5px] w-1/2 rounded-full bg-sidebar" />}
    </span>
  )
}
