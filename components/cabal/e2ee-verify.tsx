'use client'

import useSWR, { useSWRConfig } from 'swr'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { securityCode } from '@/lib/e2ee/crypto'
import type { PeerState } from '@/lib/e2ee/session'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'

export function VerifyDialog({
  open,
  onOpenChange,
  peerId,
  name,
  peer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  peerId: string
  name: string
  peer: PeerState | undefined
}) {
  const { session, activeKey } = useE2ee()
  const { mutate } = useSWRConfig()
  const theirs = peer?.key
  const { data: code } = useSWR(
    open && theirs && activeKey ? ['e2ee-code', activeKey, theirs.publicKey] : null,
    () => securityCode({ userId: session.userId, publicKey: activeKey! }, { userId: peerId, publicKey: theirs!.publicKey }),
  )

  async function matched() {
    if (!theirs) return
    try {
      await session.markVerified(peerId, theirs.id)
      await mutate(['e2ee-peer', peerId])
      toast.success(`Verified. Only you and ${name} can read these messages.`)
      onOpenChange(false)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check your encryption with {name}</DialogTitle>
          <DialogDescription className="leading-relaxed text-pretty">
            Compare these numbers with {name}, in person or on a call. If they’re the same on both of your screens,
            nobody can read your messages in between, including us.
          </DialogDescription>
        </DialogHeader>
        {code ? (
          <div className="grid grid-cols-4 justify-items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-4 font-mono text-[15px] text-foreground tabular-nums">
            {code.map((group, i) => (
              <span key={i}>{group}</span>
            ))}
          </div>
        ) : (
          <div className="h-[104px] animate-pulse rounded-md bg-muted/40" aria-hidden />
        )}
        {peer?.verified ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-mark">
            <ShieldCheck className="size-4" aria-hidden />
            You checked this code with {name} on this device.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            The code changes if either of you starts over with new keys. Marking it as checked is remembered on this device.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!peer?.verified && (
            <Button onClick={matched} disabled={!code}>
              They match
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
