import { STAR_POINTS } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { LOCKUP } from './wordmark-paths'

// The Chicago star on its own, in the brand red.
export function CabalStar({ className }: { className?: string }) {
  return (
    <svg viewBox="-1 -1 102 102" className={cn('size-6 shrink-0', className)} aria-hidden="true">
      <polygon points={STAR_POINTS} className="fill-brand-star" />
    </svg>
  )
}

// The app icon: the star on a rounded ink tile.
export function CabalMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('size-6 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="100" height="100" rx="22.5" className="fill-brand-ink" />
      <g transform="translate(19 19) scale(0.62)">
        <polygon points={STAR_POINTS} className="fill-brand-star" />
      </g>
    </svg>
  )
}

// Star + "cabal.city". Outlines come from scripts/brand-assets.ts, so the logo
// needs no extra web font. Size it by height.
export function CabalWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}
      className={cn('h-6 w-auto shrink-0', className)}
      role="img"
      aria-label="cabal.city"
    >
      <polygon points={LOCKUP.star} className="fill-brand-star" />
      <path d={LOCKUP.cabal} className="fill-foreground" />
      <path d={LOCKUP.city} className="fill-muted-foreground" />
    </svg>
  )
}
