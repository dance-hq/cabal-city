'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'

type Confirm = 'recovery' | 'forget' | null

export function EncryptionSettings() {
  const { status, session, setUnlockOpen, setRecoveryOpen, recovery } = useE2ee()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      setConfirm(null)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const summary =
    status === 'ready'
      ? 'End-to-end encrypted. This device has your keys, so only you and the person you’re talking to can read your direct messages.'
      : status === 'locked'
        ? 'Locked on this device. Unlock it from another device you’re signed in on, or with your recovery key.'
        : status === 'unsupported'
          ? 'This browser can’t do the encryption direct messages need. Use the Cabal desktop app or an up-to-date browser.'
          : status === 'error'
            ? 'Couldn’t check your keys. Check your connection.'
            : 'Checking…'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Direct messages</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{summary}</p>
      </div>

      {status === 'locked' && (
        <div>
          <Button size="sm" onClick={() => setUnlockOpen(true)}>
            Unlock this device
          </Button>
        </div>
      )}

      {status === 'ready' && confirm === null && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => (recovery ? setRecoveryOpen(true) : setConfirm('recovery'))}>
            {recovery ? 'Show recovery key' : 'Make a new recovery key'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm('forget')}>
            Remove keys from this device
          </Button>
        </div>
      )}

      {confirm && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {confirm === 'recovery'
              ? 'Your old recovery key stops working, and you’ll see the new one once. Use this if you lost the old one or think someone else has it.'
              : 'This device won’t be able to read direct messages until you unlock it again from another device or with your recovery key. If this is your only device and you haven’t saved your recovery key, you’ll lose your messages.'}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={confirm === 'forget' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (confirm === 'recovery') {
                    await session.replaceRecoveryKey()
                    setRecoveryOpen(true)
                  } else {
                    await session.forgetThisDevice()
                    toast.message('Removed. Direct messages are locked on this device.')
                  }
                })
              }
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {confirm === 'recovery' ? 'Make a new key' : 'Remove keys'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
