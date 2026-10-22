'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, FileText, Film, Hash, ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { LocalFile, ShownStatus } from '@/lib/types'
import { ACCEPT, AttachmentError, MAX_FILES, prepareFile, releaseLocal } from '@/lib/attachments'
import { MESSAGE_MAX } from '@/lib/config'
import { cleanBody } from '@/lib/text'
import { charCount, formatCount, isLong, longBody, LONG_TEXT_MAX } from '@/lib/long-text'
import { channelName, channelQuery, encodeChannelLinks, matchChannels, type LinkableChannel } from '@/lib/channel-links'
import { encodeMentions, matchPeople, mentionQuery, personName, type Mentionable } from '@/lib/mentions'
import { useLinkableChannels } from './channel-links'
import { TeamIcon } from './team-dialogs'
import { Avatar } from './avatar'
import { useCabal } from './store'

type Attached = { key: string; name: string; file?: LocalFile }

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
  onSend: (body: string, files?: LocalFile[]) => Promise<unknown>
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

  // Photos and videos waiting to go with the next message, per conversation.
  const [attached, setAttached] = useState<Record<string, Attached[]>>({})
  const files = attached[channelId] ?? []
  const preparing = files.some((f) => !f.file)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const picked = [...list]
      if (!picked.length || disabled) return
      const room = MAX_FILES - (attached[channelId]?.length ?? 0)
      if (room <= 0 || picked.length > room) toast.error(`A message holds up to ${MAX_FILES} photos or videos.`)
      const take = picked.slice(0, Math.max(0, room))
      const placeholders = take.map((f) => ({ key: crypto.randomUUID(), name: f.name }))
      const target = channelId
      setAttached((a) => ({ ...a, [target]: [...(a[target] ?? []), ...placeholders] }))
      take.forEach((f, i) => {
        const key = placeholders[i].key
        prepareFile(f).then(
          (file) =>
            setAttached((a) => {
              // Removed while it was being prepared.
              if (!(a[target] ?? []).some((x) => x.key === key)) {
                releaseLocal([file])
                return a
              }
              return { ...a, [target]: (a[target] ?? []).map((x) => (x.key === key ? { ...x, file } : x)) }
            }),
          (err) => {
            toast.error(err instanceof AttachmentError ? err.message : `Couldn’t attach ${f.name || 'that file'}.`)
            setAttached((a) => ({ ...a, [target]: (a[target] ?? []).filter((x) => x.key !== key) }))
          },
        )
      })
      ref.current?.focus()
    },
    [attached, channelId, disabled],
  )

  const removeFile = (key: string) =>
    setAttached((a) => {
      releaseLocal((a[channelId] ?? []).flatMap((x) => (x.key === key && x.file ? [x.file] : [])))
      return { ...a, [channelId]: (a[channelId] ?? []).filter((x) => x.key !== key) }
    })

  // Drop photos anywhere in the window to attach them.
  const addRef = useRef(addFiles)
  addRef.current = addFiles
  useEffect(() => {
    if (disabled) return
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) addRef.current(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
      setDragging(false)
    }
  }, [disabled])

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

  const canSend = (!!body || files.length > 0) && !preparing && !tooLong && !disabled

  function submit() {
    if (!canSend) return
    const ready = files.flatMap((f) => (f.file ? [f.file] : []))
    if (long) {
      // A long text is its own message; the files follow it.
      void onSend(longText).then(() => ready.length && onSend('', ready))
    } else {
      const withPeople = body ? encodeMentions(body, personPicks.current.get(channelId) ?? new Map(), people) : ''
      const linked = body ? encodeChannelLinks(withPeople, picks.current.get(channelId) ?? new Map(), linkables.data ?? []) : ''
      void onSend(linked.length <= MESSAGE_MAX ? linked : body, ready.length ? ready : undefined)
    }
    picks.current.delete(channelId)
    personPicks.current.delete(channelId)
    onStopTyping()
    set('')
    setAttached((a) => ({ ...a, [channelId]: [] }))
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
            'flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 focus-within:border-ring',
            tooLong && 'border-destructive focus-within:border-destructive',
            dragging && 'border-primary',
          )}
        >
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1" aria-label="Attached photos and videos">
              {files.map((f) => (
                <li key={f.key} className="relative size-16 shrink-0">
                  <div className="size-full overflow-hidden rounded-md border bg-muted">
                    {!f.file ? (
                      <span className="flex size-full items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                        <span className="sr-only">{`Preparing ${f.name}`}</span>
                      </span>
                    ) : f.file.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a local object URL
                      <img src={f.file.url} alt={f.file.name} className="size-full object-cover" />
                    ) : (
                      <span className="relative block size-full">
                        <video src={f.file.url} muted playsInline preload="metadata" className="size-full object-cover" aria-label={f.file.name} />
                        <Film className="absolute bottom-1 left-1 size-3.5 text-background drop-shadow" aria-hidden />
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(f.key)}
                    aria-label={`Remove ${f.file?.name ?? f.name}`}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-popover text-popover-foreground shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || files.length >= MAX_FILES}
            aria-label="Attach photos or videos"
            title="Attach photos or videos"
            className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            <ImagePlus className="size-4" aria-hidden />
          </button>
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
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
              if (!pasted.length) return
              e.preventDefault()
              addFiles(pasted)
            }}
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
            disabled={!canSend}
            aria-label="Send message"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
          </div>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80">
          <span className="inline-flex items-center gap-2 rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-sm">
            <ImagePlus className="size-4 text-primary" aria-hidden />
            Drop to attach photos and videos
          </span>
        </div>
      )}
      <div className="mt-1 flex h-4 items-center justify-between px-1 font-mono text-[10.5px] text-muted-foreground">
        {long ? (
          <span className={cn('inline-flex items-center gap-1.5', tooLong && 'text-destructive')} aria-live="polite">
            <FileText className="size-3" aria-hidden />
            {tooLong
              ? `${chars.toLocaleString('en-US')} characters · one message holds up to ${LONG_TEXT_MAX.toLocaleString('en-US')}`
              : `Long message · ${formatCount(chars, 'character')} · sends whole, opens in a reader`}
          </span>
        ) : files.length > 0 ? (
          <span aria-live="polite">
            {preparing
              ? 'Preparing…'
              : `${files.length} ${files.length === 1 ? 'file' : 'files'} attached · Enter to send`}
          </span>
        ) : (
          <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · @ to mention · # to link a channel · paste or drop photos</span>
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
