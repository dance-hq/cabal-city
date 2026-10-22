'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { hours, NOTE_MAX } from '@/lib/lock-in-hours'

// "What did you get done?" on a finished session. Only you ever see notes.
export function LockInNoteDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { id: string; seconds: number; note: string | null } | null
  onClose(): void
  onSaved(): void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (target) setText(target.note ?? '')
  }, [target])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    const { error } = await createClient().rpc('note_lock_in', { p_session: target.id, p_note: text })
    setSaving(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <DialogTitle>What did you get done?</DialogTitle>
            <DialogDescription>
              {target ? `${hours(target.seconds)} locked in. ` : ''}A line for yourself. Only you can see it.
            </DialogDescription>
          </div>
          <Textarea
            autoFocus
            value={text}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Got the onboarding flow working end to end"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {text.length}/{NOTE_MAX}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Skip
              </Button>
              <Button type="submit" disabled={saving}>
                Save note
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
