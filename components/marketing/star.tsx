import { cn } from '@/lib/utils'

// Chicago's six-pointed star: twelve points alternating between the tips and
// the notches, sharper than a hexagram.
const POINTS = Array.from({ length: 12 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 23
  const a = ((-90 + i * 30) * Math.PI) / 180
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
}).join(' ')

export function ChicagoStar({ className, outline = false }: { className?: string; outline?: boolean }) {
  return (
    <svg viewBox="-2 -2 104 104" className={cn('size-6 shrink-0', className)} aria-hidden="true">
      <polygon
        points={POINTS}
        className={outline ? 'fill-none stroke-current' : 'fill-star'}
        strokeWidth={outline ? 3 : undefined}
        strokeDasharray={outline ? '7 6' : undefined}
        strokeLinejoin="round"
      />
    </svg>
  )
}
