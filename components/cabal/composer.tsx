'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MESSAGE_MAX } from '@/lib/config'
import { cleanBody } from '@/lib/text'
import { channelName, channelQuery, encodeChannelLinks, matchChannels } from '@/lib/channel-links'
import { useLinkableChannels } from './channel-links'
import { TeamIcon } from './team-dialogs'

export function Composer({
  channelId,
  placeholder,
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  disabledReason,
}: {
  channelId: string
  placeholder: string
  onSend: (body: string) => void
  onTyping: () => void
  onStopTyping: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Channels picked from the # list, per draft, so a pick wins over a same-named team.
  const picks = useRef(new Map<string, Map<string, string>>())
  const value = drafts[channelId] ?? ''
  const ref = useRef<HTMLTextAreaElement>(null)
  const linkables = useLinkableChannels()
  const [caret, setCaret] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [channelId])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const set = (v: string) => setDrafts((d) => ({ ...d, [channelId]: v }))
  const body = cleanBody(value)
  const tooLong = body.length > MESSAGE_MAX

  const trigger = caret === null ? null : channelQuery(value.slice(0, caret))
  const suggestions =
    trigger && trigger.start !== dismissedAt && linkables.data ? matchChannels(linkables.data, trigger.query, channelId) : []
  const listOpen = suggestions.length > 0
  const active = Math.min(highlight, suggestions.length - 1)
  const listId = `composer-${channelId}-channels`

  function trackCaret() {
    const el = ref.current
    setCaret(el && el.selectionStart === el.selectionEnd ? el.selectionStart : null)
  }

  function pick(index: number) {
    const c = suggestions[index]
    if (!trigger || !c || caret === null) return
    const name = channelName(c)
    const next = `${value.slice(0, trigger.start)}#${name} ${value.slice(caret)}`
    const at = trigger.start + name.length + 2
    let draftPicks = picks.current.get(channelId)
    if (!draftPicks) picks.current.set(channelId, (draftPicks = new Map()))
    draftPicks.set(name, c.id)
    set(next)
    setCaret(at)
    setHighlight(0)
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(at, at)
    })
  }

  function submit() {
    if (!body || tooLong || disabled) return
    const linked = encodeChannelLinks(body, picks.current.get(channelId) ?? new Map(), linkables.data ?? [])
    onSend(linked.length <= MESSAGE_MAX ? linked : body)
    picks.current.delete(channelId)
    onStopTyping()
    set('')
  }

  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      <div className="relative">
        {listOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Link a channel"
            className="absolute right-0 bottom-full left-0 z-20 mb-1.5 flex max-h-64 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <li role="presentation" className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
              Link a channel
            </li>
            {suggestions.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(i)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                {c.kind === 'room' ? (
                  <Hash className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <TeamIcon visibility={c.team_visibility} className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className={cn('truncate', c.kind === 'room' && 'font-mono text-[13px]')}>{channelName(c)}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {c.kind === 'room'
                    ? 'room'
                    : c.joined
                      ? c.team_visibility === 'private'
                        ? 'your team · invite-only'
                        : 'your team'
                      : `${c.member_count ?? 0} ${c.member_count === 1 ? 'member' : 'members'}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div
          className={cn(
            'flex items-end gap-2 rounded-lg border bg-card px-3 py-2 focus-within:border-ring',
            tooLong && 'border-destructive focus-within:border-destructive',
          )}
        >
          <label htmlFor={`composer-${channelId}`} className="sr-only">
            {placeholder}
          </label>
          <textarea
            id={`composer-${channelId}`}
            ref={ref}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={disabled ? disabledReason : placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? `${listId}-${suggestions[active].id}` : undefined}
            onChange={(e) => {
              set(e.target.value)
              setCaret(e.target.selectionStart === e.target.selectionEnd ? e.target.selectionStart : null)
              setHighlight(0)
              if (e.target.value.trim()) onTyping()
              else onStopTyping()
            }}
            onSelect={trackCaret}
            onBlur={() => setCaret(null)}
            onFocus={trackCaret}
            onKeyDown={(e) => {
              const composing = e.nativeEvent.isComposing || e.keyCode === 229
              if (listOpen && !composing) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const step = e.key === 'ArrowDown' ? 1 : -1
                  setHighlight((active + step + suggestions.length) % suggestions.length)
                  return
                }
                if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                  e.preventDefault()
                  pick(active)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setDismissedAt(trigger?.start ?? null)
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey && !composing) {
                e.preventDefault()
                submit()
              }
            }}
            className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!body || tooLong || disabled}
            aria-label="Send message"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="mt-1 flex h-4 items-center justify-between px-1 font-mono text-[10.5px] text-muted-foreground">
        <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · # to link a channel</span>
        {body.length > MESSAGE_MAX - 400 && (
          <span className={cn('ml-auto', tooLong && 'text-destructive')}>
            {body.length}/{MESSAGE_MAX}
          </span>
        )}
      </div>
    </div>
  )
}
