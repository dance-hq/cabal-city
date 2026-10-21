'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { IDENTITIES, type Identity } from '@/lib/identity'
import { OPPORTUNITY_KINDS, type OpportunityKind } from '@/lib/opportunities'
import { ago } from '@/lib/time'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useCabal } from './store'

export type Submission = { id: string; url: string; note: string | null; submitted_by: string | null; created_at: string }

// Opening the editor: nothing (new), an existing entry, or a member's link.
export type EditorSeed = { id?: string; url?: string; submission?: string }

type Form = {
  kind: OpportunityKind
  title: string
  provider: string
  summary: string
  eligibility: string
  place: string
  deadline: string
  url: string
  audiences: Identity[]
  everywhere: boolean
}

const BLANK: Form = {
  kind: 'credits',
  title: '',
  provider: '',
  summary: '',
  eligibility: '',
  place: '',
  deadline: '',
  url: '',
  audiences: [],
  everywhere: false,
}

export function useSubmissions(communityId: string, isAdmin: boolean) {
  return useSWR(isAdmin ? ['opportunity-review', communityId] : null, async () => {
    const { data, error } = await createClient().rpc('opportunity_review', { p_community: communityId })
    if (error) throw error
    return data as Submission[]
  })
}

export function OpportunityEditor({
  seed,
  onClose,
  onSaved,
}: {
  seed: EditorSeed | null
  onClose: () => void
  onSaved: () => void
}) {
  const { community } = useCabal()
  const [form, setForm] = useState<Form>(BLANK)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const editingId = seed?.id
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!seed) return
    if (!seed.id) {
      setForm({ ...BLANK, url: seed.url ?? '', place: community.name.split(' ')[0] ?? '' })
      return
    }
    setLoading(true)
    createClient()
      .rpc('opportunity_detail', { p_opportunity: seed.id })
      .then(({ data, error }) => {
        setLoading(false)
        const row = (data as Record<string, unknown>[] | null)?.[0]
        if (error || !row) {
          toast.error(friendlyError(error) || 'That opportunity is gone.')
          close.current()
          return
        }
        setForm({
          kind: row.kind as OpportunityKind,
          title: String(row.title ?? ''),
          provider: String(row.provider ?? ''),
          summary: String(row.summary ?? ''),
          eligibility: String(row.eligibility ?? ''),
          place: String(row.place ?? ''),
          deadline: String(row.deadline ?? ''),
          url: String(row.url ?? ''),
          audiences: (row.audiences as Identity[]) ?? [],
          everywhere: row.community_id === null,
        })
      })
  }, [seed, community.name])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const valid =
    form.title.trim().length >= 3 &&
    form.summary.trim().length >= 10 &&
    form.place.trim().length >= 2 &&
    /^https:\/\/\S+$/.test(form.url.trim())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    const { error } = await createClient().rpc('save_opportunity', {
      p_id: editingId ?? null,
      p_community: community.id,
      p_everywhere: form.everywhere,
      p_kind: form.kind,
      p_title: form.title,
      p_provider: form.provider,
      p_summary: form.summary,
      p_eligibility: form.eligibility,
      p_place: form.place,
      p_deadline: form.deadline || null,
      p_url: form.url,
      p_audiences: form.audiences,
      p_submission: seed?.submission ?? null,
    })
    setBusy(false)
    if (error) {
      toast.error(error.code === '23505' ? 'That link is already listed.' : friendlyError(error))
      return
    }
    toast.success(editingId ? 'Updated and marked as checked today.' : 'Added. Members can see it now.')
    onSaved()
    onClose()
  }

  async function takeDown() {
    if (!editingId) return
    setBusy(true)
    const { error } = await createClient().rpc('archive_opportunity', { p_opportunity: editingId })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    toast.message('Taken down.')
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!seed} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit opportunity' : 'Add an opportunity'}</DialogTitle>
            <DialogDescription>
              Only write what the source says. Saving marks it as checked today, so open the source first.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-url">Source link</Label>
                <div className="flex gap-2">
                  <Input
                    id="opp-url"
                    required
                    value={form.url}
                    onChange={(e) => set('url', e.target.value)}
                    placeholder="https://…"
                  />
                  {/^https?:\/\/\S+$/.test(form.url.trim()) && (
                    <a
                      href={form.url.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Open
                      <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Kind</legend>
                <div className="grid grid-cols-2 gap-2">
                  {OPPORTUNITY_KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      aria-pressed={form.kind === k.value}
                      onClick={() => set('kind', k.value)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                        form.kind === k.value && 'border-primary bg-accent',
                      )}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="opp-title">Title</Label>
                  <Input id="opp-title" required maxLength={120} value={form.title} onChange={(e) => set('title', e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="opp-provider">Who runs it</Label>
                  <Input id="opp-provider" maxLength={80} value={form.provider} onChange={(e) => set('provider', e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="opp-place">Where</Label>
                  <Input
                    id="opp-place"
                    required
                    maxLength={60}
                    value={form.place}
                    onChange={(e) => set('place', e.target.value)}
                    placeholder="Chicago, Remote, United States…"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-summary">What it&apos;s worth</Label>
                <Textarea
                  id="opp-summary"
                  required
                  rows={3}
                  maxLength={400}
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  placeholder="The value in a sentence or two."
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="opp-eligibility">Who it&apos;s for</Label>
                <Textarea
                  id="opp-eligibility"
                  rows={2}
                  maxLength={400}
                  value={form.eligibility}
                  onChange={(e) => set('eligibility', e.target.value)}
                  placeholder="Eligibility as the source states it."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="opp-deadline">Deadline</Label>
                  <Input id="opp-deadline" type="date" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Leave empty unless the source gives one.</p>
                </div>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Most useful for</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {IDENTITIES.map((i) => {
                      const on = form.audiences.includes(i.value)
                      return (
                        <button
                          key={i.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            set('audiences', on ? form.audiences.filter((a) => a !== i.value) : [...form.audiences, i.value])
                          }
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                            on && 'border-primary bg-accent',
                          )}
                        >
                          {i.label}s
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="opp-everywhere">Show in every city</Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    For national and remote programs. Off keeps it in {community.name}.
                  </p>
                </div>
                <Switch id="opp-everywhere" checked={form.everywhere} onCheckedChange={(v) => set('everywhere', v)} />
              </div>
            </>
          )}

          <DialogFooter className="items-center sm:justify-between">
            {editingId ? (
              <Button type="button" variant="ghost" onClick={takeDown} disabled={busy} className="text-muted-foreground">
                Take down
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || loading || !valid}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {editingId ? 'Save' : 'Add'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ReviewSubmissions({
  open,
  onOpenChange,
  submissions,
  onChanged,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  submissions: Submission[]
  onChanged: () => void
  onAdd: (s: Submission) => void
}) {
  const { profileById } = useCabal()

  async function dismiss(id: string) {
    const { error } = await createClient().rpc('dismiss_opportunity_submission', { p_submission: id })
    if (error) toast.error(friendlyError(error))
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Links from members</DialogTitle>
          <DialogDescription>Check the source, then add it in your own words or let it go.</DialogDescription>
        </DialogHeader>
        {submissions.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {submissions.map((s) => {
              const who = profileById(s.submitted_by)
              return (
                <li key={s.id} className="flex flex-col gap-2 py-3">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-sm break-all text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
                  >
                    {s.url}
                    <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                  </a>
                  {s.note && <p className="text-sm leading-relaxed text-muted-foreground">{s.note}</p>}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {who?.display_name ?? 'A member'} · {ago(s.created_at)}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => dismiss(s.id)}>
                        Dismiss
                      </Button>
                      <Button size="sm" onClick={() => onAdd(s)}>
                        Add
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
