'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, BellOff, Hash, MoreHorizontal, Settings2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'
import { Composer } from './composer'
import { MessageList } from './message-list'
import { PeoplePanel, usePeopleIn } from './people-panel'
import { LockInControl } from './session-bar'
import { STATUS_LABEL } from './status-dot'
import { TeamIcon, TeamManageDialog } from './team-dialogs'
import { TeamWelcome } from './team-welcome'
import { useCabal } from './store'
import { useMessages } from '@/hooks/use-messages'
import { useTyping } from '@/hooks/use-typing'
import { useMedia } from '@/hooks/use-media'
import { useLockIns } from '@/hooks/use-lock-ins'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import type { Channel } from '@/lib/types'

// Whether the docked members panel is shown; kept across conversations.
let panelDockedOpen = true

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
  const { userId, community, profileById, statusOf, send, markRead, open, showProfile, refreshChannels, blocked } = useCabal()
  const lockIns = useLockIns(community.id)
  const { messages, error, isLoading, retry, loadOlder, hasMore, loadingOlder } = useMessages(channel.id)
  const { typers, ping, stop } = useTyping(channel.id, userId)
  // Wide windows keep the members panel beside the conversation; narrower
  // ones float it over the messages when asked.
  const docked = useMedia('(min-width: 960px)')
  const [dockedOpen, setDockedOpen] = useState(panelDockedOpen)
  const [floatingOpen, setFloatingOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const [editingWelcome, setEditingWelcome] = useState(false)
  const hasPanel = channel.kind !== 'dm'
  const panelOpen = hasPanel && (docked ? dockedOpen : floatingOpen)

  function togglePanel() {
    if (docked) {
      panelDockedOpen = !dockedOpen
      setDockedOpen(panelDockedOpen)
    } else setFloatingOpen((v) => !v)
  }

  // Where the "New" divider goes: whatever was unread when this was opened.
  const firstUnreadAt = useRef(channel.unread > 0 ? channel.last_read_at : null).current

  useEffect(() => {
    if (document.visibilityState === 'visible') markRead(channel.id)
  }, [channel.id, markRead])

  // A count can still turn up on the conversation you're looking at: a message
  // that arrived while another window had focus, or a list refresh that landed
  // before the read was saved. It's on screen, so it's read.
  useEffect(() => {
    if (channel.unread > 0 && document.visibilityState === 'visible') markRead(channel.id)
  }, [channel.unread, channel.id, markRead])

  const other = channel.kind === 'dm' ? profileById(channel.other_user_id) : undefined
  const otherStatus = channel.other_user_id ? statusOf(channel.other_user_id) : 'offline'
  const isBlocked = !!channel.other_user_id && blocked.has(channel.other_user_id)

  const lastNotice = useMemo(() => messages.findLast((m) => m.kind === 'system')?.id ?? null, [messages])
  const people = usePeopleIn(channel, lastNotice)

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
    <div className="relative flex min-h-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header compact={compact} onBack={() => open(null)}>
          {channel.kind === 'dm' && (
            <button
              type="button"
              onClick={() => other && showProfile(other.id)}
              className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar
                name={other?.display_name ?? '?'}
                url={other?.avatar_url}
                size={28}
                status={otherStatus}
                lockedIn={otherStatus !== 'offline' && !!channel.other_user_id && lockIns.has(channel.other_user_id)}
              />
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
            {channel.kind === 'team' &&
              (channel.team_role === 'owner' ? (
                <IconButton label="Team settings" onClick={() => setManaging(true)}>
                  <Settings2 className="size-4" aria-hidden />
                </IconButton>
              ) : (
                <IconButton label="Team details" onClick={() => setManaging(true)}>
                  <MoreHorizontal className="size-4" aria-hidden />
                </IconButton>
              ))}
            {muteButton}
            {hasPanel && (
              <IconButton
                label={`${people.online.length} online. ${panelOpen ? 'Hide' : 'Show'} members`}
                onClick={togglePanel}
                pressed={panelOpen}
              >
                <Users className="size-4" aria-hidden />
                <span className="font-mono text-[11px]">{people.online.length}</span>
              </IconButton>
            )}
            {channel.kind === 'dm' && other && (
              <IconButton label={`${other.display_name}'s profile`} onClick={() => showProfile(other.id)}>
                <MoreHorizontal className="size-4" aria-hidden />
              </IconButton>
            )}
            <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
            <LockInControl />
          </div>
        </Header>

        {channel.kind === 'team' && channel.team_id && (
          <TeamWelcome
            channel={channel}
            notice={lastNotice}
            editing={editingWelcome}
            onEditingChange={setEditingWelcome}
          />
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

      {panelOpen && !docked && (
        <div className="absolute inset-0 z-10 bg-background/50" onClick={() => setFloatingOpen(false)} aria-hidden />
      )}
      {panelOpen && <PeoplePanel channel={channel} {...people} onClose={docked ? undefined : () => setFloatingOpen(false)} />}

      {channel.kind === 'team' && channel.team_id && (
        <TeamManageDialog
          open={managing}
          onOpenChange={setManaging}
          channel={channel}
          onEditWelcome={() => {
            setManaging(false)
            setEditingWelcome(true)
          }}
        />
      )}
    </div>
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
