'use client'

import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCabal } from './store'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import { fullTime } from '@/lib/time'

type Report = {
  id: string
  reporter_id: string
  reported_user_id: string | null
  message_excerpt: string | null
  reason: string
  created_at: string
}

// Deliberately small: open reports, banning, and the join policy.
export function AdminPanel() {
  const { community, profileById, refreshMembers } = useCabal()
  const supabase = createClient()

  const policy = useSWR(['policy', community.id], async () => {
    const { data } = await supabase.from('communities').select('join_policy').eq('id', community.id).single()
    return (data?.join_policy ?? community.join_policy) as 'open' | 'invite'
  })

  const reports = useSWR(['reports', community.id], async () => {
    const { data, error } = await supabase
      .from('reports')
      .select('id, reporter_id, reported_user_id, message_excerpt, reason, created_at')
      .eq('community_id', community.id)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data as Report[]
  })

  async function call(fn: () => PromiseLike<{ error: unknown }>, done: string) {
    const { error } = await fn()
    if (error) toast.error(friendlyError(error))
    else toast.success(done)
  }

  return (
    <div className="flex flex-col gap-5 border-t pt-5">
      <h3 className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Admin</h3>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Who can join</p>
        <div className="flex flex-wrap gap-2">
          {(['open', 'invite'] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={policy.data === p ? 'default' : 'secondary'}
              onClick={() =>
                call(
                  () => supabase.rpc('set_join_policy', { p_community: community.id, p_policy: p }),
                  p === 'open' ? 'Anyone can join now' : 'Invite-only now',
                ).then(() => policy.mutate())
              }
            >
              {p === 'open' ? 'Anyone with the app' : 'Invite link only'}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              call(() => supabase.rpc('rotate_invite_code', { p_community: community.id }), 'Old invite links no longer work')
            }
          >
            Reset invite link
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Open reports · {reports.data?.length ?? 0}</p>
        {reports.data?.length === 0 && <p className="text-xs text-muted-foreground">Nothing to review.</p>}
        <ul className="flex flex-col gap-2">
          {reports.data?.map((r) => {
            const target = profileById(r.reported_user_id)
            const reporter = profileById(r.reporter_id)
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {reporter?.display_name ?? 'Someone'} reported {target?.display_name ?? 'a member'} · {fullTime(r.created_at)}
                </p>
                <p className="leading-relaxed">{r.reason}</p>
                {r.message_excerpt && (
                  <blockquote className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{r.message_excerpt}</blockquote>
                )}
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() =>
                      call(() => supabase.rpc('resolve_report', { p_report: r.id }), 'Marked resolved').then(() => reports.mutate())
                    }
                  >
                    Resolve
                  </Button>
                  {r.reported_user_id && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${target?.display_name ?? 'this member'} from the community?`)) return
                        await call(
                          () =>
                            supabase.rpc('set_member_banned', {
                              p_community: community.id,
                              p_user: r.reported_user_id,
                              p_banned: true,
                            }),
                          'Member removed',
                        )
                        await supabase.rpc('resolve_report', { p_report: r.id })
                        reports.mutate()
                        refreshMembers()
                      }}
                    >
                      Remove member
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
