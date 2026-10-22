"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  Bookmark,
  Forward,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  Radar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  KIND_LABEL,
  OPPORTUNITY_KINDS,
  arrangeOpportunities,
  deadlineLabel,
  fitLabel,
  fitsYou,
  formatDay,
  isStale,
  shareText,
  sourceHost,
  type Opportunity,
  type OpportunityKind,
} from "@/lib/opportunities";
import { PageHeader, QuietIconButton, Segmented } from "./page-header";
import {
  BoardActions,
  BoardMembers,
  NewTag,
  useBoardSeen,
} from "./board-alerts";
import { useMembersPanel } from "./people-panel";
import { ShareDialog } from "./share-dialog";
import {
  OpportunityEditor,
  ReviewSubmissions,
  useSubmissions,
  type EditorSeed,
} from "./opportunity-editor";
import { useCabal } from "./store";

type Tab = "all" | OpportunityKind | "saved";

export function useOpportunities(communityId: string) {
  return useSWR(["opportunities", communityId], async () => {
    const { data, error } = await createClient().rpc("opportunities_for", {
      p_community: communityId,
    });
    if (error) throw error;
    return data as Opportunity[];
  });
}

export function Opportunities({ compact }: { compact?: boolean }) {
  const { community, me, isAdmin, open } = useCabal();
  const list = useOpportunities(community.id);
  const submissions = useSubmissions(community.id, isAdmin);
  const [tab, setTab] = useState<Tab>("all");
  const [sharing, setSharing] = useState<Opportunity | null>(null);
  const [editing, setEditing] = useState<EditorSeed | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const panel = useMembersPanel();
  const isNew = useBoardSeen("opportunities", () => void list.mutate());

  const all = useMemo(
    () => arrangeOpportunities(list.data ?? [], me.identities),
    [list.data, me.identities],
  );
  const shown = all.filter((o) =>
    tab === "all" ? true : tab === "saved" ? o.saved : o.kind === tab,
  );
  const counts = Object.fromEntries(
    OPPORTUNITY_KINDS.map((k) => [
      k.value,
      all.filter((o) => o.kind === k.value).length,
    ]),
  );
  const saved = all.filter((o) => o.saved).length;
  const pending = submissions.data?.length ?? 0;

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "all", label: "All", count: all.length },
    ...OPPORTUNITY_KINDS.filter((k) => counts[k.value] > 0).map((k) => ({
      value: k.value as Tab,
      label: k.tab,
      count: counts[k.value],
    })),
    { value: "saved", label: "Saved", count: saved },
  ];

  async function toggleSave(o: Opportunity) {
    list.mutate(
      (cur) => cur?.map((x) => (x.id === o.id ? { ...x, saved: !x.saved } : x)),
      { revalidate: false },
    );
    const { error } = await createClient().rpc("toggle_opportunity_save", {
      p_opportunity: o.id,
    });
    if (error) {
      toast.error(friendlyError(error));
      list.mutate();
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          title="Opportunities"
          icon={<Radar className="size-4 text-muted-foreground" aria-hidden />}
          meta={list.data ? `${all.length} open` : undefined}
          compact={compact}
          onBack={() => open(null)}
        >
          {isAdmin && pending > 0 && (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Inbox className="size-3.5" aria-hidden />
              Review {pending}
            </button>
          )}
          {isAdmin && (
            <QuietIconButton
              label="Add an opportunity"
              onClick={() => setEditing({})}
            >
              <Plus className="size-4" aria-hidden />
            </QuietIconButton>
          )}
          <BoardActions board="opportunities" panel={panel} />
        </PageHeader>

        <div className="quiet-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-6">
            <p className="max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
              Credits, funding, hackathons and events worth a builder&apos;s
              time. Each one links to its source and says when someone last
              checked it.
            </p>

            {list.data && all.length > 0 && (
              <Segmented
                label="Kind of opportunity"
                value={tab}
                onChange={setTab}
                options={tabs}
              />
            )}

            {list.isLoading ? (
              <ListSkeleton />
            ) : list.error ? (
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load opportunities.{" "}
                <button
                  type="button"
                  onClick={() => list.mutate()}
                  className="text-foreground underline underline-offset-2"
                >
                  Try again
                </button>
              </p>
            ) : shown.length === 0 ? (
              <Empty tab={tab} />
            ) : (
              <ul className="flex flex-col divide-y border-y">
                {shown.map((o) => (
                  <OpportunityRow
                    key={o.id}
                    o={o}
                    isNew={isNew(o)}
                    fit={fitLabel(o, me.identities)}
                    onSave={() => toggleSave(o)}
                    onShare={() => setSharing(o)}
                    onEdit={
                      isAdmin ? () => setEditing({ id: o.id }) : undefined
                    }
                  />
                ))}
              </ul>
            )}

            <SubmitLink communityId={community.id} />

            {all.some((o) => fitsYou(o, me.identities)) && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                The &ldquo;For …&rdquo; tags are a hint from the roles on your
                profile. Each program decides who&apos;s eligible, so read its
                terms before you apply.
              </p>
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
        <OpportunityEditor
          seed={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            list.mutate();
            submissions.mutate();
          }}
        />
        <ReviewSubmissions
          open={reviewing}
          onOpenChange={setReviewing}
          submissions={submissions.data ?? []}
          onChanged={() => submissions.mutate()}
          onAdd={(s) => {
            setReviewing(false);
            setEditing({ url: s.url, submission: s.id });
          }}
        />
      </div>
      <BoardMembers board="opportunities" panel={panel} />
    </div>
  );
}

