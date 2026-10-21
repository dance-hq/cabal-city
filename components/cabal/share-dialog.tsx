'use client'

import { useMemo, useState } from 'react'
import { Hash, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Channel } from '@/lib/types'
import { Avatar } from './avatar'
import { useCabal } from './store'
import { TeamIcon } from './team-dialogs'

// Posts a ready-made message into a channel, team or DM you're already in.
export function ShareDialog({
  text,
  what,
  open,
  onOpenChange,
}: {
  text: string
  what: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { channels, profileById, blocked, send, open: openChannel } = useCabal()
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState<string | null>(null)

  const places = useMemo(() => {
    const named = channels
      .filter((c) => !(c.kind === 'dm' && c.other_user_id && blocked.has(c.other_user_id)))
      .map((c) => ({ channel: c, name: nameOf(c, profileById) }))
    const q = query.trim().toLowerCase()
    return named
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Date.parse(b.channel.last_message_at ?? '1970-01-01') - Date.parse(a.channel.last_message_at ?? '1970-01-01'),
      )
  }, [channels, profileById, blocked, query])

  async function share(c: Channel, name: string) {
    setSending(c.id)
    const sent = await send(c.id, text)
    setSending(null)
    if (!sent) {
      toast.error(`Couldn’t share in ${name}. Try again from there.`)
      return
    }
    onOpenChange(false)
    setQuery('')
    toast.success(`Shared in ${name}`, { action: { label: 'Open', onClick: () => openChannel(c.id) } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription className="line-clamp-2">{what}</DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">Find a channel, team or person</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Channel, team or person"
            className="h-9 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </label>
        <ul className="quiet-scroll -mx-2 flex max-h-72 flex-col overflow-y-auto">
          {places.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">
              {query ? 'Nothing matches.' : 'Join a channel or start a conversation first.'}
            </li>
          )}
          {places.map(({ channel: c, name }) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={!!sending}
                onClick={() => share(c, name)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
                  {c.kind === 'room' ? (
                    <Hash className="size-3.5" aria-hidden />
                  ) : c.kind === 'team' ? (
                    <TeamIcon visibility={c.team_visibility} className="size-3.5" />
                  ) : (
                    <Avatar name={name} url={profileById(c.other_user_id)?.avatar_url} size={22} />
                  )}
                </span>
                <span className={c.kind === 'room' ? 'flex-1 truncate font-mono text-[13px]' : 'flex-1 truncate'}>
                  {c.kind === 'room' ? c.slug : name}
                </span>
                {sending === c.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function nameOf(c: Channel, profileById: ReturnType<typeof useCabal>['profileById']) {
  if (c.kind === 'room') return `#${c.slug}`
  if (c.kind === 'team') return c.team_name ?? 'Team'
  const p = profileById(c.other_user_id)
  return p?.display_name ?? p?.username ?? 'Former member'
}
