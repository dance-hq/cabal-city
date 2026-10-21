'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, FileText, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ShownStatus } from '@/lib/types'
import { MESSAGE_MAX } from '@/lib/config'
import { cleanBody } from '@/lib/text'
import { charCount, formatCount, isLong, longBody, LONG_TEXT_MAX } from '@/lib/long-text'
import { channelName, channelQuery, encodeChannelLinks, matchChannels, type LinkableChannel } from '@/lib/channel-links'
import { encodeMentions, matchPeople, mentionQuery, personName, type Mentionable } from '@/lib/mentions'
import { useLinkableChannels } from './channel-links'
import { TeamIcon } from './team-dialogs'
import { Avatar } from './avatar'
import { useCabal } from './store'

type Suggestion = { kind: 'channel'; id: string; c: LinkableChannel } | { kind: 'person'; id: string; p: Mentionable }

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
  const { userId, members, channels, statusOf } = useCabal()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Channels and people picked from the lists, per draft, so a pick wins over a same-named one.
  const picks = useRef(new Map<string, Map<string, string>>())
  const personPicks = useRef(new Map<string, Map<string, string>>())
  const value = drafts[channelId] ?? ''
  const ref = useRef<HTMLTextAreaElement>(null)
  const linkables = useLinkableChannels()
  const [caret, setCaret] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)

  const people = useMemo(() => members.map((m) => m.profile), [members])
  const otherId = channels.find((c) => c.id === channelId)?.other_user_id ?? null

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
  // Past the inline size the draft is sent whole, exactly as typed, as a long message.
  const long = isLong(body)
  const longText = long ? longBody(value) : ''
  const chars = long ? charCount(longText) : 0
  const tooLong = chars > LONG_TEXT_MAX

  const before = caret === null ? null : value.slice(0, caret)
  const channelTrigger = before === null ? null : channelQuery(before)
  const personTrigger = before === null ? null : mentionQuery(before)
  const trigger = channelTrigger ?? personTrigger
  const suggestions: Suggestion[] =
    !trigger || trigger.start === dismissedAt
      ? []
      : channelTrigger
        ? linkables.data
          ? matchChannels(linkables.data, channelTrigger.query, channelId).map((c) => ({ kind: 'channel', id: c.id, c }))
          : []
        : matchPeople(people, personTrigger!.query, { excludeId: userId, firstId: otherId, statusOf }).map((p) => ({
            kind: 'person',
            id: p.id,
            p,
          }))
  const listOpen = suggestions.length > 0
  const active = Math.min(highlight, suggestions.length - 1)
  const listId = `composer-${channelId}-suggestions`
  const listLabel = channelTrigger ? 'Link a channel' : 'Mention someone'

  function trackCaret() {
    const el = ref.current
    setCaret(el && el.selectionStart === el.selectionEnd ? el.selectionStart : null)
  }

  function remember(store: Map<string, Map<string, string>>, name: string, id: string) {
    let draftPicks = store.get(channelId)
    if (!draftPicks) store.set(channelId, (draftPicks = new Map()))
    draftPicks.set(name, id)
  }

  function pick(index: number) {
    const s = suggestions[index]
    if (!trigger || !s || caret === null) return
    const mark = s.kind === 'channel' ? '#' : '@'
    const name = s.kind === 'channel' ? channelName(s.c) : personName(s.p)
    const next = `${value.slice(0, trigger.start)}${mark}${name} ${value.slice(caret)}`
    const at = trigger.start + name.length + 2
    remember(s.kind === 'channel' ? picks.current : personPicks.current, name, s.id)
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
    if (long) {
      onSend(longText)
    } else {
      const withPeople = encodeMentions(body, personPicks.current.get(channelId) ?? new Map(), people)
      const linked = encodeChannelLinks(withPeople, picks.current.get(channelId) ?? new Map(), linkables.data ?? [])
      onSend(linked.length <= MESSAGE_MAX ? linked : body)
    }
    picks.current.delete(channelId)
    personPicks.current.delete(channelId)
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
            aria-label={listLabel}
            className="absolute right-0 bottom-full left-0 z-20 mb-1.5 flex max-h-64 flex-col overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <li role="presentation" className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
              {listLabel}
            </li>
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${listId}-${s.id}`}
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
                {s.kind === 'person' ? <PersonOption p={s.p} status={statusOf(s.p.id)} /> : <ChannelOption c={s.c} />}
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
        {long ? (
          <span className={cn('inline-flex items-center gap-1.5', tooLong && 'text-destructive')} aria-live="polite">
            <FileText className="size-3" aria-hidden />
            {tooLong
              ? `${chars.toLocaleString('en-US')} characters · one message holds up to ${LONG_TEXT_MAX.toLocaleString('en-US')}`
              : `Long message · ${formatCount(chars, 'character')} · sends whole, opens in a reader`}
          </span>
        ) : (
          <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · @ to mention · # to link a channel</span>
        )}
      </div>
    </div>
  )
}

function PersonOption({ p, status }: { p: Mentionable; status: ShownStatus }) {
  const name = personName(p)
  return (
    <>
      <Avatar name={name} url={p.avatar_url} size={22} status={status} />
      <span className="truncate">{name}</span>
      {p.username && <span className="ml-auto shrink-0 truncate font-mono text-xs text-muted-foreground">@{p.username}</span>}
    </>
  )
}

function ChannelOption({ c }: { c: LinkableChannel }) {
  return (
    <>
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
    </>
  )
}
