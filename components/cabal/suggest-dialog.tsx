'use client'

import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Check, ChevronUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { IDEA_STATUS_LABEL, type IdeaStatus } from '@/lib/board'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { boardKey, useVote } from './board-parts'
import { useCabal } from './store'

type Similar = { id: string; title: string; status: IdeaStatus; votes: number; voted: boolean }

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function SuggestDialog({
  draft,
  onClose,
  onOpenIdea,
}: {
  draft: { title: string; body: string } | null
  onClose: () => void
  onOpenIdea: (id: string) => void
}) {
  const { community } = useCabal()
  const { mutate } = useSWRConfig()
  const vote = useVote()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draft) return
    setTitle(draft.title)
    setBody(draft.body)
  }, [draft])

  const q = useDebounced(title.trim(), 300)
  const similar = useSWR(draft && q.length >= 4 ? ['similar-ideas', q] : null, async () => {
    const { data, error } = await createClient().rpc('similar_ideas', { p_text: q })
    if (error) throw error
    return data as Similar[]
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (title.trim().length < 3) return
    setBusy(true)
    const { data, error } = await createClient().rpc('suggest_idea', {
      p_community: community.id,
      p_title: title,
      p_body: body,
    })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    mutate(boardKey)
    toast.success('Posted. You’re its first supporter.')
    onOpenIdea(data as string)
  }

  async function support(s: Similar) {
    await vote({ id: s.id, voted: s.voted, status: s.status })
    similar.mutate()
  }

  const matches = similar.data ?? []

  return (
    <Dialog open={!!draft} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Suggest an improvement</DialogTitle>
            <DialogDescription>Everyone in Cabal can see it, back it and talk it through.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="idea-title">What should get better?</Label>
            <Input
              id="idea-title"
              required
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Show who's typing in the desktop corner"
            />
          </div>

          {matches.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md bg-accent/60 p-3">
              <p className="text-xs text-muted-foreground">Already suggested? Back it instead:</p>
              <ul className="flex flex-col gap-1">
                {matches.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenIdea(s.id)}
                      className="min-w-0 flex-1 truncate rounded text-left text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {s.title}
                      {s.status !== 'requested' && (
                        <span className="text-muted-foreground"> · {IDEA_STATUS_LABEL[s.status]}</span>
                      )}
                    </button>
                    {s.status !== 'shipped' && (
                      <button
                        type="button"
                        onClick={() => support(s)}
                        aria-pressed={s.voted}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded border bg-background px-1.5 font-mono text-[11px] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.voted ? <Check className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />}
                        {s.votes}
                        <span className="sr-only">{s.voted ? 'You support this' : 'Support this'}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="idea-body">
              More detail <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="idea-body"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What you'd use it for, or what bugs you today."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || title.trim().length < 3}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Post idea
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
