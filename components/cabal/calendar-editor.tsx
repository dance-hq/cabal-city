'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { ago } from '@/lib/time'
import { dayKey, dayLabel, fromLocal, timeRange, toLocalRange, zoneCity, type PendingEvent } from '@/lib/calendar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCabal } from './store'

// add: admin, new · edit: admin, published · review: admin, pending · submit: member
export type EventSeed = { mode: 'add' } | { mode: 'submit' } | { mode: 'edit' | 'review'; id: string }

type Form = {
  title: string
  host: string
  date: string
  start: string
  end: string
  venue: string
  url: string
  summary: string
}

const BLANK: Form = { title: '', host: '', date: '', start: '18:00', end: '', venue: '', url: '', summary: '' }

export function usePendingEvents(communityId: string, isAdmin: boolean) {
  return useSWR(isAdmin ? ['event-review', communityId] : null, async () => {
    const { data, error } = await createClient().rpc('event_review', { p_community: communityId })
    if (error) throw error
    return data as PendingEvent[]
  })
}

const COPY = {
  add: { title: 'Add an event', note: 'It goes on the calendar right away.', save: 'Add' },
  edit: { title: 'Edit event', note: 'Changes show up for everyone right away.', save: 'Save' },
  review: { title: 'Check this event', note: 'Open the link, fix anything that’s off, then publish it.', save: 'Publish' },
  submit: { title: 'Send an event', note: 'Someone will check it before it goes on the calendar.', save: 'Send' },
} as const

export function CalendarEditor({
  seed,
  timeZone,
  onClose,
  onSaved,
}: {
  seed: EventSeed | null
  timeZone: string
  onClose: () => void
  onSaved: () => void
}) {
  const { community } = useCabal()
  const [form, setForm] = useState<Form>(BLANK)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const close = useRef(onClose)
  close.current = onClose
  const id = seed && 'id' in seed ? seed.id : null
  const copy = seed ? COPY[seed.mode] : COPY.add

  useEffect(() => {
    if (!seed) return
    if (!id) {
      setForm(BLANK)
      return
    }
    setLoading(true)
    createClient()
      .rpc('event_detail', { p_event: id })
      .then(({ data, error }) => {
        setLoading(false)
        const row = (data as Record<string, string | null>[] | null)?.[0]
        if (error || !row) {
          toast.error(friendlyError(error) || 'That event is gone.')
          close.current()
          return
        }
        const start = fromLocal(row.starts_local)
        const end = fromLocal(row.ends_local)
        setForm({
          title: row.title ?? '',
          host: row.host ?? '',
          date: start.date,
          start: start.time,
          end: end.time,
          venue: row.venue ?? '',
          url: row.url ?? '',
          summary: row.summary ?? '',
        })
      })
  }, [seed, id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const link = form.url.trim()
  const valid =
    form.title.trim().length >= 3 &&
    !!form.date &&
    !!form.start &&
    form.venue.trim().length >= 2 &&
    (!link || /^https:\/\/\S+\.\S+$/.test(link))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !seed) return
    setBusy(true)
    const { starts, ends } = toLocalRange(form.date, form.start, form.end)
    const fields = {
      p_title: form.title,
      p_host: form.host,
      p_starts: starts,
      p_ends: ends,
      p_venue: form.venue,
      p_url: link,
      p_summary: form.summary,
    }
    const supabase = createClient()
    const { data, error } =
      seed.mode === 'submit'
        ? await supabase.rpc('submit_event', { p_community: community.id, ...fields })
        : await supabase.rpc('save_event', { p_id: id, p_community: community.id, ...fields })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    if (seed.mode === 'submit') {
      toast.success(data === 'known' ? 'That one is already on the calendar or waiting for a look.' : 'Thanks. It shows up once someone checks it.')
    } else {
      toast.success(seed.mode === 'edit' ? 'Saved.' : 'It’s on the calendar.')
    }
    onSaved()
    onClose()
  }

  async function remove() {
    if (!id) return
    setBusy(true)
    const { error } = await createClient().rpc('remove_event', { p_event: id })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    toast.message(seed?.mode === 'review' ? 'Declined.' : 'Taken down.')
    onSaved()
    onClose()
  }

  return (
    <Dialog open={!!seed} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.note}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="event-title">What</Label>
                <Input
                  id="event-title"
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Demo night, coworking day, founder breakfast…"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_auto_auto]">
                <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
                  <Label htmlFor="event-date">Date</Label>
                  <Input id="event-date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-start">Starts</Label>
                  <Input id="event-start" type="time" required value={form.start} onChange={(e) => set('start', e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-end">Ends</Label>
                  <Input id="event-end" type="time" value={form.end} onChange={(e) => set('end', e.target.value)} />
                </div>
                <p className="col-span-2 -mt-2 text-xs text-muted-foreground sm:col-span-3">
                  {zoneCity(timeZone)} time. End time is optional.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-venue">Where</Label>
                  <Input
                    id="event-venue"
                    required
                    maxLength={120}
                    value={form.venue}
                    onChange={(e) => set('venue', e.target.value)}
                    placeholder="Venue or address, or Online"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="event-host">Hosted by</Label>
                  <Input id="event-host" maxLength={80} value={form.host} onChange={(e) => set('host', e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="event-url">Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="event-url"
                    inputMode="url"
                    maxLength={500}
                    value={form.url}
                    onChange={(e) => set('url', e.target.value)}
                    placeholder="https://lu.ma/… for tickets or RSVPs"
                  />
                  {/^https?:\/\/\S+$/.test(link) && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      Open
                      <ArrowUpRight className="size-3" aria-hidden />
                    </a>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="event-summary">About it</Label>
                <Textarea
                  id="event-summary"
                  rows={3}
                  maxLength={400}
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  placeholder="Who it’s for and why it’s worth going."
                />
              </div>
            </>
          )}

          <DialogFooter className="items-center sm:justify-between">
            {seed?.mode === 'edit' || seed?.mode === 'review' ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={busy} className="text-muted-foreground">
                {seed.mode === 'review' ? 'Decline' : 'Take down'}
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
                {copy.save}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ReviewEvents({
  open,
  onOpenChange,
  pending,
  onChanged,
  onReview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: PendingEvent[]
  onChanged: () => void
  onReview: (id: string) => void
}) {
  const { profileById } = useCabal()

  async function decline(id: string) {
    const { error } = await createClient().rpc('remove_event', { p_event: id })
    if (error) toast.error(friendlyError(error))
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Events from members</DialogTitle>
          <DialogDescription>Check each one, then publish it or let it go.</DialogDescription>
        </DialogHeader>
        {pending.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {pending.map((e) => {
              const who = profileById(e.submitted_by)
              const day = dayLabel(dayKey(e.starts_at, e.time_zone), e.time_zone)
              return (
                <li key={e.id} className="flex flex-col gap-1.5 py-3">
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {day.lead ? `${day.lead}, ` : ''}
                    {day.date} · {timeRange(e)} · {e.venue}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {who?.display_name ?? 'A member'} · {ago(e.created_at)}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => decline(e.id)}>
                        Decline
                      </Button>
                      <Button size="sm" onClick={() => onReview(e.id)}>
                        Check
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
