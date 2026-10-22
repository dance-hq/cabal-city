"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Hash,
  Link2,
  MoreHorizontal,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "./avatar";
import {
  copyChannelLink,
  useLinkableChannels,
  useOpenLinkedChannel,
} from "./channel-links";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { PeoplePanel, useMembersPanel, usePeopleIn } from "./people-panel";
import { LockInControl } from "./session-bar";
import { STATUS_LABEL } from "./status-dot";
import { TeamIcon, TeamManageDialog } from "./team-dialogs";
import { TeamWelcome } from "./team-welcome";
import { LaunchesNote } from "./playbook";
import { InviteToTeamDialog, TeamInviteNudge, canInvite } from "./team-invite";
import { useCabal } from "./store";
import { useE2ee } from "./e2ee-provider";
import {
  DmEncryptionNotice,
  EncryptionBadge,
  dmSendBlock,
  usePeerEncryption,
} from "./e2ee-dm";
import { VerifyDialog } from "./e2ee-verify";
import { useMessages } from "@/hooks/use-messages";
import { useTyping } from "@/hooks/use-typing";
import { useLockIns } from "@/hooks/use-lock-ins";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import type { Channel } from "@/lib/types";

// `popoutActions` turns this into a desktop chat window: no back button, no
// lock-in or profile controls (the main window has those), just these actions.
export function Conversation({
  compact,
  popoutActions,
}: {
  compact?: boolean;
  popoutActions?: React.ReactNode;
}) {
  const { active, channels, channelsLoading, open } = useCabal();
  const channel = channels.find((c) => c.id === active);

  if (!channel) {
    return (
      <div className="flex flex-1 flex-col">
        <Header compact={compact && !popoutActions} onBack={() => open(null)}>
          <span className="text-sm text-muted-foreground">
            {channelsLoading || !active ? "Loading…" : ""}
          </span>
          {popoutActions && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {popoutActions}
            </div>
          )}
        </Header>
        {!channelsLoading && active && <Unavailable channelId={active} />}
      </div>
    );
  }
  return (
    <OpenConversation
      key={channel.id}
      channel={channel}
      compact={compact}
      popoutActions={popoutActions}
    />
  );
}

// Someone sent you a link to a team you're not on yet: offer to join it
// rather than calling it unavailable.
function Unavailable({ channelId }: { channelId: string }) {
  const { open } = useCabal();
  const linkables = useLinkableChannels();
  const { go, dialog } = useOpenLinkedChannel();
  const target = linkables.data?.find((c) => c.id === channelId);

  if (linkables.isLoading) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
      {target?.kind === "team" && !target.joined ? (
        <>
          <TeamIcon
            visibility={target.team_visibility}
            className="size-5 text-muted-foreground"
          />
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-balance text-foreground">
              {target.team_name}
            </p>
            <p>
              {target.member_count ?? 0}{" "}
              {target.member_count === 1 ? "member" : "members"} ·{" "}
              {"you're not on this team yet"}
            </p>
          </div>
          {target.welcome && (
            <p className="line-clamp-4 max-w-sm leading-relaxed text-pretty text-foreground/85">
              {target.welcome}
            </p>
          )}
          <Button onClick={() => go(channelId)}>Join {target.team_name}</Button>
        </>
      ) : (
        <p className="max-w-sm text-pretty">
          {
            "This conversation isn't available. It may be an invite-only team you're not on, or it was removed."
          }
        </p>
      )}
      <button
        type="button"
        onClick={() => open(null)}
        className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to everyone
      </button>
      {dialog}
    </div>
  );
}

