'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CabalWordmark } from '@/components/brand/logo'
import { useCabal } from './store'
import { useWorkSession } from './work-session'
import { createClient } from '@/lib/supabase/client'
import { STATUS_MAX } from '@/lib/config'
import { desktop } from '@/lib/desktop'
import { friendlyError } from '@/lib/errors'
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
  const { me, userId, refreshMembers } = useCabal()
  const { start, skip } = useWorkSession()
  const [focus, setFocus] = useState(me.status_text ?? '')
  const [busy, setBusy] = useState(false)
  const [today] = useState(() => new Date())
  const firstName = (me.display_name ?? '').trim().split(/\s+/)[0]
  const hasOverlay = Boolean(desktop()?.setSession)

  async function begin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const value = focus.trim().slice(0, STATUS_MAX) || null
    if (value !== (me.status_text ?? null)) {
      const { error } = await createClient().from('profiles').update({ status_text: value }).eq('id', userId)
      if (error) toast.error(friendlyError(error))
      else refreshMembers()
    }
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

      <form onSubmit={begin} className="calm-in flex flex-col gap-4 [--i:3]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="session-focus">What are you working on?</Label>
          <Input
            id="session-focus"
            value={focus}
            maxLength={STATUS_MAX}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. Shipping the onboarding flow"
            autoComplete="off"
            className="h-11"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Optional. It shows next to your name so people know what you&apos;re on.
          </p>
        </div>
        <Button type="submit" disabled={busy} className="h-11">
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
      </form>

      <p className="calm-in text-center text-xs leading-relaxed text-muted-foreground text-pretty [--i:4]">
        {hasOverlay
          ? 'A small timer sits in the corner of your screen while Cabal is in the background. Drag it anywhere.'
          : 'Your session time stays in the sidebar while you work.'}
      </p>
    </div>
  )
}
