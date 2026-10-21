'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCabal } from './store'

export function DeleteAccount() {
  const { me, email } = useCabal()
  const confirmWord = me.username ?? email
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === confirmWord.toLowerCase()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!matches || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: typed.trim() }),
    }).catch(() => null)
    if (res?.ok) {
      window.location.replace('/?account=deleted')
      return
    }
    const data = (await res?.json().catch(() => null)) as { error?: string } | null
    setError(data?.error ?? "We couldn't reach Cabal. Check your connection and try again.")
    setBusy(false)
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Deletes your profile, photo and every message you&apos;ve sent. This can&apos;t be undone.
        </p>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return
          setOpen(o)
          if (!o) {
            setTyped('')
            setError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Your profile, photo and every message you wrote, in channels, teams and DMs, are deleted for good. Teams you
            own pass to the next longest-standing member. Other people&apos;s messages stay where they are.
          </DialogDescription>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-delete">
                Type <span className="font-mono">{confirmWord}</span> to confirm
              </Label>
              <Input
                id="confirm-delete"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'delete-error' : undefined}
              />
              {error && (
                <p id="delete-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Keep my account
              </Button>
              <Button type="submit" variant="destructive" disabled={!matches || busy}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Delete forever
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
