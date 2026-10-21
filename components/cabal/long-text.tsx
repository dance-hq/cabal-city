'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload } from 'swr'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Copy, Download, FileText, Search, WrapText, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { fullTime } from '@/lib/time'
import type { E2eeSession } from '@/lib/e2ee/session'
import type { Message } from '@/lib/types'
import {
  charCount,
  excerptAfterTitle,
  fileName,
  findMatches,
  formatCount,
  lineCount,
  looksLikeMarkdown,
  titleOf,
} from '@/lib/long-text'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useE2ee } from './e2ee-provider'

// --- Loading the full text -------------------------------------------------------------
// Only the preview travels with the message. The full text is fetched the first
// time someone opens or copies it, then cached for the session.

const textKey = (id: string) => ['long-text', id] as const

async function fetchText(e2ee: E2eeSession, m: Message): Promise<string> {
  const { data, error } = await createClient()
    .from('message_texts')
    .select('body, sealed')
    .eq('message_id', m.id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This message isn’t available any more.')
  if (data.sealed) return e2ee.openLong(m, data.sealed)
  return data.body as string
}

function useFullText(m: Message, wanted: boolean) {
  const { session: e2ee } = useE2ee()
  const local = m.long_body
  const swr = useSWR(wanted && !local ? textKey(m.id) : null, () => fetchText(e2ee, m), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  })
  return {
    text: local ?? swr.data,
    error: local ? undefined : (swr.error as Error | undefined),
    retry: () => swr.mutate(),
    /** Starts loading early, e.g. when the pointer heads for the card. */
    warm: () => {
      if (!local) void preload(textKey(m.id), () => fetchText(e2ee, m)).catch(() => {})
    },
    /** Resolves with the text, loading it if needed. */
    get: async () => local ?? (await preload(textKey(m.id), () => fetchText(e2ee, m))),
  }
}

// Clipboard writes must start during the click. ClipboardItem accepts a promise,
// so the text can still be on its way; older engines get it once it arrives.
async function copyText(get: () => Promise<string>): Promise<string> {
  const pending = get()
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': pending.then((t) => new Blob([t], { type: 'text/plain' })) }),
      ])
      return pending
    } catch {
      // Falls through to writeText.
    }
  }
  const text = await pending
  await navigator.clipboard.writeText(text)
  return text
}

