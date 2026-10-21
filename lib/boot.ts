import 'server-only'
import { redirect } from 'next/navigation'
import type { Boot } from '@/components/cabal/store'
import { getCommunity } from '@/lib/community'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Settings } from '@/lib/types'

// Everything the signed-in app needs on first paint. Anyone who isn't fully
// set up is sent to sign in or onboarding instead.
export async function loadBoot(): Promise<Boot> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const community = await getCommunity()
  if (!community) redirect('/onboarding')

  const [{ data: profile }, { data: settings }, { data: membership }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, company, bio, status_text, identity, links')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_settings')
      .select('availability, notify_dms, notify_mentions, notify_sound')
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('community_members')
      .select('role, banned_at')
      .eq('community_id', community.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!profile?.username || !profile.display_name || !membership || membership.banned_at || !settings) {
    redirect('/onboarding')
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    profile: profile as Profile,
    settings: settings as Settings,
    community,
    role: membership.role as 'member' | 'admin',
  }
}
