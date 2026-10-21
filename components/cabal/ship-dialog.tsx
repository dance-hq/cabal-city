'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { isGithubUrl } from '@/lib/board'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { shipsKey } from './board-parts'

// For improvements that didn't start as a board idea: a fix, a polish pass.
// Ideas ship from their own page so the suggester gets the credit.
export function ShipDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate } = useSWRConfig()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const linkValid = !link.trim() || isGithubUrl(link)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length < 3 || !linkValid) return
    setBusy(true)
    const { error } = await createClient().rpc('post_ship', { p_title: title, p_body: body, p_link: link })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    mutate(shipsKey)
    setTitle('')
    setBody('')
    setLink('')
    onOpenChange(false)
    toast.success('Posted. It’s the latest ship now.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Post a ship</DialogTitle>
            <DialogDescription>
              Only for something that&apos;s live for members now. If it came from the board, mark that idea Shipped instead.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-title">What shipped</Label>
            <Input id="ship-title" required autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-body">
              What changed for people <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="ship-body" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ship-link">
              Pull request <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="ship-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://github.com/…/pull/123"
            />
            {!linkValid && <p className="text-xs text-destructive">Use a github.com link.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || title.trim().length < 3 || !linkValid}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Post
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
