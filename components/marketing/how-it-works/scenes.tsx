import { ArrowRight, Hash, Lock, Pause, Square } from 'lucide-react'
import { Avatar } from '@/components/cabal/avatar'
import { cn } from '@/lib/utils'
import { TickingTimer } from './ticking-timer'

// Small, faithful sketches of real Cabal screens. They're illustrations, so
// nothing inside is focusable and screen readers get the step text instead.
function Frame({ path, children, className }: { path: string; children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn('overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="size-2 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{path}</span>
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  )
}

function FakeField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <span
        className={cn(
          'flex h-9 items-center rounded-md border bg-background px-3 text-sm',
          mono && 'font-mono',
        )}
      >
        {value}
        <span className="ml-px h-4 w-px animate-pulse bg-foreground" />
      </span>
    </div>
  )
}

export function SignInScene() {
  const code = ['4', '1', '9', '0', '2', '7', '', '']
  return (
    <Frame path="cabal.city/login">
      <div className="flex flex-col gap-4">
        <FakeField label="Email" value="priya@yourstartup.com" />
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">We sent you a code. Type it in.</span>
          <div className="flex gap-1 sm:gap-1.5">
            {code.map((d, i) => (
              <span
                key={i}
                className={cn(
                  'flex h-10 min-w-0 flex-1 items-center justify-center rounded-md border bg-background font-mono text-sm font-medium',
                  i === 6 && 'border-ring ring-2 ring-ring/30',
                )}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  )
}

export function ProfileScene() {
  return (
    <Frame path="cabal.city/onboarding">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name="Priya Shah" size={40} />
          <div className="flex-1">
            <FakeField label="Your name" value="Priya Shah" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Your role</span>
          <div className="flex gap-1.5">
            {['Founder', 'Builder', 'Investor'].map((role) => (
              <span
                key={role}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center rounded-md border text-xs',
                  role === 'Builder' ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground',
                )}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
        <span className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground">
          Enter Cabal
          <ArrowRight className="size-4" />
        </span>
      </div>
    </Frame>
  )
}

const PEOPLE = [
  { name: 'Marcus Bell', note: 'Locked in · Pricing page', status: 'online' as const, lockedIn: true },
  { name: 'Lena Ortiz', note: 'Available', status: 'online' as const },
  { name: 'Dev Patel', note: 'Do not disturb', status: 'dnd' as const },
  { name: 'Sam Okafor', note: 'Away', status: 'away' as const },
]

export function AroundScene() {
  return (
    <Frame path="Cabal">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">Here now · 4</span>
          {PEOPLE.map((p) => (
            <span key={p.name} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
              <Avatar name={p.name} size={28} status={p.status} lockedIn={p.lockedIn} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm leading-tight">{p.name}</span>
                <span className={'truncate text-xs text-muted-foreground'}>{p.note}</span>
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1 border-t pt-3">
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">Channels</span>
          <span className="flex items-center gap-2 rounded-md bg-accent px-1.5 py-1.5 text-sm">
            <Hash className="size-3.5 text-muted-foreground" />
            lobby
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-online" />6
            </span>
          </span>
          <span className="flex items-center gap-2 px-1.5 py-1.5 text-sm text-muted-foreground">
            <Hash className="size-3.5" />
            introductions
          </span>
          <span className="flex items-center gap-2 px-1.5 py-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" />
            pricing-crew
          </span>
        </div>
      </div>
    </Frame>
  )
}

export function LockInScene() {
  return (
    <Frame path="Cabal · #lobby">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-end">
          <span className="inline-flex h-9 items-center gap-2.5 rounded-full border border-flag/40 bg-flag/10 pr-1.5 pl-3 text-xs">
            <span className="breathing-light [--light-color:var(--flag)] [--light:7px]" />
            Locked in
            <TickingTimer startSeconds={42 * 60 + 17} />
            <span className="flex items-center gap-0.5">
              <span className="flex size-6 items-center justify-center rounded-full text-muted-foreground">
                <Pause className="size-3.5" />
              </span>
              <span className="flex size-6 items-center justify-center rounded-full text-muted-foreground">
                <Square className="size-3" />
              </span>
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
          <Avatar name="Priya Shah" size={44} lockedIn />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">Priya Shah</span>
            <span className="truncate text-xs text-muted-foreground">Locked in · Shipping the waitlist</span>
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Step away for a while and the clock pauses on its own. That time is never counted.
        </p>
      </div>
    </Frame>
  )
}
