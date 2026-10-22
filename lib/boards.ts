// Opportunities and Calendar act like channels in the sidebar: a count of
// what's new since you last looked, a bell to mute them, and a link.
export type Board = "opportunities" | "calendar";

export const BOARD_LABEL: Record<Board, string> = {
  opportunities: "Opportunities",
  calendar: "Calendar",
};

export const SEEN_SETTING = {
  opportunities: "opportunities_seen_at",
  calendar: "calendar_seen_at",
} as const;
export const MUTED_SETTING = {
  opportunities: "opportunities_muted",
  calendar: "calendar_muted",
} as const;

// Went up after you last looked, and someone else put it there.
export function isNewSince(
  item: { added_at?: string | null; mine?: boolean },
  since: string | null | undefined,
) {
  if (item.mine || !item.added_at || !since) return false;
  return Date.parse(item.added_at) > Date.parse(since);
}
