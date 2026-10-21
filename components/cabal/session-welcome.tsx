'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CabalWordmark } from '@/components/brand/logo'
import { useCabal } from './store'
import { useWorkSession } from './work-session'
import { desktop } from '@/lib/desktop'
import { calmLine, greeting } from '@/lib/session'

export function SessionWelcome() {
  const { phase } = useWorkSession()
  return (
    <main className="flex h-svh flex-col bg-background">
      <header className="app-drag flex h-12 shrink-0 items-center px-5 pt-2 opacity-70">
        <CabalWordmark />
      </header>
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-16">
        {phase === 'loading' ? (
          <span className="breathing-light [--light:14px]" role="status" aria-label="Opening Cabal" />
        ) : (
          <Welcome />
        )}
      </div>
    </main>
  )
}

function Welcome() {
  const { me } = useCabal()
  const { start, skip } = useWorkSession()
  const [busy, setBusy] = useState(false)
  const [today] = useState(() => new Date())
  const firstName = (me.display_name ?? '').trim().split(/\s+/)[0]
  const hasOverlay = Boolean(desktop()?.setSession)

  async function begin() {
    setBusy(true)
    if (!(await start())) setBusy(false)
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-4">
        <span className="breathing-light calm-in [--light:14px]" aria-hidden />
        <h1 className="calm-in text-3xl font-semibold tracking-tight text-balance [--i:1]">
          {greeting(today.getHours())}
          {firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="calm-in text-base leading-relaxed text-muted-foreground text-pretty [--i:2]">
          {calmLine(today)}
        </p>
      </div>

      <div className="calm-in flex flex-col gap-4 [--i:3]">
        <Button onClick={begin} disabled={busy} autoFocus className="h-11">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Start session
        </Button>
        <button
          type="button"
          onClick={skip}
          className="self-center rounded px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Just catching up? Look around first
        </button>
      </div>

      <p className="calm-in text-center text-xs leading-relaxed text-muted-foreground text-pretty [--i:4]">
        {hasOverlay
          ? 'A small timer sits in the corner of your screen while Cabal is in the background. Drag it anywhere.'
          : 'Your session time stays in the sidebar while you work.'}
      </p>
    </div>
  )
}
