import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/cabal/app-shell'
import { getCommunity } from '@/lib/community'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Settings } from '@/lib/types'

export const metadata: Metadata = { title: 'Cabal' }

export default async function AppPage() {
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
      .select('id, username, display_name, avatar_url, company, bio, status_text')
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

  return (
    <AppShell
      boot={{
        userId: user.id,
        email: user.email ?? '',
        profile: profile as Profile,
        settings: settings as Settings,
        community,
        role: membership.role as 'member' | 'admin',
      }}
    />
  )
}
