'use client'

import { useState } from 'react'
import { ExternalLink, MessageSquare, Plus } from 'lucide-react'
import { linkLabel } from '@/lib/username'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Avatar } from './avatar'
import { MemberPlaces } from './member-places'
import { ReportDialog, setBlocked } from './moderation'
import { STATUS_LABEL } from './status-dot'
import { useCabal } from './store'
import { useWorkSession } from './work-session'
import { CabalStar } from '@/components/brand/logo'
import { useLockIns } from '@/hooks/use-lock-ins'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { IDENTITY_LABEL } from '@/lib/identity'

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

  return (
    <>
      <Dialog open={!!profile} onOpenChange={(o) => !o && close()}>
        <DialogContent className="gap-0 p-0 sm:max-w-sm">
          {profile && (
            <>
              <div className="flex flex-col items-start gap-3 p-5">
                <Avatar name={profile.display_name ?? ''} url={profile.avatar_url} size={64} status={status} lockedIn={lockedIn} />
                <div className="flex flex-col gap-0.5">
                  <DialogTitle className="text-lg leading-tight">{profile.display_name}</DialogTitle>
                  <DialogDescription className="font-mono text-xs">
                    @{profile.username} · {STATUS_LABEL[status]}
                    {lockedIn ? ' · locked in' : ''}
                  </DialogDescription>
                </div>
                {(profile.identity || member?.role === 'admin') && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.identity && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{IDENTITY_LABEL[profile.identity]}</span>
                    )}
                    {member?.role === 'admin' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                        <CabalStar className="size-3" />
                        Cabal team
                      </span>
                    )}
                  </div>
                )}
                {profile.status_text && (
                  <p className="rounded-md bg-muted px-2.5 py-1.5 text-sm leading-relaxed">{profile.status_text}</p>
                )}
                {(profile.company || profile.bio) && (
                  <dl className="flex flex-col gap-2 text-sm">
                    {profile.company && (
                      <div>
                        <dt className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Building at</dt>
                        <dd>{profile.company}</dd>
                      </div>
                    )}
                    {profile.bio && (
                      <div>
                        <dt className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Working on</dt>
                        <dd className="leading-relaxed text-pretty">{profile.bio}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {self && !profile.company && !profile.bio && (
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      setSettingsOpen(true)
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md border border-dashed px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">Add what you&apos;re building</span>
                      <span className="text-xs text-muted-foreground">Helps the right people find you.</span>
                    </span>
                  </button>
                )}
                {profile.links && profile.links.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {profile.links.map((href) => (
                      <li key={href} className="min-w-0">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer nofollow ugc"
                          className="inline-flex max-w-full items-center gap-1.5 rounded text-foreground/90 underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{linkLabel(href)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <MemberPlaces personId={profile.id} self={self} onNavigate={close} />
                {member && (
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
                {self ? (
                  <Button
                    onClick={() => {
                      close()
                      setSettingsOpen(true)
                    }}
                  >
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (await setBlocked(userId, profile.id, !isBlocked)) {
                          refreshBlocks()
                          refreshChannels()
                          toast.message(isBlocked ? `Unblocked ${profile.display_name}` : `Blocked ${profile.display_name}`, {
                            description: isBlocked ? undefined : "They can't message you, and their channel messages are hidden for you.",
                          })
                        }
                      }}
                    >
                      {isBlocked ? 'Unblock' : 'Block'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
                      Report
                    </Button>
                    {isAdmin && member?.role !== 'admin' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        onClick={async () => {
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
                        }}
                      >
                        Remove from community
                      </Button>
                    )}
                  </>
                )}
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
