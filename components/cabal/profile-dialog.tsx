'use client'

import { useState } from 'react'
import { ArrowUpRight, Ban, Flag, Globe, MessageSquare, MoreHorizontal, Pencil, Plus, UserX } from 'lucide-react'
import { linkLabel } from '@/lib/username'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar } from './avatar'
import { MemberPlaces } from './member-places'
import { LockInProfile } from './lock-in-profile'
import { ReportDialog, setBlocked } from './moderation'
import { STATUS_LABEL, StatusDot } from './status-dot'
import { useCabal } from './store'
import { InviteToTeamButton } from './team-invite'
import { useWorkSession } from './work-session'
import { CabalStar } from '@/components/brand/logo'
import { useLockIns } from '@/hooks/use-lock-ins'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { IDENTITY_LABEL } from '@/lib/identity'
import { nickColor } from '@/lib/nick-color'

export function ProfileDialog() {
  const {
    profileOpen,
    showProfile,
    profileById,
    statusOf,
    userId,
    openDm,
    members,
    blocked,
    refreshBlocks,
    refreshMembers,
    refreshChannels,
    setSettingsOpen,
    isAdmin,
    community,
  } = useCabal()
  const [reporting, setReporting] = useState(false)
  const profile = profileById(profileOpen)
  const member = members.find((m) => m.user_id === profileOpen)
  const self = profileOpen === userId
  const status = profileOpen ? statusOf(profileOpen) : 'offline'
  const isBlocked = !!profileOpen && blocked.has(profileOpen)
  const lockIns = useLockIns(community.id)
  const session = useWorkSession()
  const lockedIn = self ? session.status === 'running' : status !== 'offline' && !!profileOpen && lockIns.has(profileOpen)

  const close = () => showProfile(null)
  const editProfile = () => {
    close()
    setSettingsOpen(true)
  }

  // Their name color from the chat, so the card reads as the same person.
  const tint = nickColor(profileOpen, self)
  const joined = member
    ? new Date(member.joined_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null
  const hasAbout = !!(profile?.company || profile?.bio)
  const links = profile?.links ?? []

  async function toggleBlock() {
    if (!profile) return
    if (await setBlocked(userId, profile.id, !isBlocked)) {
      refreshBlocks()
      refreshChannels()
      toast.message(isBlocked ? `Unblocked ${profile.display_name}` : `Blocked ${profile.display_name}`, {
        description: isBlocked ? undefined : "They can't message you, and their channel messages are hidden for you.",
      })
    }
  }

  async function removeFromCommunity() {
    if (!profile) return
    if (!window.confirm(`Remove ${profile.display_name} from ${community.name}? They won't be able to rejoin.`)) return
    const { error } = await createClient().rpc('set_member_banned', {
      p_community: community.id,
      p_user: profile.id,
      p_banned: true,
    })
    if (error) toast.error(friendlyError(error))
    else {
      toast.success(`${profile.display_name} was removed.`)
      refreshMembers()
      close()
    }
  }

  return (
    <>
      <Dialog open={!!profile} onOpenChange={(o) => !o && close()}>
        <DialogContent className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[25rem]">
          {profile && (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <div
                  aria-hidden
                  className="h-16 shrink-0"
                  style={{
                    background: `color-mix(in oklch, ${tint} 30%, var(--popover))`,
                    borderBottom: `1px solid color-mix(in oklch, ${tint} 40%, var(--popover))`,
                  }}
                />

                <header className="flex flex-col gap-3 px-5">
                  <div className="-mt-9 flex items-end justify-between gap-3">
                    <span className="rounded-full bg-popover p-1">
                      <Avatar
                        name={profile.display_name ?? ''}
                        url={profile.avatar_url}
                        size={80}
                        status={status}
                        lockedIn={lockedIn}
                        dotRingClassName="ring-popover"
                      />
                    </span>
                    {(profile.identity || member?.role === 'admin') && (
                      <div className="flex flex-wrap justify-end gap-1.5 pb-1">
                        {member?.role === 'admin' && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                            <CabalStar className="size-3" />
                            Cabal team
                          </span>
                        )}
                        {profile.identity && (
                          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {IDENTITY_LABEL[profile.identity]}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <DialogTitle className="text-xl leading-tight font-semibold text-balance">{profile.display_name}</DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-mono font-medium" style={{ color: tint }}>
                        @{profile.username}
                      </span>
                      <span aria-hidden className="text-border">
                        /
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <StatusDot status={status} size={8} decorative />
                        {STATUS_LABEL[status]}
                      </span>
                      {lockedIn && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-px text-xs font-medium text-gold">
                          Locked in
                        </span>
                      )}
                    </DialogDescription>
                  </div>

                  {profile.status_text && (
                    <p className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm leading-relaxed text-pretty break-words">
                      {profile.status_text}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {self ? (
                      <Button variant="secondary" onClick={editProfile}>
                        <Pencil aria-hidden />
                        Edit profile
                      </Button>
                    ) : (
                      <>
                        <Button
                          disabled={isBlocked}
                          onClick={async () => {
                            close()
                            await openDm(profile.id)
                          }}
                        >
                          <MessageSquare aria-hidden />
                          Message
                        </Button>
                        {!isBlocked && <InviteToTeamButton personId={profile.id} name={profile.display_name ?? 'them'} />}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon" className="ml-auto" />}
                            aria-label={`More for ${profile.display_name}`}
                          >
                            <MoreHorizontal aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem onClick={toggleBlock}>
                              <Ban aria-hidden />
                              {isBlocked ? 'Unblock' : 'Block'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setReporting(true)}>
                              <Flag aria-hidden />
                              Report
                            </DropdownMenuItem>
                            {isAdmin && member?.role !== 'admin' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onClick={removeFromCommunity}>
                                  <UserX aria-hidden />
                                  Remove from community
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                </header>

                <div className="mt-5 flex flex-col gap-5 border-t px-5 pt-4 pb-5">
                  {hasAbout && (
                    <Section title="About">
                      <dl className="flex flex-col gap-3 text-sm">
                        {profile.company && (
                          <div className="flex flex-col gap-0.5">
                            <dt className="text-xs text-muted-foreground">Building at</dt>
                            <dd className="font-medium">{profile.company}</dd>
                          </div>
                        )}
                        {profile.bio && (
                          <div className="flex flex-col gap-0.5">
                            <dt className="text-xs text-muted-foreground">Working on</dt>
                            <dd className="leading-relaxed text-pretty">{profile.bio}</dd>
                          </div>
                        )}
                      </dl>
                    </Section>
                  )}

                  {self && !hasAbout && (
                    <button
                      type="button"
                      onClick={editProfile}
                      className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3.5 py-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Plus className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium">Add what you&apos;re building</span>
                        <span className="text-xs text-muted-foreground">Helps the right people find you.</span>
                      </span>
                    </button>
                  )}

                  {links.length > 0 && (
                    <Section title="Links">
                      <ul className="flex flex-wrap gap-1.5">
                        {links.map((href) => (
                          <li key={href} className="min-w-0 max-w-full">
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer nofollow ugc"
                              className="group flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="min-w-0 truncate">{linkLabel(href)}</span>
                              <ArrowUpRight
                                className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                                aria-hidden
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <MemberPlaces personId={profile.id} self={self} onNavigate={close} />
                  <LockInProfile personId={profile.id} self={self} />

                  {joined && (
                    <p className="text-xs text-muted-foreground">
                      Member of {community.name} since {joined}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ReportDialog
        open={reporting}
        onOpenChange={setReporting}
        title={`Report ${profile?.display_name ?? 'member'}`}
        onSubmit={async (reason) => {
          const { error } = await createClient().rpc('report_user', {
            p_community: community.id,
            p_user: profileOpen,
            p_reason: reason,
          })
          if (error) throw error
        }}
      />
    </>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex w-full flex-col gap-2" aria-label={title}>
      <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}
