import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Grants the admin role to people listed in CABAL_ADMIN_EMAILS. This is the
// only way anyone becomes an admin: the list lives in server configuration,
// so the first person to sign up gets no special powers.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admins = (process.env.CABAL_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (!admins.includes(user.email.toLowerCase())) return NextResponse.json({ admin: false })

  const admin = createAdminClient()
  const { error } = await admin
    .from('community_members')
    .update({ role: 'admin' })
    .eq('user_id', user.id)
    .is('banned_at', null)
  if (error) {
    console.error('[cabal] admin bootstrap failed', error.message)
    return NextResponse.json({ error: 'Could not update role' }, { status: 500 })
  }
  return NextResponse.json({ admin: true })
}
