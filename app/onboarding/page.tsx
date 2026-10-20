import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { OnboardingForm } from '@/components/auth/onboarding-form'
import { getCommunity } from '@/lib/community'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Welcome' }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const community = await getCommunity()
  if (!community) {
    return (
      <AuthShell>
        <h1 className="text-xl font-semibold">No community configured</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This server has no community matching NEXT_PUBLIC_CABAL_COMMUNITY. Run{' '}
          <code className="font-mono">supabase/seed.sql</code> or check the setting.
        </p>
      </AuthShell>
    )
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('username, display_name, company, bio, avatar_url').eq('id', user.id).single(),
    supabase
      .from('community_members')
      .select('banned_at')
      .eq('community_id', community.id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (membership?.banned_at) {
    return (
      <AuthShell>
        <h1 className="text-xl font-semibold">You no longer have access</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An administrator removed this account from {community.name}.
        </p>
      </AuthShell>
    )
  }
  if (membership && profile?.username && profile.display_name) redirect('/app')

  const suggested = (user.email ?? '').split('@')[0].replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)

  return (
    <AuthShell>
      <OnboardingForm
        userId={user.id}
        communitySlug={community.slug}
        communityName={community.name}
        invite={invite}
        initial={{
          display_name: profile?.display_name ?? '',
          username: profile?.username ?? (suggested.length >= 2 ? suggested : ''),
          company: profile?.company ?? '',
          bio: profile?.bio ?? '',
          avatar_url: profile?.avatar_url ?? null,
        }}
      />
    </AuthShell>
  )
}
