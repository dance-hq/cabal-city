'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MESSAGE_MAX } from '@/lib/config'
import { cleanBody } from '@/lib/text'

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
  const value = drafts[channelId] ?? ''
  const ref = useRef<HTMLTextAreaElement>(null)

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

  function submit() {
    if (!body || tooLong || disabled) return
    onSend(body)
    onStopTyping()
    set('')
  }

  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
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
          onChange={(e) => {
            set(e.target.value)
            if (e.target.value.trim()) onTyping()
            else onStopTyping()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
      <div className="mt-1 flex h-4 items-center justify-between px-1 font-mono text-[10.5px] text-muted-foreground">
        <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
        {body.length > MESSAGE_MAX - 400 && (
          <span className={cn('ml-auto', tooLong && 'text-destructive')}>
            {body.length}/{MESSAGE_MAX}
          </span>
        )}
      </div>
    </div>
  )
}
