'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { KeyRound, Laptop, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deviceLabel } from '@/lib/e2ee/device-label'
import type { OutgoingRequest } from '@/lib/e2ee/session'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'

type View = 'choose' | 'device' | 'recovery' | 'reset'

// For a device that doesn't have your keys yet: get them from a device you
// already use, from your recovery key, or start over.
export function UnlockDialog() {
  const { unlockOpen, setUnlockOpen, session } = useE2ee()
  const [view, setView] = useState<View>('choose')
  const [req, setReq] = useState<OutgoingRequest | null>(null)
  const [starting, setStarting] = useState(false)

  function finish() {
    setReq(null)
    setView('choose')
    setUnlockOpen(false)
  }

  function onOpenChange(open: boolean) {
    if (open) return setUnlockOpen(true)
    if (req) void session.cancelUnlock(req)
    finish()
  }

  async function askDevice() {
    setStarting(true)
    try {
      setReq(await session.requestUnlock(deviceLabel()))
      setView('device')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setStarting(false)
    }
  }

  function unlocked() {
    toast.success('Unlocked. Your direct messages are readable on this device.')
    finish()
  }

  return (
    <Dialog open={unlockOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {view === 'choose' && (
          <>
            <DialogHeader>
              <DialogTitle>Unlock direct messages</DialogTitle>
              <DialogDescription className="leading-relaxed text-pretty">
                Direct messages are end-to-end encrypted, so this device needs your keys before it can read or send them.
                Rooms and teams work as usual.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Choice
                icon={starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Laptop className="size-4" aria-hidden />}
                title="Approve from another device"
                hint="A computer or browser where you’re already signed in to Cabal."
                onClick={askDevice}
                disabled={starting}
              />
              <Choice
                icon={<KeyRound className="size-4" aria-hidden />}
                title="Use my recovery key"
                hint="The 24 letters and numbers you saved."
                onClick={() => setView('recovery')}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Lost both?{' '}
              <button
                type="button"
                onClick={() => setView('reset')}
                className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
              >
                Start over with new keys
              </button>
            </p>
          </>
        )}
        {view === 'device' && req && (
          <DeviceView
            req={req}
            onDone={unlocked}
            onRetry={async () => {
              void session.cancelUnlock(req)
              setReq(null)
              await askDevice()
            }}
            onBack={() => {
              void session.cancelUnlock(req)
              setReq(null)
              setView('choose')
            }}
          />
        )}
        {view === 'recovery' && <RecoveryView onDone={unlocked} onBack={() => setView('choose')} />}
        {view === 'reset' && <ResetView onDone={finish} onBack={() => setView('choose')} />}
      </DialogContent>
    </Dialog>
  )
}

function Choice({
  icon,
  title,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-md border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

function DeviceView({
  req,
  onDone,
  onRetry,
  onBack,
}: {
  req: OutgoingRequest
  onDone: () => void
  onRetry: () => void
  onBack: () => void
}) {
  const { session } = useE2ee()
  const { data: progress, error } = useSWR(['e2ee-unlock', req.id], () => session.checkUnlock(req), {
    refreshInterval: (p) => (!p || p.state === 'waiting' || p.state === 'compare' ? 1500 : 0),
    revalidateOnFocus: true,
    dedupingInterval: 1000,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (progress?.state === 'done') onDone()
  }, [progress?.state, onDone])

  const state = error ? 'failed' : (progress?.state ?? 'waiting')

  return (
    <>
      <DialogHeader>
        <DialogTitle>{state === 'compare' ? 'Check the code' : 'Approve from another device'}</DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          {state === 'compare'
            ? 'Make sure your other device shows the same code, then approve it there.'
            : state === 'declined'
              ? 'Your other device said no.'
              : state === 'expired'
                ? 'That request expired.'
                : state === 'failed'
                  ? friendlyError(error)
                  : 'Open Cabal on a computer or browser where you’re already signed in. It will ask whether to unlock this one.'}
        </DialogDescription>
      </DialogHeader>

      {state === 'compare' && progress?.state === 'compare' ? (
        <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/40 py-5">
          <p className="font-mono text-3xl tracking-[0.2em] text-foreground tabular-nums" aria-label={`Code ${progress.code.split('').join(' ')}`}>
            {progress.code.slice(0, 3)} {progress.code.slice(3)}
          </p>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            waiting for you to approve it there
          </p>
        </div>
      ) : state === 'waiting' ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Waiting for your other device…
        </p>
      ) : null}

      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        {(state === 'declined' || state === 'expired' || state === 'failed') && <Button onClick={onRetry}>Try again</Button>}
      </DialogFooter>
    </>
  )
}

function RecoveryView({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { session } = useE2ee()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      await session.unlockWithRecoveryKey(value)
      onDone()
    } catch (err) {
      setProblem(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Use your recovery key</DialogTitle>
        <DialogDescription>Type or paste the key you saved when encryption was set up.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="recovery-key">Recovery key</Label>
        <Input
          id="recovery-key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          aria-invalid={!!problem}
          aria-describedby={problem ? 'recovery-problem' : undefined}
          className="font-mono uppercase tracking-wider"
        />
        {problem && (
          <p id="recovery-problem" className="text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={busy || value.replace(/[\s-]/g, '').length < 24}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Unlock
        </Button>
      </DialogFooter>
    </form>
  )
}

function ResetView({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { session } = useE2ee()
  const [busy, setBusy] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      await session.reset()
      onDone()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Start over with new keys?</DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          Only for when you’ve lost every device you were signed in on and your recovery key.
        </DialogDescription>
      </DialogHeader>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>Direct messages sent before now stay unreadable for you, on every device, for good. Nobody can recover them.</li>
        <li>The people you message will see that your security code changed.</li>
        <li>You’ll get a new recovery key to save.</li>
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="destructive" onClick={reset} disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Start over
        </Button>
      </DialogFooter>
    </>
  )
}
