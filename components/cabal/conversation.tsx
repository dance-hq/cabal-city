'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, BellOff, Hash, MoreHorizontal, Settings2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { Composer } from './composer'
import { MessageList } from './message-list'
import { STATUS_LABEL, StatusDot } from './status-dot'
import { TeamIcon, TeamManageDialog } from './team-dialogs'
import { useCabal } from './store'
import { useMessages } from '@/hooks/use-messages'
import { useTyping } from '@/hooks/use-typing'
import { useMedia } from '@/hooks/use-media'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { compareByPresence } from '@/lib/presence'
import type { Channel } from '@/lib/types'

export function Conversation({ compact }: { compact?: boolean }) {
  const { active, channels, channelsLoading, open } = useCabal()
  const channel = channels.find((c) => c.id === active)

  if (!channel) {
    return (
      <div className="flex flex-1 flex-col">
        <Header compact={compact} onBack={() => open(null)}>
          <span className="text-sm text-muted-foreground">{channelsLoading ? 'Loading…' : ''}</span>
        </Header>
        {!channelsLoading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <p>{"This conversation isn't available. You may have left it, or it was removed."}</p>
            <button
              type="button"
              onClick={() => open(null)}
              className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to everyone
            </button>
          </div>
        )}
      </div>
    )
  }
  return <OpenConversation key={channel.id} channel={channel} compact={compact} />
}

