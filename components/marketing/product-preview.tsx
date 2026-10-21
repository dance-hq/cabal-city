import { ChevronDown, Hash, Link2, Lock, Plus, Search, Settings } from 'lucide-react'
import { Avatar } from '@/components/cabal/avatar'
import { STATUS_LABEL } from '@/components/cabal/status-dot'
import type { ShownStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

// Example people and messages, drawn with the app's own pieces (Avatar,
// status dots, the same rows and spacing) so the picture matches the product.
const HERE: { name: string; status: ShownStatus; note: string | null }[] = [
  { name: 'Priya Raman', status: 'online', note: 'Shipping the beta tonight' },
  { name: 'Sam Okafor', status: 'online', note: 'Looking for a first customer intro' },
  { name: 'Marcus Webb', status: 'dnd', note: 'Locked in until 4' },
  { name: 'Elena Ortiz', status: 'away', note: null },
]

const MESSAGES = [
  {
    name: 'Elena Ortiz',
    time: '10:42 AM',
    lines: [
      "Hi all, I'm Elena. I'm building booking software for dance studios here in Chicago. Has anyone sold to small studios or gyms before?",
    ],
  },
  {
    name: 'Marcus Webb',
    time: '10:46 AM',
    lines: ['Welcome! Priya sold to a bunch of gyms last year. She’s the one to ask.'],
  },
  {
    name: 'Priya Raman',
    time: '10:49 AM',
    lines: ["Happy to help. DM me, I'm around until 6.", 'Send your pricing page too, I’ll take a look.'],
  },
]
const NEW_MESSAGE = {
  name: 'Sam Okafor',
  time: '11:05 AM',
  lines: ['Sam here. Two of us are building inventory tools for restaurants, and the waitlist went live this morning. Feedback very welcome.'],
}

export function ProductPreview({ communityName }: { communityName: string }) {
  return (
    <figure className="flex flex-col gap-3">
      <div
        aria-hidden
        className="app-look flex overflow-hidden rounded-xl border bg-background text-foreground select-none md:h-136"
      >
        <Sidebar communityName={communityName} />
        <Room />
      </div>
      <figcaption className="font-mono text-xs text-muted-foreground">
        <span className="sr-only">
          A picture of Cabal: a list of Chicago builders with their status, and a room where a new member introduces
          herself and others offer help.{' '}
        </span>
        The real Cabal interface, with example people and messages.
      </figcaption>
    </figure>
  )
}

function Sidebar({ communityName }: { communityName: string }) {
  return (
    <div className="flex w-full shrink-0 flex-col bg-sidebar md:w-64 md:border-r">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 pr-2 pl-3">
        <span className="truncate font-mono text-xs font-medium text-muted-foreground">{communityName}</span>
        <span className="flex size-7 items-center justify-center text-muted-foreground">
          <Settings className="size-4" />
        </span>
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar name="You" size={32} status="online" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">You</span>
            <span className="inline-flex items-center gap-1 px-1 py-0.5 text-xs text-muted-foreground">
              Online
              <ChevronDown className="size-3" />
            </span>
          </div>
          <span className="truncate text-xs text-muted-foreground">Locked in on launch week</span>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative flex h-8 items-center rounded-md bg-sidebar-accent pl-8 text-sm text-muted-foreground">
          <Search className="absolute left-2.5 size-3.5" />
          Find someone
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
        <Section label="Rooms">
          <Row>
            <Hash className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-[13px]">lobby</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">3</span>
          </Row>
          <Row selected>
            <Hash className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-[13px] text-sidebar-foreground">introductions</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">5</span>
          </Row>
        </Section>

        <Section label="Teams" action={<Plus className="size-3.5 text-muted-foreground" />}>
          <Row>
            <Lock className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-[13px] font-semibold text-foreground">Halsted Labs</span>
            <span className="ml-auto inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10.5px] font-semibold text-primary-foreground">
              2
            </span>
          </Row>
        </Section>

        <Section label={`Here now · ${HERE.length}`}>
          {HERE.map((p) => (
            <Person key={p.name} name={p.name} status={p.status} note={p.note} />
          ))}
        </Section>
      </div>

      <div className="hidden shrink-0 border-t px-3 py-2 md:block">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5" />
          Invite a builder
        </span>
      </div>
    </div>
  )
}

function Room() {
  return (
    <div className="hidden min-w-0 flex-1 flex-col md:flex">
      <div className="flex h-11 shrink-0 items-baseline gap-2 border-b px-3 pt-3.5">
        <span className="inline-flex shrink-0 items-center font-mono text-sm font-semibold">
          <Hash className="size-3.5 text-muted-foreground" />
          introductions
        </span>
        <span className="truncate text-xs text-muted-foreground">
          New here? Tell people who you are and what you&apos;re building.
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-3">
        {MESSAGES.map((m) => (
          <Message key={m.name} {...m} />
        ))}
        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-primary/60" />
          <span className="font-mono text-[10.5px] tracking-wider text-mark uppercase">New</span>
        </div>
        <Message {...NEW_MESSAGE} />
      </div>

      <div className="px-4 pb-4">
        <div className="flex h-11 items-center rounded-lg border bg-card px-3 text-sm text-muted-foreground">
          Message #introductions
        </div>
      </div>
    </div>
  )
}

function Message({ name, time, lines }: { name: string; time: string; lines: string[] }) {
  return (
    <div className="mt-2.5 flex gap-3 py-0.5">
      <div className="w-8 shrink-0 pt-0.5">
        <Avatar name={name} size={32} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-[11px] text-muted-foreground">{time}</span>
        </div>
        {lines.map((line) => (
          <p key={line} className="text-sm leading-6 text-pretty text-foreground/90">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-px first:mt-1">
      <div className="flex h-6 items-center justify-between pr-3 pl-4">
        <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ selected, children }: { selected?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-sidebar-foreground/85',
        selected && 'bg-sidebar-accent text-sidebar-foreground',
      )}
    >
      {children}
    </div>
  )
}

function Person({ name, status, note }: { name: string; status: ShownStatus; note: string | null }) {
  const sub = note || (status === 'away' || status === 'dnd' ? STATUS_LABEL[status] : null)
  return (
    <div className="mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <Avatar name={name} size={28} status={status} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-[13px] leading-tight',
            status === 'offline' ? 'text-muted-foreground' : 'text-sidebar-foreground',
          )}
        >
          {name}
        </span>
        {sub && (
          <span className={cn('truncate text-[11.5px] leading-tight text-muted-foreground', status === 'offline' && 'opacity-70')}>
            {sub}
          </span>
        )}
      </span>
    </div>
  )
}
