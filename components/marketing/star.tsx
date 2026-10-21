import { STAR_POINTS } from '@/lib/brand'
import { cn } from '@/lib/utils'

// The same star as the logo, plus a dashed outline variant for empty spots.
export function ChicagoStar({ className, outline = false }: { className?: string; outline?: boolean }) {
  return (
    <svg viewBox="-2 -2 104 104" className={cn('size-6 shrink-0', className)} aria-hidden="true">
      <polygon
        points={STAR_POINTS}
        className={outline ? 'fill-none stroke-current' : 'fill-brand-star'}
        strokeWidth={outline ? 3 : undefined}
        strokeDasharray={outline ? '7 6' : undefined}
        strokeLinejoin="round"
      />
    </svg>
  )
}
