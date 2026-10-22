"use client";

import { useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { Bell, BellOff, Link2, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  BOARD_LABEL,
  MUTED_SETTING,
  SEEN_SETTING,
  isNewSince,
  type Board,
} from "@/lib/boards";
import { copyChannelLink } from "./channel-links";
import { QuietIconButton } from "./page-header";
import {
  PeoplePanel,
  usePeopleIn,
  type MembersPanelState,
} from "./people-panel";
import { useCabal } from "./store";

type News = Record<Board, number>;

// How many things went up on each board since you last looked.
export function useBoardNews() {
  const { community } = useCabal();
  return useSWR(
    ["board-news", community.id],
    async (): Promise<News> => {
      const { data, error } = await createClient().rpc("board_news", {
        p_community: community.id,
      });
      if (error) throw error;
      const row = (
        data as { new_opportunities: number; new_events: number }[] | null
      )?.[0];
      return {
        opportunities: row?.new_opportunities ?? 0,
        calendar: row?.new_events ?? 0,
      };
    },
    { refreshInterval: 60_000, dedupingInterval: 10_000 },
  );
}

// While a board is open: you've seen it (clears the sidebar badge), and
// anything that goes up meanwhile is loaded in. Returns a check for the "New"
// tag, measured from when you last looked before opening it.
export function useBoardSeen(board: Board, onArrive: () => void) {
  const { settings } = useCabal();
  const news = useBoardNews();
  const since = useRef(settings[SEEN_SETTING[board]]).current;
  const count = news.data?.[board] ?? 0;
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const { mutate } = news;

  const markSeen = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const { error } = await createClient().rpc("mark_board_seen", {
      p_board: board,
    });
    if (!error)
      void mutate((cur) => (cur ? { ...cur, [board]: 0 } : cur), {
        revalidate: false,
      });
  }, [board, mutate]);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) {
      if (count === 0) return;
      arrive.current();
    }
    opened.current = true;
    void markSeen();
  }, [count, markSeen]);

  useEffect(() => {
    const onVisible = () => void markSeen();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markSeen]);

  return useCallback(
    (item: { added_at?: string | null; mine?: boolean }) =>
      isNewSince(item, since),
    [since],
  );
}

// The same link / bell / members buttons a channel has.
export function BoardActions({
  board,
  panel,
}: {
  board: Board;
  panel: MembersPanelState;
}) {
  const { settings, updateSettings } = useCabal();
  const name = BOARD_LABEL[board];
  const muted = settings[MUTED_SETTING[board]];

  async function toggleMute() {
    const ok = await updateSettings({ [MUTED_SETTING[board]]: !muted });
    if (ok)
      toast.message(muted ? "Notifications on" : "Muted. No badges from here.");
  }

  return (
    <>
      <QuietIconButton
        label={`Copy link to ${name}`}
        onClick={() => copyChannelLink(board, name)}
      >
        <Link2 className="size-4" aria-hidden />
      </QuietIconButton>
      <QuietIconButton
        label={muted ? "Unmute" : "Mute"}
        onClick={toggleMute}
        pressed={muted}
      >
        {muted ? (
          <BellOff className="size-4" aria-hidden />
        ) : (
          <Bell className="size-4" aria-hidden />
        )}
      </QuietIconButton>
      <QuietIconButton
        label={`${panel.open ? "Hide" : "Show"} members`}
        onClick={panel.toggle}
        pressed={panel.open}
      >
        <Users className="size-4" aria-hidden />
      </QuietIconButton>
    </>
  );
}

// Everyone in the community, beside the board (or over it in narrow windows).
export function BoardMembers({
  board,
  panel,
}: {
  board: Board;
  panel: MembersPanelState;
}) {
  const people = usePeopleIn(null, null);
  if (!panel.open) return null;
  return (
    <>
      {!panel.docked && (
        <div
          className="absolute inset-0 z-10 bg-background/50"
          onClick={panel.close}
          aria-hidden
        />
      )}
      <PeoplePanel
        title={BOARD_LABEL[board]}
        {...people}
        onClose={panel.docked ? undefined : panel.close}
      />
    </>
  );
}

export function NewTag() {
  return (
    <span className="font-mono text-[10.5px] tracking-wider text-primary uppercase">
      New
    </span>
  );
}