function OpportunityRow({
  o,
  isNew,
  fit,
  onSave,
  onShare,
  onEdit,
}: {
  o: Opportunity;
  isNew: boolean;
  fit: string | null;
  onSave: () => void;
  onShare: () => void;
  onEdit?: () => void;
}) {
  const deadline = o.deadline ? deadlineLabel(o.deadline) : null;
  const stale = isStale(o.verified_at);
  return (
    <li className="flex flex-col gap-2 py-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        {isNew && (
          <>
            <NewTag />
            <span aria-hidden>·</span>
          </>
        )}
        <span>{KIND_LABEL[o.kind]}</span>
        <span aria-hidden>·</span>
        <span>{o.place}</span>
        {deadline && (
          <>
            <span aria-hidden>·</span>
            <span className={cn(deadline.soon && "text-star")}>
              {deadline.text}
            </span>
          </>
        )}
      </p>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] leading-snug font-semibold text-balance">
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:underline-offset-2"
          >
            {o.title}
          </a>
          {o.provider && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {o.provider}
            </span>
          )}
        </h2>
        <p className="text-sm leading-relaxed text-pretty">{o.summary}</p>
        {o.eligibility && (
          <p className="text-[13px] leading-relaxed text-pretty text-muted-foreground">
            <span className="text-foreground/80">Who it&apos;s for: </span>
            {o.eligibility}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {fit && (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80">
            <span className="size-1.5 rounded-full bg-flag" aria-hidden />
            {fit}
          </span>
        )}
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title={
            stale
              ? "Not checked in a while. Details may have changed."
              : undefined
          }
        >
          {stale ? "Last checked" : "Checked"} {formatDay(o.verified_at)} ·{" "}
          {sourceHost(o.url)}
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
        <div className="ml-auto flex items-center gap-0.5">
          {onEdit && (
            <QuietIconButton label={`Edit ${o.title}`} onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden />
            </QuietIconButton>
          )}
          <QuietIconButton label={`Share ${o.title}`} onClick={onShare}>
            <Forward className="size-4" aria-hidden />
          </QuietIconButton>
          <QuietIconButton
            label={
              o.saved
                ? `Saved. Remove ${o.title} from saved`
                : `Save ${o.title}`
            }
            onClick={onSave}
            pressed={o.saved}
            className={cn(o.saved && "text-foreground")}
          >
            <Bookmark
              className={cn("size-4", o.saved && "fill-current")}
              aria-hidden
            />
          </QuietIconButton>
        </div>
      </div>
    </li>
  );
}

function Empty({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed px-4 py-6">
      <p className="text-sm font-medium">
        {tab === "saved" ? "Nothing saved yet" : "Nothing open here right now"}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {tab === "saved"
          ? "Tap the bookmark on anything worth coming back to."
          : "Deadlines that pass drop off on their own. Know a good one? Send the link below."}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-6 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-3 w-40 animate-pulse rounded bg-accent" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-accent" />
          <div className="h-10 w-full animate-pulse rounded bg-accent/60" />
        </div>
      ))}
    </div>
  );
}

function SubmitLink({ communityId }: { communityId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const link = url.trim();
    if (!link) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("submit_opportunity", {
      p_community: communityId,
      p_url: /^https?:\/\//i.test(link) ? link : `https://${link}`,
      p_note: null,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setUrl("");
    toast.success(
      data === "known"
        ? "That one is already listed or waiting for a look."
        : "Thanks. Someone will check the source before it goes up.",
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg bg-accent/50 p-4"
    >
      <label htmlFor="opportunity-url" className="text-sm font-medium">
        Know one we&apos;re missing?
      </label>
      <div className="flex gap-2">
        <input
          id="opportunity-url"
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link to the program, grant or event"
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Send
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Nothing goes up until someone has read the source.
      </p>
    </form>
  );
}
