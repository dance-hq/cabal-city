import { cn } from '@/lib/utils'
import { isOwnAvatarUrl } from '@/lib/avatar-url'
import type { ShownStatus } from '@/lib/types'
import { StatusDot } from './status-dot'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({
  name,
  url,
  size = 28,
  status,
  lockedIn,
  className,
}: {
  name: string
  url?: string | null
  size?: number
  status?: ShownStatus
  // Draws the live current around the avatar (see .locked-in in globals.css).
  lockedIn?: boolean
  className?: string
}) {
  const dim = status === 'offline'
  const ring = size >= 48 ? 2.5 : size >= 26 ? 2 : 1.5
  return (
    <span
      className={cn('relative inline-flex shrink-0', lockedIn && 'locked-in', className)}
      style={{ width: size, height: size, ...(lockedIn ? { '--ring': `${ring}px` } : null) } as React.CSSProperties}
    >
      {url && isOwnAvatarUrl(url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          className={cn('size-full rounded-full object-cover', dim && 'opacity-55 grayscale')}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex size-full items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground',
            dim && 'opacity-60',
          )}
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initials(name)}
        </span>
      )}
      {status && (
        <StatusDot
          status={status}
          className="absolute -right-0.5 -bottom-0.5 z-[1] ring-2 ring-sidebar"
          size={size >= 40 ? 12 : 9}
        />
      )}
    </span>
  )
}
