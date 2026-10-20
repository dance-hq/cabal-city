import { cn } from '@/lib/utils'

// The Cabal mark: an open "C" with a light on in the doorway.
export function CabalMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-6 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d="M22.4 10.2A8.4 8.4 0 1 0 22.4 21.8"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-background"
      />
      <circle cx="24" cy="16" r="2.6" className="fill-primary" />
    </svg>
  )
}

export function CabalWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CabalMark />
      <span className="font-mono text-[15px] font-semibold tracking-tight">cabal</span>
    </span>
  )
}
