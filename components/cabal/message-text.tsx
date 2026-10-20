import { memo } from 'react'
import { cn } from '@/lib/utils'
import { tokenize } from '@/lib/text'

export const MessageText = memo(function MessageText({ body, myUsername }: { body: string; myUsername?: string | null }) {
  const me = myUsername?.toLowerCase()
  return (
    <span className="break-words whitespace-pre-wrap">
      {tokenize(body).map((t, i) => {
        if (t.type === 'link') {
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
            >
              {t.value}
            </a>
          )
        }
        if (t.type === 'mention') {
          return (
            <span
              key={i}
              className={cn(
                'rounded px-0.5 font-medium',
                t.username.toLowerCase() === me ? 'bg-primary/25 text-foreground' : 'text-mark',
              )}
            >
              {t.value}
            </span>
          )
        }
        return <span key={i}>{t.value}</span>
      })}
    </span>
  )
})
