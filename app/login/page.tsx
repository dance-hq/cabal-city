import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { getCommunity } from '@/lib/community'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : '/onboarding')

  const community = await getCommunity()
  return (
    <AuthShell>
      <LoginForm communityName={community?.name ?? 'Cabal'} invite={invite} />
    </AuthShell>
  )
}
