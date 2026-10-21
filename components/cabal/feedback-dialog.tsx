'use client'

import { useState } from 'react'
import { Bug, Lightbulb, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { VIEWS, useCabal } from './store'
import { suggestOnBoard } from './build-cabal'
import { splitSuggestion } from '@/lib/board'
import { desktop } from '@/lib/desktop'
import { githubUrl } from '@/lib/config'

type Kind = 'bug' | 'idea'

const KINDS: { id: Kind; label: string; icon: typeof Bug; prompt: string; placeholder: string }[] = [
  {
    id: 'bug',
    label: 'Something’s broken',
    icon: Bug,
    prompt: 'What happened?',
    placeholder: 'What you did, what you expected, and what happened instead.',
  },
  {
    id: 'idea',
    label: 'I have an idea',
    icon: Lightbulb,
    prompt: 'What would make Cabal better?',
    placeholder: 'A feature, a change, something that bugs you…',
  },
]

function appDetails() {
  const bridge = desktop()
  return {
    page: window.location.pathname,
    app: bridge ? `Desktop ${bridge.version}` : 'Browser',
    build: (process.env.NEXT_PUBLIC_CABAL_BUILD ?? '').slice(0, 12),
    browser: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight}`,
  }
}

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { community, open: openPlace } = useCabal()
  const [kind, setKind] = useState<Kind>('bug')
  const [text, setText] = useState('')
  const [withDetails, setWithDetails] = useState(true)
  const [busy, setBusy] = useState(false)
  const current = KINDS.find((k) => k.id === kind)!

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Ideas go on the public board so other people can back them.
    if (kind === 'idea') {
      suggestOnBoard(splitSuggestion(text))
      setText('')
      onOpenChange(false)
      openPlace(VIEWS.build)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          community: community.id,
          kind,
          body: text.trim(),
          context: withDetails ? appDetails() : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Couldn’t send that. Try again in a moment.')
      toast.success('Thanks, the bug report is in.')
      setText('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t send that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              {kind === 'bug'
                ? 'Goes straight to the people running Cabal. They can reply to you by email.'
                : 'Ideas go on Build Cabal, where everyone can back them and talk them through.'}
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Type of feedback" className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                  kind === k.id && 'border-primary bg-accent',
                )}
              >
                <k.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {k.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="feedback-body">{current.prompt}</Label>
            <Textarea
              id="feedback-body"
              required={kind === 'bug'}
              autoFocus
              maxLength={2000}
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={current.placeholder}
            />
          </div>

          {kind === 'bug' && (
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="feedback-details">Include app details</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Which page you&apos;re on, the app version, your browser and window size. Never your messages.
              </p>
            </div>
            <Switch id="feedback-details" checked={withDetails} onCheckedChange={setWithDetails} />
          </div>
          )}

          <DialogFooter className="items-center sm:justify-between">
            {githubUrl ? (
              <a
                href={`${githubUrl}/issues`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Or open an issue on GitHub
              </a>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || (kind === 'bug' && !text.trim())}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {kind === 'bug' ? 'Send' : 'Continue on Build Cabal'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