function OpenConversation({ channel, compact }: { channel: Channel; compact?: boolean }) {
  const { userId, profileById, statusOf, send, markRead, open, members, presence, showProfile, connection, refreshChannels, blocked } =
    useCabal()
  const { messages, error, isLoading, retry, loadOlder, hasMore, loadingOlder } = useMessages(channel.id)
  const { typers, ping, stop } = useTyping(channel.id, userId)
  const wide = useMedia('(min-width: 1100px)')
  const [showPeople, setShowPeople] = useState(true)
  const [managing, setManaging] = useState(false)

  // Where the "New" divider goes: whatever was unread when this was opened.
  const firstUnreadAt = useRef(channel.unread > 0 ? channel.last_read_at : null).current

  useEffect(() => {
    if (document.visibilityState === 'visible') markRead(channel.id)
  }, [channel.id, markRead])

  const other = channel.kind === 'dm' ? profileById(channel.other_user_id) : undefined
  const otherStatus = channel.other_user_id ? statusOf(channel.other_user_id) : 'offline'
  const isBlocked = !!channel.other_user_id && blocked.has(channel.other_user_id)

  const here = useMemo(() => {
    if (channel.kind !== 'room') return []
    return members
      .filter((m) => presence.get(m.user_id)?.rooms.has(channel.id) || (m.user_id === userId && statusOf(userId) !== 'offline'))
      .map((m) => ({ ...m, status: statusOf(m.user_id), name: m.profile.display_name ?? '' }))
      .sort(compareByPresence)
  }, [channel, members, presence, userId, statusOf])

  const elsewhere = useMemo(() => {
    if (channel.kind !== 'room') return []
    const inRoom = new Set(here.map((h) => h.user_id))
    return members
      .filter((m) => !inRoom.has(m.user_id) && statusOf(m.user_id) !== 'offline')
      .map((m) => ({ ...m, status: statusOf(m.user_id), name: m.profile.display_name ?? '' }))
      .sort(compareByPresence)
  }, [channel, members, here, statusOf])

  async function toggleMute() {
    const { error } = await createClient().rpc('set_muted', { p_channel: channel.id, p_muted: !channel.muted })
    if (error) toast.error(friendlyError(error))
    else {
      refreshChannels()
      toast.message(channel.muted ? 'Notifications on' : 'Muted. No badges or notifications from here.')
    }
  }

  const typingNames = typers.map((id) => profileById(id)?.display_name).filter(Boolean) as string[]
  const placeholder =
    channel.kind === 'dm'
      ? `Message ${other?.display_name ?? ''}`
      : channel.kind === 'room'
        ? `Message #${channel.slug}`
        : `Message ${channel.team_name}`

  const muteButton = (
    <IconButton label={channel.muted ? 'Unmute' : 'Mute'} onClick={toggleMute} pressed={channel.muted}>
      {channel.muted ? <BellOff className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}
    </IconButton>
  )

  return (
    <div className="flex min-h-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header compact={compact} onBack={() => open(null)}>
          {channel.kind === 'dm' && (
            <button
              type="button"
              onClick={() => other && showProfile(other.id)}
              className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar name={other?.display_name ?? '?'} url={other?.avatar_url} size={28} status={otherStatus} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm leading-tight font-semibold">{other?.display_name ?? 'Former member'}</span>
                <span className="truncate text-xs leading-tight text-muted-foreground">
                  {other?.status_text || STATUS_LABEL[otherStatus]}
                </span>
              </span>
            </button>
          )}
          {channel.kind === 'room' && (
            <div className="flex min-w-0 items-baseline gap-2 px-1">
              <span className="inline-flex shrink-0 items-center font-mono text-sm font-semibold">
                <Hash className="size-3.5 text-muted-foreground" aria-hidden />
                {channel.slug}
              </span>
              {channel.topic && <span className="truncate text-xs text-muted-foreground">{channel.topic}</span>}
            </div>
          )}
          {channel.kind === 'team' && (
            <div className="flex min-w-0 items-baseline gap-2 px-1">
              <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold">
                <TeamIcon visibility={channel.team_visibility} className="size-3.5 text-muted-foreground" />
                {channel.team_name}
                {channel.team_visibility !== 'public' && <span className="sr-only">(invite-only)</span>}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">#{channel.slug}</span>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {channel.kind === 'room' && (
              <IconButton
                label={`${here.length} here now. ${showPeople && wide ? 'Hide' : 'Show'} people`}
                onClick={() => setShowPeople((v) => !v)}
                pressed={wide && showPeople}
              >
                <Users className="size-4" aria-hidden />
                <span className="font-mono text-[11px]">{here.length}</span>
              </IconButton>
            )}
            {channel.kind === 'team' &&
              (channel.team_role === 'owner' ? (
                <IconButton label="Team settings" onClick={() => setManaging(true)}>
                  <Settings2 className="size-4" aria-hidden />
                </IconButton>
              ) : (
                <IconButton label="Team members" onClick={() => setManaging(true)}>
                  <Users className="size-4" aria-hidden />
                </IconButton>
              ))}
            {muteButton}
            {channel.kind === 'dm' && other && (
              <IconButton label={`${other.display_name}'s profile`} onClick={() => showProfile(other.id)}>
                <MoreHorizontal className="size-4" aria-hidden />
              </IconButton>
            )}
          </div>
        </Header>

        {channel.kind === 'room' && !wide && showPeople && here.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b px-4 py-1.5" aria-label="Here now">
            <span className="shrink-0 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Here</span>
            {here.map((p) => (
              <button
                key={p.user_id}
                type="button"
                onClick={() => showProfile(p.user_id)}
                className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={p.name}
                title={p.name}
              >
                <Avatar name={p.name} url={p.profile.avatar_url} size={22} />
              </button>
            ))}
          </div>
        )}

        <MessageList
          channel={channel}
          messages={messages}
          isLoading={isLoading}
          error={error}
          onRetryLoad={retry}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          loadOlder={loadOlder}
          firstUnreadAt={firstUnreadAt}
        />

        <div className="h-5 shrink-0 px-5 text-xs text-muted-foreground" aria-live="polite">
          {typingNames.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
                <span className="typing-dot size-1 rounded-full bg-muted-foreground" />
              </span>
              {typingNames.length === 1
                ? `${typingNames[0]} is typing`
                : typingNames.length === 2
                  ? `${typingNames[0]} and ${typingNames[1]} are typing`
                  : 'Several people are typing'}
            </span>
          )}
        </div>

        <Composer
          channelId={channel.id}
          placeholder={placeholder}
          onSend={(body) => send(channel.id, body)}
          onTyping={ping}
          onStopTyping={stop}
          disabled={isBlocked}
          disabledReason="You blocked this person. Unblock them from their profile to message."
        />
      </div>

      {channel.kind === 'room' && wide && showPeople && (
        <aside className="flex w-56 shrink-0 flex-col border-l bg-sidebar" aria-label={`People in #${channel.slug}`}>
          <div className="app-drag h-11 shrink-0" />
          <div className="quiet-scroll flex-1 overflow-y-auto pb-4">
            <PeopleGroup label={`In #${channel.slug} · ${here.length}`} people={here} onPick={showProfile} />
            {elsewhere.length > 0 && <PeopleGroup label={`Around · ${elsewhere.length}`} people={elsewhere} onPick={showProfile} faint />}
          </div>
        </aside>
      )}

      {channel.kind === 'team' && channel.team_id && (
        <TeamManageDialog open={managing} onOpenChange={setManaging} channel={channel} />
      )}
    </div>
  )
}

function PeopleGroup({
  label,
  people,
  onPick,
  faint,
}: {
  label: string
  people: { user_id: string; name: string; status: ReturnType<ReturnType<typeof useCabal>['statusOf']>; profile: { avatar_url: string | null } }[]
  onPick: (id: string) => void
  faint?: boolean
}) {
  return (
    <section className="mt-2">
      <h3 className="px-4 py-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</h3>
      <ul className="flex flex-col">
        {people.map((p) => (
          <li key={p.user_id}>
            <button
              type="button"
              onClick={() => onPick(p.user_id)}
              className={cn(
                'mx-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring',
                faint && 'text-muted-foreground',
              )}
            >
              <StatusDot status={p.status} size={7} decorative />
              <span className="truncate">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Header({ children, compact, onBack }: { children: React.ReactNode; compact?: boolean; onBack: () => void }) {
  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-1 border-b pr-2 pl-2">
      {compact && (
        <IconButton label="Back to everyone" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
        </IconButton>
      )}
      {children}
    </header>
  )
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        pressed && 'bg-accent text-foreground',
      )}
    >
      {children}
    </button>
  )
}
