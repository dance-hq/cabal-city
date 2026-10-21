import { memo } from 'react'
import { cn } from '@/lib/utils'
import { isMentionOf, tokenize, type Token } from '@/lib/text'
import { personName } from '@/lib/mentions'
import { ChannelChip, appOrigins } from './channel-links'
import { useCabal } from './store'

export const MessageText = memo(function MessageText({ body, myUsername }: { body: string; myUsername?: string | null }) {
  return (
    <span className="break-words whitespace-pre-wrap">
      {tokenize(body, { appOrigins: appOrigins() }).map((t, i) => {
        if (t.type === 'channel') return <ChannelChip key={i} channelId={t.channelId} />
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
        if (t.type === 'mention') return <Mention key={i} token={t} myUsername={myUsername} />
        return <span key={i}>{t.value}</span>
      })}
    </span>
  )
})

// Stored mentions show the person's current real name; typed @usernames show
// as typed. Either way, a mention of you is highlighted.
function Mention({ token, myUsername }: { token: Extract<Token, { type: 'mention' }>; myUsername?: string | null }) {
  const { userId, members, showProfile } = useCabal()
  const person = token.userId
    ? members.find((m) => m.user_id === token.userId)?.profile
    : token.username
      ? members.find((m) => m.profile.username?.toLowerCase() === token.username!.toLowerCase())?.profile
      : undefined
  const mine = isMentionOf(token, { id: userId, username: myUsername })
  const label = token.userId ? `@${personName(person)}` : token.value
  const className = cn(
    'rounded px-0.5 font-medium',
    mine ? 'bg-flag/25 text-foreground' : person ? 'text-mark' : 'text-muted-foreground',
  )

  if (!person) return <span className={className}>{label}</span>
  return (
    <button
      type="button"
      onClick={() => showProfile(person.id)}
      title={person.username ? `@${person.username}` : undefined}
      className={cn(className, 'hover:underline focus-visible:ring-2 focus-visible:ring-ring')}
    >
      {label}
    </button>
  )
}
