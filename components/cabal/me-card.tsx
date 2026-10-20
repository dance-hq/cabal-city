'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar } from './avatar'
import { StatusDot, STATUS_LABEL } from './status-dot'
import { useCabal } from './store'
import { createClient } from '@/lib/supabase/client'
import { STATUS_MAX } from '@/lib/config'
import { friendlyError } from '@/lib/errors'
import type { Availability } from '@/lib/types'

const CHOICES: { value: Availability; hint: string }[] = [
  { value: 'online', hint: 'Around and reachable' },
  { value: 'away', hint: 'Stepped away for a bit' },
  { value: 'dnd', hint: 'Here, but notifications are muted' },
  { value: 'invisible', hint: 'Connected, shown as offline' },
]

export function MeCard() {
  const { me, settings, setAvailability, statusOf, userId, refreshMembers, showProfile } = useCabal()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  async function saveStatus(text: string) {
    setEditing(false)
    const value = text.trim().slice(0, STATUS_MAX) || null
    if (value === (me.status_text ?? null)) return
    const { error } = await createClient().from('profiles').update({ status_text: value }).eq('id', userId)
    if (error) toast.error(friendlyError(error))
    else refreshMembers()
  }

  const shown = settings.availability === 'invisible' ? 'invisible' : statusOf(userId)

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <button
        type="button"
        onClick={() => showProfile(userId)}
        className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Your profile"
      >
        <Avatar name={me.display_name ?? ''} url={me.avatar_url} size={36} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{me.display_name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Availability: ${STATUS_LABEL[shown]}. Change`}
            >
              <StatusDot status={shown} size={8} decorative />
              {STATUS_LABEL[shown]}
              <ChevronDown className="size-3" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuRadioGroup value={settings.availability} onValueChange={(v) => setAvailability(v as Availability)}>
                {CHOICES.map((c) => (
                  <DropdownMenuRadioItem key={c.value} value={c.value} closeOnClick className="items-start py-1.5">
                    <StatusDot status={c.value} size={8} className="mt-1.5" decorative />
                    <span className="flex flex-col">
                      <span>{STATUS_LABEL[c.value]}</span>
                      <span className="text-xs text-muted-foreground">{c.hint}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={STATUS_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => saveStatus(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) saveStatus(draft)
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="What are you up to?"
            aria-label="Your status"
            className="-mx-1 rounded bg-sidebar-accent px-1 text-xs outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(me.status_text ?? '')
              setEditing(true)
            }}
            className="-mx-1 truncate rounded px-1 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {me.status_text || 'Set a status…'}
          </button>
        )}
      </div>
    </div>
  )
}
