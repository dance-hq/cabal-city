'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { ago, fullTime } from '@/lib/time'
import { IDEA_STATUS_LABEL, isGithubUrl, shortDate, type Idea, type IdeaComment, type IdeaStatus, type Ship } from '@/lib/board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from './avatar'
import { MessageText } from './message-text'
import { GithubLink, StatusLabel, VoteButton, boardKey, shipsKey } from './board-parts'
import { useCabal } from './store'

export function IdeaDetail({
  ideaId,
  idea,
  loading,
  ship,
  onBack,
}: {
  ideaId: string
  idea: Idea | undefined
  loading: boolean
  ship: Ship | undefined
  onBack: () => void
}) {
  const { profileById, userId, isAdmin, me } = useCabal()

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 inline-flex items-center gap-1 self-start rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      All ideas
    </button>
  )

  if (!idea) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {loading ? (
          <div className="h-24 animate-pulse rounded-md bg-accent/60" aria-hidden />
        ) : (
          <p className="text-sm text-muted-foreground">This idea isn&apos;t on the board anymore.</p>
        )}
      </div>
    )
  }

  const author = profileById(idea.author_id)
  const authorName = idea.author_id === userId ? 'You' : (author?.display_name ?? 'A member')

  return (
    <article className="flex flex-col gap-6">
      {back}
      <header className="flex items-start gap-4">
        <VoteButton idea={idea} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusLabel status={idea.status} />
            {idea.hidden && <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">· Hidden</span>}
          </div>
          <h2 className="text-xl leading-snug font-semibold text-balance">{idea.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={author?.display_name ?? '?'} url={author?.avatar_url} size={18} />
              {authorName}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={idea.created_at} title={fullTime(idea.created_at)}>
              {shortDate(idea.created_at)}
            </time>
            {idea.github_url && (
              <>
                <span aria-hidden>·</span>
                <GithubLink url={idea.github_url} />
              </>
            )}
          </p>
        </div>
      </header>

      {idea.body && (
        <p className="text-sm leading-relaxed text-pretty">
          <MessageText body={idea.body} myUsername={me.username} />
        </p>
      )}

      {ship && (
        <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
          <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
            Shipped {shortDate(ship.shipped_at)}
          </p>
          <p className="text-sm leading-relaxed text-pretty">{ship.body ?? ship.title}</p>
          {ship.github_url && ship.github_url !== idea.github_url && <GithubLink url={ship.github_url} />}
        </div>
      )}

      {isAdmin && <MaintainerControls idea={idea} />}

      <Thread ideaId={ideaId} />
    </article>
  )
}

function MaintainerControls({ idea }: { idea: Idea }) {
  const { mutate } = useSWRConfig()
  const [shipping, setShipping] = useState(false)
  const [note, setNote] = useState('')
  const [link, setLink] = useState(idea.github_url ?? '')
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    mutate(boardKey)
    mutate(shipsKey)
  }

  async function run(fn: () => PromiseLike<{ error: unknown }>, done: string) {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return false
    }
    toast.message(done)
    refresh()
    return true
  }

  const supabase = createClient()
  const linkValid = !link.trim() || isGithubUrl(link)

  function setStatus(status: IdeaStatus) {
    if (status === idea.status) return
    if (status === 'shipped') {
      setShipping(true)
      return
    }
    run(
      () => supabase.rpc('set_idea_status', { p_idea: idea.id, p_status: status }),
      idea.status === 'shipped' ? `Moved back to ${IDEA_STATUS_LABEL[status]}. Its ship was removed.` : `Marked ${IDEA_STATUS_LABEL[status]}`,
    )
  }

  return (
    <section aria-label="Maintainer tools" className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Maintainers</p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Status" className="flex gap-1">
          {(['requested', 'building', 'shipped'] as IdeaStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={idea.status === s}
              disabled={busy}
              onClick={() => setStatus(s)}
              className={cn(
                'h-7 rounded-md border px-2.5 text-xs hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                idea.status === s && 'border-primary bg-accent font-medium',
              )}
            >
              {IDEA_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          className="ml-auto text-muted-foreground"
          onClick={() =>
            run(
              () => supabase.rpc('set_idea_hidden', { p_idea: idea.id, p_hidden: !idea.hidden }),
              idea.hidden ? 'Back on the board' : 'Hidden from members',
            )
          }
        >
          {idea.hidden ? 'Unhide' : 'Hide'}
        </Button>
      </div>

      {shipping ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!linkValid) return
            const ok = await run(
              () => supabase.rpc('set_idea_status', { p_idea: idea.id, p_status: 'shipped', p_note: note, p_link: link }),
              'Shipped. It’s the latest ship now.',
            )
            if (ok) setShipping(false)
          }}
        >
          <label htmlFor="ship-note" className="text-sm font-medium">
            What changed?
          </label>
          <Textarea
            id="ship-note"
            rows={2}
            maxLength={1000}
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="One or two plain sentences. This is what members see."
          />
          <Input
            aria-label="Pull request or issue link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/…/pull/123 (optional)"
          />
          {!linkValid && <p className="text-xs text-destructive">Use a github.com link.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShipping(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !linkValid}>
              Mark shipped
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!linkValid) return
            run(() => supabase.rpc('set_idea_link', { p_idea: idea.id, p_link: link }), link.trim() ? 'Linked' : 'Link removed')
          }}
        >
          <Input
            aria-label="GitHub issue or pull request"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link a GitHub issue or pull request"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !linkValid || link === (idea.github_url ?? '')}>
            Save
          </Button>
        </form>
      )}
    </section>
  )
}

