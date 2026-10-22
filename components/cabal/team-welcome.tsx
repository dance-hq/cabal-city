'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, ChevronUp, Loader2, Pin, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { Channel } from '@/lib/types'
import { Avatar } from './avatar'
import { MessageText } from './message-text'
import { useCabal } from './store'
import { refreshTeamRooms } from './team-dialogs'
import { TeamBanner, TeamMark, useTeamImages } from './team-images'

export const WELCOME_MAX = 1000

type Welcome = { welcome: string | null; welcome_updated_at: string | null; welcome_updated_by: string | null }

// Refreshes with every room notice (the first note posts one) and once a minute.
function useTeamWelcome(teamId: string, notice: string | null) {
  return useSWR(
    ['team-welcome', teamId, notice],
    async () => {
      const { data, error } = await createClient()
        .from('teams')
        .select('welcome, welcome_updated_at, welcome_updated_by')
        .eq('id', teamId)
        .maybeSingle()
      if (error) throw error
      return (data ?? { welcome: null, welcome_updated_at: null, welcome_updated_by: null }) as Welcome
    },
    { refreshInterval: 60_000, keepPreviousData: true },
  )
}

// Collapsing remembers which version you collapsed, so an edit opens it again.
const collapsedKey = (teamId: string) => `cabal:team-welcome-collapsed:${teamId}`
const promptHiddenKey = (teamId: string) => `cabal:team-welcome-prompt-hidden:${teamId}`

