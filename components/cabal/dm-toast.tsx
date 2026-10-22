'use client'

import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Avatar } from './avatar'

// One card per conversation: a second message from the same person replaces
// the first instead of stacking.
export function showDmToast({
  channelId,
  name,
  avatarUrl,
  preview,
  count,
  onOpen,
}: {
  channelId: string
  name: string
  avatarUrl: string | null
  preview: string
  count: number
  onOpen: () => void
}) {
  const id = `dm:${channelId}`
  toast.custom(
    () => (
      <div
        role="status"
        className="flex w-[min(22rem,calc(100vw-2rem))] items-start font-sans gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-primary/40"
      >
        <button
          type="button"
          onClick={() => {
            toast.dismiss(id)
            onOpen()
          }}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Open your conversation with ${name}`}
        >
          <Avatar name={name} url={avatarUrl} size={36} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[13px] leading-tight">
              <span className="truncate font-semibold">{name}</span>
              <span className="shrink-0 text-muted-foreground">{count > 1 ? `sent you ${count} messages` : 'messaged you'}</span>
            </span>
            <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{preview}</span>
            <span className="mt-1 text-xs font-medium text-primary">Reply</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => toast.dismiss(id)}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    ),
    { id, position: 'top-right', duration: 10000 },
  )
}
