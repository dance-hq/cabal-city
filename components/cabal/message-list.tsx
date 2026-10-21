'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Loader2, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { MessageText } from './message-text'
import { ReportDialog } from './moderation'
import { useCabal } from './store'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { mentions } from '@/lib/text'
import { clock, clock24, dayKey, dayLabel, fullTime } from '@/lib/time'
import type { Channel, Message } from '@/lib/types'

const GROUP_MS = 5 * 60_000
// Keep in step with .message-enter in globals.css.
const ENTER_MS = 380

export function MessageList({
  channel,
  messages,
  isLoading,
  error,
  onRetryLoad,
  hasMore,
  loadingOlder,
  loadOlder,
  firstUnreadAt,
}: {
  channel: Channel
  messages: Message[]
  isLoading: boolean
  error: unknown
  onRetryLoad: () => void
  hasMore: boolean
  loadingOlder: boolean
  loadOlder: () => Promise<void>
  firstUnreadAt: string | null
}) {
  const { userId, me, profileById, send, discard, showProfile, blocked, isAdmin } = useCabal()
  const scroller = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const prevHeight = useRef(0)
  const loadingOlderRef = useRef(false)
  const seededFor = useRef<string | null>(null)
  const known = useRef(new Set<string>())
  const glide = useRef(0)
  const [entering, setEntering] = useState<Set<string>>(() => new Set())
  const [showJump, setShowJump] = useState(false)
  const [reporting, setReporting] = useState<Message | null>(null)
  const irc = channel.kind === 'room'

  // While a new message opens up, keep the bottom pinned every frame so the
  // conversation glides up with it instead of jumping.
  const pinToBottom = useCallback((ms: number) => {
    const el = scroller.current
    if (!el) return
    cancelAnimationFrame(glide.current)
    const until = performance.now() + ms
    const step = () => {
      el.scrollTop = el.scrollHeight
      if (performance.now() < until) glide.current = requestAnimationFrame(step)
    }
    step()
  }, [])
  const stopGlide = () => cancelAnimationFrame(glide.current)

  useEffect(() => () => cancelAnimationFrame(glide.current), [])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (seededFor.current !== channel.id) {
      seededFor.current = channel.id
      known.current = new Set(messages.map((m) => m.id))
      atBottom.current = true
      setShowJump(false)
      setEntering((s) => (s.size ? new Set() : s))
      el.scrollTop = el.scrollHeight
      return
    }
    if (loadingOlderRef.current) {
      for (const m of messages) known.current.add(m.id)
      el.scrollTop = el.scrollHeight - prevHeight.current
      loadingOlderRef.current = false
      return
    }
    const added = messages.filter((m) => !known.current.has(m.id))
    for (const m of added) known.current.add(m.id)
    if (added.length === 0) {
      if (atBottom.current) el.scrollTop = el.scrollHeight
      return
    }
    // A burst (e.g. catching up after a reconnect) just lands; a few messages ease in.
    const calm = added.length <= 4 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (calm) {
      setEntering((s) => {
        const next = new Set(s)
        for (const m of added) next.add(m.id)
        return next
      })
    }
    if (atBottom.current) {
      if (calm) pinToBottom(ENTER_MS + 80)
      else el.scrollTop = el.scrollHeight
    } else if (added.some((m) => m.author_id !== userId)) {
      setShowJump(true)
    } else {
      // You sent something while scrolled up: take you to it.
      atBottom.current = true
      if (calm) pinToBottom(ENTER_MS + 80)
      else el.scrollTop = el.scrollHeight
    }
  }, [messages, channel.id, userId, pinToBottom])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom.current) setShowJump(false)
  }

  async function older() {
    const el = scroller.current
    if (!el) return
    prevHeight.current = el.scrollHeight
    loadingOlderRef.current = true
    await loadOlder()
  }

  async function remove(m: Message) {
    const { error } = await createClient().rpc('delete_message', { p_message: m.id })
    if (error) toast.error(friendlyError(error))
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading messages</span>
      </div>
    )
  }
  if (error && messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>{"Couldn't load messages."}</p>
        <button type="button" onClick={onRetryLoad} className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
          Try again
        </button>
      </div>
    )
  }

  let lastDay = ''
  let prev: Message | null = null
  let unreadShown = false

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        onWheel={stopGlide}
        onTouchMove={stopGlide}
        onKeyDown={stopGlide}
        className={cn('quiet-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-3', irc ? 'px-3' : 'px-4')}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
      >
        <div className="mt-auto" />
        {hasMore && messages.length > 0 ? (
          <button
            type="button"
            onClick={older}
            disabled={loadingOlder}
            className="mx-auto mb-3 rounded-md px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {loadingOlder ? 'Loading…' : 'Load earlier messages'}
          </button>
        ) : (
          <ConversationStart channel={channel} empty={messages.length === 0} />
        )}

        {messages.map((m) => {
          const day = dayKey(m.created_at)
          const newDay = day !== lastDay
          lastDay = day
          const showUnread =
            !unreadShown && firstUnreadAt && m.author_id !== userId && m.created_at > firstUnreadAt && !m.pending
          if (showUnread) unreadShown = true
          const grouped =
            !newDay &&
            !showUnread &&
            prev?.kind === 'user' &&
            m.kind === 'user' &&
            prev.author_id === m.author_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS
          prev = m
          const author = profileById(m.author_id)
          const name = author?.display_name ?? (m.author_id ? 'Former member' : 'Cabal')
          const mine = m.author_id === userId
          const mentioned = !mine && m.kind === 'user' && mentions(m.body, me.username)
          const hidden = m.author_id && blocked.has(m.author_id)

          return (
            <div key={m.id} className={cn(entering.has(m.id) && 'message-enter')}>
              <div>
              {newDay && (
                <div className="my-3 flex items-center gap-3" role="separator" aria-label={dayLabel(m.created_at)}>
                  <div className="h-px flex-1 bg-border" />
                  <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{dayLabel(m.created_at)}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              {showUnread && (
                <div className="my-2 flex items-center gap-3" role="separator" aria-label="New messages">
                  <div className="h-px flex-1 bg-primary/60" />
                  <span className="font-mono text-[10.5px] tracking-wider text-primary uppercase">New</span>
                </div>
              )}
              {m.kind === 'system' ? (
                <SystemLine message={m} irc={irc} />
              ) : (
                <div
                  className={cn(
                    'group relative -mx-2 flex rounded-md px-2 transition-opacity duration-500 ease-out hover:bg-accent/50',
                    irc ? 'gap-3 py-0.5' : grouped ? 'gap-3 py-0.5' : 'mt-2.5 gap-3 py-0.5',
                    mentioned && 'bg-flag/10 hover:bg-flag/15',
                    m.pending && 'opacity-70',
                  )}
                >
                  {irc ? (
                    <>
                      <time
                        dateTime={m.created_at}
                        title={fullTime(m.created_at)}
                        className="w-10 shrink-0 pt-px font-mono text-[11px] leading-6 text-muted-foreground tabular-nums"
                      >
                        {clock24(m.created_at)}
                      </time>
                      <div className="min-w-0 flex-1 text-sm leading-6">
                        {!grouped && (
                          <button
                            type="button"
                            onClick={() => m.author_id && showProfile(m.author_id)}
                            className={cn(
                              'mr-2 rounded font-mono text-[13px] font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring',
                              mine ? 'text-mark' : 'text-foreground',
                            )}
                          >
                            {author?.username ?? name}
                          </button>
                        )}
                        {hidden ? (
                          <span className="text-muted-foreground italic">Message from someone you blocked</span>
                        ) : m.deleted_at ? (
                          <span className="text-muted-foreground italic">message deleted</span>
                        ) : (
                          <span className="text-foreground/90">
                            <MessageText body={m.body} myUsername={me.username} />
                          </span>
                        )}
                        <SendState m={m} onRetry={() => send(channel.id, m.body, m.id)} onDiscard={() => discard(channel.id, m.id)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 shrink-0">
                        {!grouped ? (
                          <button
                            type="button"
                            onClick={() => m.author_id && showProfile(m.author_id)}
                            className="mt-0.5 rounded-full focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${name}'s profile`}
                          >
                            <Avatar name={name} url={author?.avatar_url} size={32} />
                          </button>
                        ) : (
                          <time
                            dateTime={m.created_at}
                            title={fullTime(m.created_at)}
                            className="hidden pt-0.5 font-mono text-[10px] leading-6 text-muted-foreground group-hover:block"
                          >
                            {clock24(m.created_at)}
                          </time>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {!grouped && (
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold">{mine ? 'You' : name}</span>
                            <time dateTime={m.created_at} title={fullTime(m.created_at)} className="text-[11px] text-muted-foreground">
                              {clock(m.created_at)}
                            </time>
                          </div>
                        )}
                        <div className="text-sm leading-relaxed">
                          {hidden ? (
                            <span className="text-muted-foreground italic">Message from someone you blocked</span>
                          ) : m.deleted_at ? (
                            <span className="text-muted-foreground italic">message deleted</span>
                          ) : (
                            <MessageText body={m.body} myUsername={me.username} />
                          )}
                        </div>
                        <SendState m={m} onRetry={() => send(channel.id, m.body, m.id)} onDiscard={() => discard(channel.id, m.id)} />
                      </div>
                    </>
                  )}
                  {!m.pending && !m.failed && !m.deleted_at && (
                    <MessageMenu
                      canDelete={mine || (irc && isAdmin)}
                      canReport={!mine}
                      onDelete={() => remove(m)}
                      onReport={() => setReporting(m)}
                    />
                  )}
                  {m.pending && (
                    <span className="pending-note pointer-events-none absolute right-2 bottom-0.5 font-mono text-[10.5px] text-muted-foreground">
                      sending…
                    </span>
                  )}
                </div>
              )}
              </div>
            </div>
          )
        })}
      </div>
      {showJump && (
        <button
          type="button"
          onClick={() => {
            const el = scroller.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            setShowJump(false)
          }}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-3 py-1 text-xs shadow-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="size-3" aria-hidden />
          New messages
        </button>
      )}
      <ReportDialog
        open={!!reporting}
        onOpenChange={(o) => !o && setReporting(null)}
        title="Report message"
        excerpt={reporting?.body}
        onSubmit={async (reason) => {
          if (!reporting) return
          const { error } = await createClient().rpc('report_message', { p_message: reporting.id, p_reason: reason })
          if (error) throw error
        }}
      />
    </div>
  )
}

// "sending…" floats over the row instead (see .pending-note) so the message
// never changes height when the server confirms it.
function SendState({ m, onRetry, onDiscard }: { m: Message; onRetry: () => void; onDiscard: () => void }) {
  if (!m.failed) return null
  return (
    <span className="ml-2 inline-flex items-center gap-2 font-mono text-[11px] text-destructive" role="alert">
      Not sent.
      <button type="button" onClick={onRetry} className="rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
        Retry
      </button>
      <button type="button" onClick={onDiscard} className="rounded text-muted-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
        Discard
      </button>
    </span>
  )
}

function SystemLine({ message, irc }: { message: Message; irc: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-3 py-1', !irc && 'my-1 justify-center')}>
      {irc && (
        <time dateTime={message.created_at} className="w-10 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {clock24(message.created_at)}
        </time>
      )}
      <p className="font-mono text-[12px] leading-5 text-muted-foreground">
        <span className="mr-1.5 text-mark" aria-label="Cabal system message">
          {'**'}
        </span>
        {message.body}
      </p>
    </div>
  )
}

function MessageMenu({
  canDelete,
  canReport,
  onDelete,
  onReport,
}: {
  canDelete: boolean
  canReport: boolean
  onDelete: () => void
  onReport: () => void
}) {
  if (!canDelete && !canReport) return null
  return (
    <div className="absolute top-0.5 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-6 items-center justify-center rounded border bg-popover text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Message actions"
        >
          <MoreHorizontal className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canReport && <DropdownMenuItem onClick={onReport}>Report message</DropdownMenuItem>}
          {canDelete && (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete message
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ConversationStart({ channel, empty }: { channel: Channel; empty: boolean }) {
  const { profileById } = useCabal()
  if (channel.kind === 'dm') {
    const other = profileById(channel.other_user_id)
    return (
      <div className="mb-4 flex flex-col items-start gap-2 pt-6">
        <Avatar name={other?.display_name ?? '?'} url={other?.avatar_url} size={48} />
        <p className="text-sm font-semibold">{other?.display_name}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {empty ? `This is the start of your conversation with ${other?.display_name ?? 'them'}. Say hi.` : 'Start of conversation'}
        </p>
      </div>
    )
  }
  if (channel.kind === 'room') {
    return (
      <div className="mb-3 pt-6 font-mono text-[12px] leading-relaxed text-muted-foreground">
        <p>
          <span className="text-mark">{'**'}</span> Now talking in <span className="text-foreground">#{channel.slug}</span>
        </p>
        {channel.topic && (
          <p>
            <span className="text-mark">{'**'}</span> Topic: {channel.topic}
          </p>
        )}
        {empty && (
          <p>
            <span className="text-mark">{'**'}</span> {"It's quiet in here. Be the first to say something."}
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="mb-3 pt-6">
      <p className="text-sm font-semibold">{channel.team_name}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {channel.team_visibility === 'public'
          ? 'Public team. Anyone in the community can join, read along and say hi.'
          : 'Invite-only. Nobody else in the community can see or read it.'}
      </p>
    </div>
  )
}
