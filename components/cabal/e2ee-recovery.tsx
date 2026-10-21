'use client'

import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'

export function RecoveryKeyDialog() {
  const { recovery, recoveryOpen, setRecoveryOpen, session, madeRecovery } = useE2ee()
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!recovery) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(recovery!)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Couldn’t copy. Select the key and copy it yourself.')
    }
  }

  function download() {
    const text = [
      'Cabal recovery key',
      '',
      recovery,
      '',
      'This unlocks your direct messages on a new device when you can’t approve it from one you already use.',
      'Keep it private. Anyone with it and your email could read your direct messages.',
      '',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'cabal-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function done() {
    try {
      await session.confirmRecoverySaved()
      setRecoveryOpen(false)
      setSaved(false)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-balance">
            {madeRecovery ? 'Your direct messages are end-to-end encrypted' : 'Your recovery key'}
          </DialogTitle>
          <DialogDescription className="leading-relaxed text-pretty">
            Only your devices can read your direct messages: not the admins, and not the people who run Cabal. If you ever lose every
            device you’re signed in on, this key is the only way back into your messages.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4">
          <p
            className="flex flex-wrap justify-center gap-x-3 gap-y-1 font-mono text-lg tracking-wider text-foreground select-all"
            aria-label={`Recovery key: ${recovery.split('-').join(' ')}`}
          >
            {recovery.split('-').map((group, i) => (
              <span key={i}>{group}</span>
            ))}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="secondary" size="sm" onClick={download}>
              <Download aria-hidden />
              Download
            </Button>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          I’ve saved it somewhere safe, like a password manager.
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setRecoveryOpen(false)}>
            Later
          </Button>
          <Button disabled={!saved} onClick={done}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
