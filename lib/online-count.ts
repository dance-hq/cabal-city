import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRESENCE_TTL_MS } from '@/lib/config'

// A number only: how many people are connected right now. No names leave
// the server. Invisible users have no presence rows, so they're not counted.
export async function onlineCount(communityId: string): Promise<number | null> {
  try {
    const since = new Date(Date.now() - PRESENCE_TTL_MS).toISOString()
    const { data, error } = await createAdminClient()
      .from('presence_sessions')
      .select('user_id')
      .eq('community_id', communityId)
      .gte('last_seen', since)
    if (error) return null
    return new Set((data ?? []).map((r) => r.user_id)).size
  } catch {
    return null
  }
}