function shortDate(iso: string) {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

export function TeamWelcome({
  channel,
  notice,
  editing,
  onEditingChange,
  onEditLook,
}: {
  channel: Channel
  notice: string | null
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onEditLook?: () => void
}) {
  const teamId = channel.team_id!
  const isOwner = channel.team_role === 'owner'
  const { profileById, me } = useCabal()
  const { data, mutate } = useTeamWelcome(teamId, notice)
  const images = useTeamImages(teamId).data
  const logo = images?.logo_url ?? null
  const banner = images?.banner_url ?? null
  const hasArt = !!(logo || banner)
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null)
  const [promptHidden, setPromptHidden] = useState(true)
  const [full, setFull] = useState(false)

  useEffect(() => {
    setCollapsedAt(localStorage.getItem(collapsedKey(teamId)))
    setPromptHidden(localStorage.getItem(promptHiddenKey(teamId)) === '1')
  }, [teamId])

  if (!data) return null
  const text = data.welcome

  if (editing) {
    return (
      <WelcomeEditor
        teamId={teamId}
        teamName={channel.team_name ?? 'your team'}
        initial={text ?? ''}
        onDone={async (saved) => {
          onEditingChange(false)
          if (saved) await mutate()
        }}
      />
    )
  }

  if (!text && !hasArt) {
    if (!isOwner || promptHidden) return null
    return (
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-pretty text-muted-foreground">
          Add a logo, a banner and a welcome note so people know what you&apos;re building and how to jump in.
        </p>
        {onEditLook && (
          <Button size="sm" variant="ghost" onClick={onEditLook}>
            Add logo
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => onEditingChange(true)}>
          Write welcome note
        </Button>
        <button
          type="button"
          aria-label="Hide this suggestion"
          title="Hide this suggestion"
          onClick={() => {
            localStorage.setItem(promptHiddenKey(teamId), '1')
            setPromptHidden(true)
          }}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    )
  }

  const version = data.welcome_updated_at ?? 'v'
  const collapsed = collapsedAt === version
  const author = profileById(data.welcome_updated_by)
  const long = !!text && (text.length > 280 || text.split('\n').length > 4)

  function setCollapsed(next: boolean) {
    if (next) localStorage.setItem(collapsedKey(teamId), version)
    else localStorage.removeItem(collapsedKey(teamId))
    setCollapsedAt(next ? version : null)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-expanded={false}
        className="flex w-full shrink-0 items-center gap-2 border-b bg-card/40 px-4 py-1.5 text-left text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        {logo ? (
          <TeamMark logo={logo} visibility={channel.team_visibility} size={16} className="rounded-[3px]" />
        ) : (
          <Pin className="size-3 shrink-0 text-flag" aria-hidden />
        )}
        <span className="shrink-0 font-medium">{text ? 'Welcome note' : channel.team_name}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{text?.split('\n')[0]}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{text ? 'Show the welcome note' : 'Show the team banner'}</span>
      </button>
    )
  }

  return (
    <section
      aria-label={text ? 'Welcome note' : `${channel.team_name} banner`}
      className={cn('shrink-0 border-b', hasArt ? 'bg-background' : 'bg-card/40')}
    >
      {banner && <TeamBanner url={banner} className="h-20 sm:h-28" />}
      <div className={cn('px-4 pb-3', banner ? 'pt-0' : 'pt-2.5')}>
        <div className={cn('flex gap-2', hasArt ? 'items-end' : 'items-center')}>
          {hasArt ? (
            <>
              {logo && (
                <TeamMark
                  logo={logo}
                  visibility={channel.team_visibility}
                  size={banner ? 56 : 40}
                  className={cn(banner && '-mt-7 ring-4 ring-background')}
                />
              )}
              <div className={cn('flex min-w-0 flex-1 flex-col', banner && !logo && 'pt-2.5')}>
                <h2 className="truncate text-base leading-tight font-semibold text-balance">{channel.team_name}</h2>
                {text && (
                  <span className="flex items-center gap-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                    <Pin className="size-3 text-flag" aria-hidden />
                    Welcome note
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Pin className="size-3.5 shrink-0 text-flag" aria-hidden />
              <h2 className="min-w-0 flex-1 truncate font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
                Welcome to {channel.team_name}
              </h2>
            </>
          )}
          {isOwner && onEditLook && (
            <Button size="xs" variant="ghost" onClick={onEditLook}>
              {hasArt ? 'Logo & banner' : 'Add logo'}
            </Button>
          )}
          {isOwner && (
            <Button size="xs" variant="ghost" onClick={() => onEditingChange(true)}>
              {text ? 'Edit' : 'Write welcome note'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-expanded
            aria-label={text ? 'Collapse the welcome note' : 'Collapse the banner'}
            title="Collapse"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </button>
        </div>

        {text && (
          <>
            <div
              className={cn(
                'mt-1.5 max-w-prose text-sm leading-relaxed break-words whitespace-pre-wrap text-pretty text-foreground/90',
                hasArt && 'mt-2.5',
                long && !full && 'line-clamp-4',
              )}
            >
              <MessageText body={text} myUsername={me.username} />
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {author && <Avatar name={author.display_name ?? '?'} url={author.avatar_url} size={16} />}
              <span className="truncate">
                {author?.display_name ?? 'Team owner'}
                {data.welcome_updated_at && ` · ${shortDate(data.welcome_updated_at)}`}
              </span>
              {long && (
                <button
                  type="button"
                  onClick={() => setFull((v) => !v)}
                  className="ml-auto shrink-0 rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {full ? 'Show less' : 'Read the whole note'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function WelcomeEditor({
  teamId,
  teamName,
  initial,
  onDone,
}: {
  teamId: string
  teamName: string
  initial: string
  onDone: (saved: boolean) => void
}) {
  const { community } = useCabal()
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const trimmed = value.trim()
  const changed = trimmed !== initial.trim()

  async function save(next: string) {
    setBusy(true)
    const { error } = await createClient().rpc('set_team_welcome', { p_team: teamId, p_welcome: next })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    void refreshTeamRooms(community.id)
    toast.success(next ? 'Welcome note pinned' : 'Welcome note removed')
    onDone(true)
  }

  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-b bg-card/40 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) void save(trimmed)
      }}
    >
      <div className="flex items-center gap-2">
        <Pin className="size-3.5 shrink-0 text-flag" aria-hidden />
        <label htmlFor="team-welcome" className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
          Welcome note for {teamName}
        </label>
      </div>
      <Textarea
        id="team-welcome"
        autoFocus
        rows={5}
        maxLength={WELCOME_MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone(false)
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            if (changed && !busy) void save(trimmed)
          }
        }}
        placeholder={
          "What you're building, who's on the team, and how people can help. Links work.\n\nExample: We're building Acme, a robot that folds laundry. Looking for beta testers and a firmware engineer. Demo link: https://…"
        }
        className="min-h-28 resize-y text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
          {value.length.toLocaleString()} / {WELCOME_MAX.toLocaleString()}
        </span>
        {initial && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => save('')}
          >
            Remove note
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy || !changed || (!trimmed && !initial)}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {initial ? 'Save' : 'Pin note'}
          </Button>
        </div>
      </div>
    </form>
  )
}