function Thread({ ideaId }: { ideaId: string }) {
  const { profileById, isAdmin, me } = useCabal()
  const { mutate } = useSWRConfig()
  const thread = useSWR(['idea-thread', ideaId], async () => {
    const { data, error } = await createClient().rpc('idea_thread', { p_idea: ideaId })
    if (error) throw error
    return data as IdeaComment[]
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const { error } = await createClient().rpc('add_idea_comment', { p_idea: ideaId, p_body: body })
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }
    setText('')
    thread.mutate()
    mutate(boardKey)
  }

  async function remove(id: string) {
    const { error } = await createClient().rpc('delete_idea_comment', { p_comment: id })
    if (error) toast.error(friendlyError(error))
    thread.mutate()
    mutate(boardKey)
  }

  const comments = thread.data ?? []

  return (
    <section aria-label="Discussion" className="flex flex-col gap-3">
      <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        Discussion{comments.length > 0 ? ` · ${comments.length}` : ''}
      </h3>

      {thread.isLoading ? (
        <div className="h-12 animate-pulse rounded-md bg-accent/60" aria-hidden />
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Add context, a use case, or a different take.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => {
            const who = profileById(c.author_id)
            const name = c.mine ? 'You' : (who?.display_name ?? 'A member')
            return (
              <li key={c.id} className="group flex gap-2.5">
                <Avatar name={who?.display_name ?? '?'} url={who?.avatar_url} size={24} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex items-baseline gap-2 text-xs">
                    <span className="font-medium">{name}</span>
                    <time dateTime={c.created_at} title={fullTime(c.created_at)} className="font-mono text-[11px] text-muted-foreground">
                      {ago(c.created_at)}
                    </time>
                    {(c.mine || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        aria-label="Remove comment"
                        title="Remove comment"
                        className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </p>
                  <p className="text-sm leading-relaxed">
                    <MessageText body={c.body} myUsername={me.username} />
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor="idea-comment" className="sr-only">
          Add a comment
        </label>
        <Textarea
          id="idea-comment"
          rows={2}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Add to the discussion"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Comment
          </Button>
        </div>
      </form>
    </section>
  )
}
