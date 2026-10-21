'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Claim, RequestRow } from '@/lib/e2ee/session'
import { friendlyError } from '@/lib/errors'
import { clock } from '@/lib/time'
import { requestsKey, useE2ee } from './e2ee-provider'

// On a device that has your keys: another device of yours asked for them.
// You say it's you, both screens show a code, and only when they match does
// this device seal your keys for the new one.
export function ApproveDevices() {
  const { session, status } = useE2ee()
  const { data: requests } = useSWR(status === 'ready' ? requestsKey(session.userId) : null, () => session.waitingRequests(), {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  })
  const [handled, setHandled] = useState<Set<string>>(() => new Set())
  const [active, setActive] = useState<{ claim: Claim; row: RequestRow } | null>(null)
  const [busy, setBusy] = useState(false)

  const request = active?.row ?? requests?.find((r) => !handled.has(r.id))
  const done = (id: string) => {
    setHandled((s) => new Set(s).add(id))
    setActive(null)
  }

  async function decline(row: RequestRow) {
    done(row.id)
    try {
      await session.decline(row.id)
      toast.message('Declined. If that wasn’t you, someone may be able to get into your email: change its password.')
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  async function begin(row: RequestRow) {
    setBusy(true)
    try {
      setActive({ claim: await session.claim(row), row })
    } catch (err) {
      done(row.id)
      toast.error(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    if (!active) return
    setBusy(true)
    try {
      await session.approve(active.claim)
      toast.success(`Unlocked. ${active.row.label} can read your direct messages now.`)
      done(active.row.id)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (open || !request) return
        if (active) void decline(request)
        else done(request.id)
      }}
    >
      <DialogContent className="sm:max-w-md">
        {request && !active && (
          <>
            <DialogHeader>
              <DialogTitle>Unlock a new device?</DialogTitle>
              <DialogDescription className="leading-relaxed text-pretty">
                <span className="font-medium text-foreground">{request.label}</span> asked at {clock(request.created_at)} to
                read and send your direct messages. Only continue if you’re setting it up yourself right now.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => decline(request)} disabled={busy}>
                Not me
              </Button>
              <Button onClick={() => begin(request)} disabled={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                It’s me
              </Button>
            </DialogFooter>
          </>
        )}
        {active && <Compare active={active} busy={busy} onApprove={approve} onDecline={() => decline(active.row)} />}
      </DialogContent>
    </Dialog>
  )
}

function Compare({
  active,
  busy,
  onApprove,
  onDecline,
}: {
  active: { claim: Claim; row: RequestRow }
  busy: boolean
  onApprove: () => void
  onDecline: () => void
}) {
  const { session } = useE2ee()
  const { data: progress, error } = useSWR(['e2ee-claim', active.claim.id], () => session.checkClaim(active.claim), {
    refreshInterval: (p) => (!p || p.state === 'waiting' ? 1500 : 0),
    dedupingInterval: 1000,
    shouldRetryOnError: false,
  })
  const gone = !!error || progress?.state === 'expired' || progress?.state === 'declined'

  return (
    <>
      <DialogHeader>
        <DialogTitle>Do the codes match?</DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          {gone
            ? 'That request expired. Start again on the new device.'
            : `${active.row.label} is showing a code. Approve only if it’s the same as this one.`}
        </DialogDescription>
      </DialogHeader>
      {progress?.state === 'compare' ? (
        <div className="flex justify-center rounded-md border bg-muted/40 py-5">
          <p className="font-mono text-3xl tracking-[0.2em] text-foreground tabular-nums" aria-label={`Code ${progress.code.split('').join(' ')}`}>
            {progress.code.slice(0, 3)} {progress.code.slice(3)}
          </p>
        </div>
      ) : (
        !gone && (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Waiting for the new device…
          </p>
        )
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onDecline} disabled={busy}>
          {gone ? 'Close' : 'They’re different'}
        </Button>
        {!gone && (
          <Button onClick={onApprove} disabled={busy || progress?.state !== 'compare'}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            They match, unlock it
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
