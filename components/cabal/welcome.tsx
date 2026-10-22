'use client'

import { useState } from 'react'
import { ArrowRight, Check, HeartHandshake, Timer, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCabal } from './store'

const ROWS = [
  { icon: Timer, text: 'Lock in when you\u2019re ready to focus', aside: 'heads down, not on call' },
  { icon: Users, text: 'Find builders working on interesting things' },
  { icon: HeartHandshake, text: 'Help each other ship' },
]

// Shown once, the first time a new member opens Cabal. However it's closed
// (button, Esc, outside, X), it counts as seen and never comes back.
export function Welcome() {
  const { settings, updateSettings, me, setPlaybookOpen } = useCabal()
  const [open, setOpen] = useState(() => !settings.welcome_seen)
  const first = (me.display_name ?? '').trim().split(/\s+/)[0]

  function close() {
    setOpen(false)
    if (!settings.welcome_seen) void updateSettings({ welcome_seen: true })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="gap-0 p-7 sm:max-w-md sm:p-8">
        <Reveal step={0}>
          <span className="inline-flex items-center gap-1 rounded-full bg-online/15 px-2.5 py-1 text-xs font-medium text-online">
            <Check className="size-3" aria-hidden />
            You&apos;re in
          </span>
        </Reveal>
        <Reveal step={1} className="mt-5">
          <DialogTitle className="text-xl leading-snug font-semibold tracking-tight text-balance">
            Welcome to Cabal{first ? `, ${first}` : ''}.
          </DialogTitle>
          <DialogDescription className="mt-3 text-[15px] leading-relaxed text-foreground">
            This is a place to build, focus, and find your people.
          </DialogDescription>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground text-pretty">
            You don&apos;t need to keep up with everything. Drop in when you&apos;re ready to work, and show up for other
            builders when you can.
          </p>
        </Reveal>
        <ul className="mt-6 flex flex-col gap-3.5">
          {ROWS.map((r, i) => (
            <Reveal as="li" key={r.text} step={2 + i} className="flex items-start gap-3 text-sm leading-relaxed">
              <r.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                {r.text}
                {r.aside && <span className="text-muted-foreground">{` \u00b7 ${r.aside}`}</span>}
              </span>
            </Reveal>
          ))}
        </ul>
        <Reveal step={5} className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={close}
            autoFocus
            className="group inline-flex h-10 items-center gap-1.5 rounded-md px-5 text-[15px] font-semibold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            Enter Cabal
            <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              setPlaybookOpen(true)
            }}
            className="rounded px-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Want a few ideas? See the Cabal Playbook
          </button>
          <p className="mt-3 text-xs text-muted-foreground">Just an introduction &mdash; nothing to complete.</p>
        </Reveal>
      </DialogContent>
    </Dialog>
  )
}

// A slow, gentle fade-up, one line after another. Still for reduced motion.
function Reveal({
  step,
  as: Tag = 'div',
  className,
  children,
}: {
  step: number
  as?: 'div' | 'li'
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      className={`motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-700 motion-safe:ease-out ${className ?? ''}`}
      style={{ animationDelay: `${120 + step * 90}ms` }}
    >
      {children}
    </Tag>
  )
}
