'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'

export function ReportDialog({
  open,
  onOpenChange,
  title,
  excerpt,
  description,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  excerpt?: string
  description?: string
  onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(reason.trim())
      toast.success('Report sent to the community admins.')
      setReason('')
      onOpenChange(false)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description ?? `Admins of this community will see your report${excerpt ? ' and a copy of the message' : ''}.`}
            </DialogDescription>
          </DialogHeader>
          {excerpt && (
            <blockquote className="max-h-24 overflow-hidden rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {excerpt}
            </blockquote>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="report-reason">What&apos;s wrong?</Label>
            <Textarea
              id="report-reason"
              required
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Spam, harassment, something else…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export async function setBlocked(me: string, other: string, block: boolean) {
  const supabase = createClient()
  const { error } = block
    ? await supabase.from('blocks').insert({ blocker_id: me, blocked_id: other })
    : await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', other)
  if (error && error.code !== '23505') {
    toast.error(friendlyError(error))
    return false
  }
  return true
}
