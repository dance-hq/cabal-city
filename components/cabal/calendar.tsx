"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  Forward,
  Inbox,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  clock,
  dayLabel,
  groupByDay,
  happeningNow,
  shareText,
  timeRange,
  place,
  toIcs,
  trackedUrl,
  zoneCity,
  type CalendarEvent,
} from "@/lib/calendar";
import { PageHeader, QuietIconButton } from "./page-header";
import {
  BoardActions,
  BoardMembers,
  NewTag,
  useBoardSeen,
} from "./board-alerts";
import { useMembersPanel } from "./people-panel";
import { ShareDialog } from "./share-dialog";
import {
  CalendarEditor,
  ReviewEvents,
  usePendingEvents,
  type EventSeed,
} from "./calendar-editor";
import { useCabal } from "./store";

const FALLBACK_ZONE = "America/Chicago";

export function useCalendar(communityId: string) {
  return useSWR(["calendar", communityId], async () => {
    const { data, error } = await createClient().rpc("calendar_for", {
      p_community: communityId,
    });
    if (error) throw error;
    return data as CalendarEvent[];
  });
}

export function Calendar({ compact }: { compact?: boolean }) {
  const { community, isAdmin, open } = useCabal();
  const list = useCalendar(community.id);
  const pending = usePendingEvents(community.id, isAdmin);
  const [editing, setEditing] = useState<EventSeed | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sharing, setSharing] = useState<CalendarEvent | null>(null);
  const panel = useMembersPanel();
  const isNew = useBoardSeen("calendar", () => void list.mutate());

  const events = list.data ?? [];
  const groups = useMemo(() => groupByDay(events), [events]);
  const timeZone =
    events[0]?.time_zone ?? pending.data?.[0]?.time_zone ?? FALLBACK_ZONE;
  const waiting = pending.data?.length ?? 0;

  function download(e: CalendarEvent) {
    const blob = new Blob([toIcs(e, window.location.origin)], {
      type: "text/calendar;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${
      e.title
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase() || "event"
    }.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="relative flex min-h-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Calendar"
          icon={
            <CalendarDays
              className="size-4 text-muted-foreground"
              aria-hidden
            />
          }
          meta={list.data ? `${events.length} upcoming` : undefined}
          compact={compact}
          onBack={() => open(null)}
        >
          {isAdmin && waiting > 0 && (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Inbox className="size-3.5" aria-hidden />
              Review {waiting}
            </button>
          )}
          {isAdmin && (
            <QuietIconButton
              label="Add an event"
              onClick={() => setEditing({ mode: "add" })}
            >
              <Plus className="size-4" aria-hidden />
            </QuietIconButton>
          )}
          <BoardActions board="calendar" panel={panel} />
        </PageHeader>

        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
            <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
              Meetups, demo nights, coworking and anything else worth showing up
              for. Times are {zoneCity(timeZone)} time.
            </p>

            {list.isLoading ? (
              <ListSkeleton />
            ) : list.error ? (
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load the calendar.{" "}
                <button
                  type="button"
                  onClick={() => list.mutate()}
                  className="text-foreground underline underline-offset-2"
                >
                  Try again
                </button>
              </p>
            ) : groups.length === 0 ? (
              <div className="flex flex-col gap-1 rounded-lg border border-dashed px-4 py-6">
                <p className="text-sm font-medium">
                  Nothing on the calendar yet
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isAdmin
                    ? "Add the first event with the + button above."
                    : "Know something coming up? Send it in below."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {groups.map((g) => {
                  const day = dayLabel(g.key, g.events[0].time_zone);
                  return (
                    <section
                      key={g.key}
                      aria-label={
                        day.lead ? `${day.lead}, ${day.date}` : day.date
                      }
                      className="flex flex-col"
                    >
                      <h2 className="flex items-baseline gap-2 border-b pb-2 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                        {day.lead && (
                          <span className="text-foreground">{day.lead}</span>
                        )}
                        <span>{day.date}</span>
                      </h2>
                      <ul className="flex flex-col divide-y">
                        {g.events.map((e) => (
                          <EventRow
                            key={e.id}
                            e={e}
                            isNew={isNew(e)}
                            onShare={() => setSharing(e)}
                            onDownload={() => download(e)}
                            onEdit={
                              isAdmin
                                ? () => setEditing({ mode: "edit", id: e.id })
                                : undefined
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}

            {!isAdmin && (
              <div className="flex flex-col items-start gap-2 rounded-lg bg-accent/50 p-4">
                <p className="text-sm font-medium">Know something coming up?</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Send it in. Someone checks every event before it goes on the
                  calendar.
                </p>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: "submit" })}
                  className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Send an event
                </button>
              </div>
            )}
          </div>
        </div>

        {sharing && (
          <ShareDialog
            open
            onOpenChange={(v) => !v && setSharing(null)}
            what={sharing.title}
            text={shareText(sharing)}
          />
        )}
        <CalendarEditor
          seed={editing}
          timeZone={timeZone}
          onClose={() => setEditing(null)}
          onSaved={() => {
            list.mutate();
            pending.mutate();
          }}
        />
        <ReviewEvents
          open={reviewing}
          onOpenChange={setReviewing}
          pending={pending.data ?? []}
          onChanged={() => pending.mutate()}
          onReview={(id) => {
            setReviewing(false);
            setEditing({ mode: "review", id });
          }}
        />
      </div>
      <BoardMembers board="calendar" panel={panel} />
    </div>
  );
}

function EventRow({
  e,
  isNew,
  onShare,
  onDownload,
  onEdit,
}: {
  e: CalendarEvent;
  isNew: boolean;
  onShare: () => void;
  onDownload: () => void;
  onEdit?: () => void;
}) {
  const now = happeningNow(e);
  const link = e.url ? trackedUrl(e.url, "calendar") : null;
  return (
    <li className="flex flex-col gap-1.5 py-4 sm:flex-row sm:gap-5">
      <p
        className={cn(
          "shrink-0 font-mono text-xs leading-6 text-muted-foreground tabular-nums sm:w-36",
          now && "text-star",
        )}
      >
        {now ? "Happening now" : timeRange(e)}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {isNew && <NewTag />}
        <h3 className="text-[15px] leading-snug font-semibold text-balance">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="hover:underline hover:underline-offset-2"
            >
              {e.title}
            </a>
          ) : (
            e.title
          )}
        </h3>
        {(e.host || place(e.venue) || (now && e.ends_at)) && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {[
              e.host && (
                <span key="host">
                  Hosted by{" "}
                  <span className="font-medium text-foreground">{e.host}</span>
                </span>
              ),
              place(e.venue) && <span key="place">{place(e.venue)}</span>,
              now && e.ends_at && (
                <span key="until">until {clock(e.ends_at, e.time_zone)}</span>
              ),
            ]
              .filter(Boolean)
              .flatMap((part, i) =>
                i
                  ? [
                      <span key={`dot-${i}`} aria-hidden>
                        {" "}
                        ·{" "}
                      </span>,
                      part,
                    ]
                  : [part],
              )}
          </p>
        )}
        {e.summary && (
          <p className="text-sm leading-relaxed text-pretty">{e.summary}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Details &amp; RSVP
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          )}
          <div className="ml-auto flex items-center gap-0.5">
            {onEdit && (
              <QuietIconButton label={`Edit ${e.title}`} onClick={onEdit}>
                <Pencil className="size-3.5" aria-hidden />
              </QuietIconButton>
            )}
            <QuietIconButton
              label={`Add ${e.title} to your calendar`}
              onClick={onDownload}
            >
              <CalendarPlus className="size-4" aria-hidden />
            </QuietIconButton>
            <QuietIconButton label={`Share ${e.title}`} onClick={onShare}>
              <Forward className="size-4" aria-hidden />
            </QuietIconButton>
          </div>
        </div>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-3 w-28 animate-pulse rounded bg-accent" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-accent" />
          <div className="h-8 w-full animate-pulse rounded bg-accent/60" />
        </div>
      ))}
    </div>
  );
}