function downloadText(text: string, title: string | null, ext: 'md' | 'txt') {
  const url = URL.createObjectURL(
    new Blob([text], { type: ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = fileName(title, ext)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function useCopy(full: ReturnType<typeof useFullText>) {
  return async () => {
    try {
      const text = await copyText(full.get)
      toast.success(`Copied ${formatCount(charCount(text), 'character')}`)
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Couldn’t copy it. Try again.')
    }
  }
}

// --- The card in the conversation -----------------------------------------------------

export function LongTextCard({ m, authorName }: { m: Message; authorName: string }) {
  const [open, setOpen] = useState(false)
  const full = useFullText(m, open)
  const copy = useCopy(full)
  const title = titleOf(m.body)
  const excerpt = excerptAfterTitle(m.body, title)
  const chars = m.long_chars ?? null

  return (
    <div className="mt-1 w-full max-w-xl overflow-hidden rounded-lg border bg-card text-card-foreground">
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={full.warm}
        onFocus={full.warm}
        className="block w-full px-3 pt-2.5 pb-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
        aria-label={`Open long message${title ? `: ${title}` : ''}`}
      >
        <span className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-flag" aria-hidden />
          <span className="min-w-0 truncate text-sm font-medium">{title ?? 'Long message'}</span>
        </span>
        {chars !== null && (
          <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">{formatCount(chars, 'character')}</span>
        )}
        {excerpt && (
          <span className="long-text-fade mt-2 block max-h-20 overflow-hidden font-mono text-[12px] leading-5 break-words whitespace-pre-wrap text-muted-foreground">
            {excerpt}
          </span>
        )}
      </button>
      <div className="flex items-center gap-1 border-t px-1.5 py-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerEnter={full.warm}
          className="rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open
        </button>
        <button
          type="button"
          onClick={copy}
          onPointerEnter={full.warm}
          disabled={m.pending}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Copy className="size-3" aria-hidden />
          Copy
        </button>
      </div>
      <LongTextReader
        m={m}
        open={open}
        onOpenChange={setOpen}
        title={title}
        authorName={authorName}
        full={full}
        onCopy={copy}
      />
    </div>
  )
}

// --- The reader -------------------------------------------------------------------------

function LongTextReader({
  m,
  open,
  onOpenChange,
  title,
  authorName,
  full,
  onCopy,
}: {
  m: Message
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string | null
  authorName: string
  full: ReturnType<typeof useFullText>
  onCopy: () => void
}) {
  const { text, error, retry } = full
  const [wrap, setWrap] = useState(true)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const findRef = useRef<HTMLInputElement>(null)
  const markRef = useRef<HTMLElement>(null)

  const matches = useMemo(() => (text && finding ? findMatches(text, query) : []), [text, finding, query])
  const at = matches.length ? Math.min(current, matches.length - 1) : 0
  const markdown = text ? looksLikeMarkdown(text) : looksLikeMarkdown(m.body)

  useEffect(() => {
    if (!open) {
      setFinding(false)
      setQuery('')
    }
  }, [open])

  useEffect(() => {
    if (finding) findRef.current?.focus()
  }, [finding])

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center' })
  }, [at, matches])

  const step = (dir: 1 | -1) => matches.length && setCurrent((at + dir + matches.length) % matches.length)

  const meta = [
    m.long_chars ? formatCount(m.long_chars, 'character') : null,
    text ? formatCount(lineCount(text), 'line') : null,
    authorName,
    fullTime(m.created_at),
  ].filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(88vh,960px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            setFinding(true)
            findRef.current?.select()
          }
        }}
      >
        <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3">
          <FileText className="mt-0.5 size-4 shrink-0 text-flag" aria-hidden />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold">{title ?? 'Long message'}</DialogTitle>
            <DialogDescription className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
              {meta.join(' · ')}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label="Find in message" pressed={finding} onClick={() => setFinding((f) => !f)}>
              <Search className="size-4" aria-hidden />
            </IconButton>
            <IconButton label={wrap ? 'Don’t wrap lines' : 'Wrap lines'} pressed={wrap} onClick={() => setWrap((w) => !w)}>
              <WrapText className="size-4" aria-hidden />
            </IconButton>
            <IconButton label="Copy" onClick={onCopy}>
              <Copy className="size-4" aria-hidden />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!text}
                aria-label="Download"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                <Download className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {(markdown ? (['md', 'txt'] as const) : (['txt', 'md'] as const)).map((ext) => (
                  <DropdownMenuItem key={ext} onClick={() => text && downloadText(text, title, ext)}>
                    <span className="flex-1">{ext === 'md' ? 'Markdown' : 'Plain text'}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">.{ext}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <IconButton label="Close" onClick={() => onOpenChange(false)}>
              <X className="size-4" aria-hidden />
            </IconButton>
          </div>
        </header>

        {finding && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-4 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <label htmlFor={`find-${m.id}`} className="sr-only">
              Find in message
            </label>
            <input
              id={`find-${m.id}`}
              ref={findRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setCurrent(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.nativeEvent.isComposing || e.keyCode === 229)) {
                  e.preventDefault()
                  step(e.shiftKey ? -1 : 1)
                }
              }}
              placeholder="Find"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
              {query.trim() ? (matches.length ? `${at + 1} of ${matches.length}` : 'No matches') : ''}
            </span>
            <IconButton label="Previous match" small onClick={() => step(-1)} disabled={!matches.length}>
              <ChevronUp className="size-3.5" aria-hidden />
            </IconButton>
            <IconButton label="Next match" small onClick={() => step(1)} disabled={!matches.length}>
              <ChevronDown className="size-3.5" aria-hidden />
            </IconButton>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-background">
          {text !== undefined ? (
            <pre
              className={cn(
                'px-5 py-4 font-mono text-[13px] leading-6 text-foreground selection:bg-flag/25',
                wrap ? 'break-words whitespace-pre-wrap' : 'w-max min-w-full whitespace-pre',
              )}
            >
              <Highlighted text={text} matches={matches} current={at} markRef={markRef} />
            </pre>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-muted-foreground">{error.message || 'Couldn’t load this message.'}</p>
              <button
                type="button"
                onClick={retry}
                className="rounded-md px-2 py-1 text-xs font-medium underline underline-offset-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 px-5 py-5" aria-busy="true" aria-label="Loading message">
              {[92, 78, 85, 64, 88, 71, 40].map((w, i) => (
                <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Highlighted({
  text,
  matches,
  current,
  markRef,
}: {
  text: string
  matches: [number, number][]
  current: number
  markRef: React.RefObject<HTMLElement | null>
}) {
  if (!matches.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let last = 0
  matches.forEach(([start, end], i) => {
    if (start > last) parts.push(text.slice(last, start))
    parts.push(
      <mark
        key={start}
        ref={i === current ? markRef : undefined}
        className={cn('rounded-sm text-foreground', i === current ? 'bg-gold/70' : 'bg-gold/25')}
      >
        {text.slice(start, end)}
      </mark>,
    )
    last = end
  })
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
  disabled,
  small,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  pressed?: boolean
  disabled?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        small ? 'size-6' : 'size-8',
        pressed && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}
