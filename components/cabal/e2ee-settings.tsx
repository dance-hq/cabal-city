'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'
import { phraseKey, SetPhraseForm, usePhrase } from './e2ee-phrase'

type Confirm = 'recovery' | 'forget' | 'remove-phrase' | null

export function EncryptionSettings() {
  const { status, session, setUnlockOpen, setRecoveryOpen, recovery } = useE2ee()
  const { data: hasPhrase } = usePhrase()
  const { mutate } = useSWRConfig()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [editingPhrase, setEditingPhrase] = useState(false)
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
        ? hasPhrase
          ? 'Locked on this device. Unlock it with your unlock phrase, from another device, or with your recovery key.'
          : 'Locked on this device. Unlock it from another device you’re signed in on, or with your recovery key.'
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

      {status === 'ready' && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">Unlock phrase</h4>
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              {hasPhrase
                ? 'On. Any device you sign in on can unlock direct messages by typing it, even when your other devices are off.'
                : 'Pick a phrase once, and any device you sign in on can unlock direct messages by typing it, without waiting on this one.'}
            </p>
          </div>
          {editingPhrase ? (
            <SetPhraseForm
              onDone={() => setEditingPhrase(false)}
              onCancel={() => setEditingPhrase(false)}
              submitLabel={hasPhrase ? 'Change phrase' : 'Save phrase'}
            />
          ) : confirm === 'remove-phrase' ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your phrase stops working everywhere. Devices that are already unlocked stay unlocked.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await session.removePhrase()
                      await mutate(phraseKey(session.userId), false, { revalidate: false })
                      toast.message('Unlock phrase removed.')
                    })
                  }
                >
                  {busy && <Loader2 className="animate-spin" aria-hidden />}
                  Remove phrase
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={hasPhrase ? 'secondary' : 'default'}
                onClick={() => {
                  setConfirm(null)
                  setEditingPhrase(true)
                }}
                disabled={hasPhrase === undefined}
              >
                {hasPhrase ? 'Change phrase' : 'Set an unlock phrase'}
              </Button>
              {hasPhrase && (
                <Button size="sm" variant="ghost" onClick={() => setConfirm('remove-phrase')}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'ready' && (confirm === null || confirm === 'remove-phrase') && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => (recovery ? setRecoveryOpen(true) : setConfirm('recovery'))}>
            {recovery ? 'Show recovery key' : 'Make a new recovery key'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm('forget')}>
            Remove keys from this device
          </Button>
        </div>
      )}

      {(confirm === 'recovery' || confirm === 'forget') && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {confirm === 'recovery'
              ? 'Your old recovery key stops working, and you’ll see the new one once. Use this if you lost the old one or think someone else has it.'
              : hasPhrase
                ? 'This device won’t be able to read direct messages until you unlock it again with your unlock phrase, another device, or your recovery key.'
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