function OpenConversation({
  channel,
  compact,
  popoutActions,
}: {
  channel: Channel;
  compact?: boolean;
  popoutActions?: React.ReactNode;
}) {
  const popout = !!popoutActions;
  const {
    userId,
    community,
    profileById,
    statusOf,
    send,
    markRead,
    open,
    showProfile,
    refreshChannels,
    blocked,
  } = useCabal();
  const lockIns = useLockIns(community.id);
  const {
    messages,
    error,
    isLoading,
    retry,
    loadOlder,
    hasMore,
    loadingOlder,
  } = useMessages(channel.id);
  const { typers, ping, stop } = useTyping(channel.id, userId);
  const [managing, setManaging] = useState(false);
  const [editingWelcome, setEditingWelcome] = useState(false);
  const [inviting, setInviting] = useState(false);
  const invitable = canInvite(channel);
  const hasPanel = channel.kind !== "dm";
  const {
    docked,
    open: panelOpen,
    toggle: togglePanel,
    close: closePanel,
  } = useMembersPanel(hasPanel);

  // Where the "New" divider goes: whatever was unread when this was opened.
  const firstUnreadAt = useRef(
    channel.unread > 0 ? channel.last_read_at : null,
  ).current;

  useEffect(() => {
    if (document.visibilityState === "visible") markRead(channel.id);
  }, [channel.id, markRead]);

  // A count can still turn up on the conversation you're looking at: a message
  // that arrived while another window had focus, or a list refresh that landed
  // before the read was saved. It's on screen, so it's read.
  useEffect(() => {
    if (channel.unread > 0 && document.visibilityState === "visible")
      markRead(channel.id);
  }, [channel.unread, channel.id, markRead]);

  const other =
    channel.kind === "dm" ? profileById(channel.other_user_id) : undefined;
  const otherStatus = channel.other_user_id
    ? statusOf(channel.other_user_id)
    : "offline";
  const isBlocked =
    !!channel.other_user_id && blocked.has(channel.other_user_id);

  const { status: e2eeStatus } = useE2ee();
  const peerId = channel.kind === "dm" ? channel.other_user_id : null;
  const peerEncryption = usePeerEncryption(peerId);
  const [verifying, setVerifying] = useState(false);
  const otherName = other?.display_name ?? "They";
  const dmBlock =
    channel.kind !== "dm"
      ? null
      : !peerId
        ? "This person isn’t on Cabal any more"
        : dmSendBlock(e2eeStatus, peerEncryption.data, otherName);

  const lastNotice = useMemo(
    () => messages.findLast((m) => m.kind === "system")?.id ?? null,
    [messages],
  );
  const people = usePeopleIn(channel, lastNotice);

  async function toggleMute() {
    const { error } = await createClient().rpc("set_muted", {
      p_channel: channel.id,
      p_muted: !channel.muted,
    });
    if (error) toast.error(friendlyError(error));
    else {
      refreshChannels();
      toast.message(
        channel.muted
          ? "Notifications on"
          : "Muted. No badges or notifications from here.",
      );
    }
  }

  const typingNames = typers
    .map((id) => profileById(id)?.display_name)
    .filter(Boolean) as string[];
  const placeholder =
    channel.kind === "dm"
      ? `Message ${other?.display_name ?? ""}`
      : channel.kind === "room"
        ? `Message #${channel.slug}`
        : `Message ${channel.team_name}`;

  const muteButton = (
    <IconButton
      label={channel.muted ? "Unmute" : "Mute"}
      onClick={toggleMute}
      pressed={channel.muted}
    >
      {channel.muted ? (
        <BellOff className="size-4" aria-hidden />
      ) : (
        <Bell className="size-4" aria-hidden />
      )}
    </IconButton>
  );

  return (
    <div className="relative flex min-h-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <Header compact={compact && !popout} onBack={() => open(null)}>
          {channel.kind === "dm" && (
            <button
              type="button"
              onClick={() => other && !popout && showProfile(other.id)}
              disabled={popout}
              className="flex min-w-0 items-center gap-2.5 rounded-md px-1 py-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
            >
              <Avatar
                name={other?.display_name ?? "?"}
                url={other?.avatar_url}
                size={28}
                status={otherStatus}
                lockedIn={
                  otherStatus !== "offline" &&
                  !!channel.other_user_id &&
                  lockIns.has(channel.other_user_id)
                }
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm leading-tight font-semibold">
                  {other?.display_name ?? "Former member"}
                </span>
                <span className="truncate text-xs leading-tight text-muted-foreground">
                  {other?.status_text || STATUS_LABEL[otherStatus]}
                </span>
              </span>
            </button>
          )}
          {channel.kind === "room" && (
            <div className="flex min-w-0 items-baseline gap-2 px-1">
              <span className="inline-flex shrink-0 items-center font-mono text-sm font-semibold">
                <Hash className="size-3.5 text-muted-foreground" aria-hidden />
                {channel.slug}
              </span>
              {channel.topic && (
                <span className="truncate text-xs text-muted-foreground">
                  {channel.topic}
                </span>
              )}
            </div>
          )}
          {channel.kind === "team" && (
            <div className="flex min-w-0 items-center gap-2 px-1">
              <TeamIcon
                visibility={channel.team_visibility}
                logo={channel.team_logo_url}
                className={
                  channel.team_logo_url
                    ? "size-5 shrink-0"
                    : "size-3.5 shrink-0 text-muted-foreground"
                }
              />
              <span className="truncate text-sm leading-5 font-semibold">
                {channel.team_name}
                {channel.team_visibility !== "public" && (
                  <span className="sr-only"> (invite-only)</span>
                )}
              </span>
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {invitable && (
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="mr-1 inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <UserPlus className="size-3.5" aria-hidden />
                Invite
              </button>
            )}
            {channel.kind !== "dm" && (
              <IconButton
                label={`Copy link to ${channel.kind === "room" ? `#${channel.slug}` : channel.team_name}`}
                onClick={() =>
                  copyChannelLink(
                    channel.id,
                    channel.kind === "room"
                      ? `#${channel.slug}`
                      : (channel.team_name ?? "this team"),
                  )
                }
              >
                <Link2 className="size-4" aria-hidden />
              </IconButton>
            )}
            {channel.kind === "team" &&
              (channel.team_role === "owner" ? (
                <IconButton
                  label="Team settings"
                  onClick={() => setManaging(true)}
                >
                  <Settings2 className="size-4" aria-hidden />
                </IconButton>
              ) : (
                <IconButton
                  label="Team details"
                  onClick={() => setManaging(true)}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </IconButton>
              ))}
            {channel.kind === "dm" &&
              e2eeStatus === "ready" &&
              peerEncryption.data?.key && (
                <EncryptionBadge
                  peer={peerEncryption.data}
                  onClick={() => setVerifying(true)}
                />
              )}
            {muteButton}
            {hasPanel && (
              <IconButton
                label={`${panelOpen ? "Hide" : "Show"} members`}
                onClick={togglePanel}
                pressed={panelOpen}
              >
                <Users className="size-4" aria-hidden />
              </IconButton>
            )}
            {popout ? (
              popoutActions
            ) : (
              <>
                {channel.kind === "dm" && other && (
                  <IconButton
                    label={`${other.display_name}'s profile`}
                    onClick={() => showProfile(other.id)}
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </IconButton>
                )}
                <span className="mx-1.5 h-4 w-px bg-border" aria-hidden />
                <LockInControl />
              </>
            )}
          </div>
        </Header>

        {channel.kind === "team" && channel.team_id && (
          <TeamWelcome
            channel={channel}
            notice={lastNotice}
            editing={editingWelcome}
            onEditingChange={setEditingWelcome}
            onEditLook={() => setManaging(true)}
          />
        )}
        {invitable && (
          <TeamInviteNudge
            channel={channel}
            onInvite={() => setInviting(true)}
          />
        )}
        {channel.kind === "room" && channel.slug === "launches" && (
          <LaunchesNote />
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

        <div
          className="h-5 shrink-0 px-5 text-xs text-muted-foreground"
          aria-live="polite"
        >
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
                  : "Several people are typing"}
            </span>
          )}
        </div>

        {peerId && !isBlocked && (
          <DmEncryptionNotice
            peerId={peerId}
            name={otherName}
            peer={peerEncryption.data}
            onVerify={() => setVerifying(true)}
            onAcknowledged={() => void peerEncryption.mutate()}
          />
        )}

        <Composer
          channelId={channel.id}
          placeholder={placeholder}
          onSend={(body, files) => send(channel.id, body, undefined, files)}
          onTyping={ping}
          onStopTyping={stop}
          disabled={isBlocked || !!dmBlock}
          disabledReason={
            isBlocked
              ? "You blocked this person. Unblock them from their profile to message."
              : (dmBlock ?? undefined)
          }
        />
      </div>

      {peerId && (
        <VerifyDialog
          open={verifying}
          onOpenChange={setVerifying}
          peerId={peerId}
          name={otherName}
          peer={peerEncryption.data}
        />
      )}

      {panelOpen && !docked && (
        <div
          className="absolute inset-0 z-10 bg-background/50"
          onClick={closePanel}
          aria-hidden
        />
      )}
      {panelOpen && (
        <PeoplePanel
          title={
            channel.kind === "team"
              ? (channel.team_name ?? "Team")
              : `#${channel.slug}`
          }
          team={channel.kind === "team"}
          {...people}
          onClose={docked ? undefined : closePanel}
          onInvite={invitable ? () => setInviting(true) : undefined}
        />
      )}

      {channel.kind === "team" && channel.team_id && (
        <>
          <TeamManageDialog
            open={managing}
            onOpenChange={setManaging}
            channel={channel}
            onEditWelcome={() => {
              setManaging(false);
              setEditingWelcome(true);
            }}
            onInvite={() => setInviting(true)}
          />
          <InviteToTeamDialog
            open={inviting}
            onOpenChange={setInviting}
            channel={channel}
          />
        </>
      )}
    </div>
  );
}

function Header({
  children,
  compact,
  onBack,
}: {
  children: React.ReactNode;
  compact?: boolean;
  onBack: () => void;
}) {
  return (
    <header className="app-drag flex h-11 shrink-0 items-center gap-1 border-b pr-2 pl-2">
      {compact && (
        <IconButton label="Back to everyone" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
        </IconButton>
      )}
      {children}
    </header>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        pressed && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
