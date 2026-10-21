import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// TEMPORARY local browser check. Delete before committing.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse('Not found', { status: 404 })
  const email = 'cabal-session-check@example.com'
  const admin = createAdminClient()
  await admin.auth.admin.createUser({ email, email_confirm: true })
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) return NextResponse.json({ error: link.error.message }, { status: 500 })
  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: 'email' })
  if (error || !data.user) return NextResponse.json({ error: error?.message }, { status: 500 })
  await supabase.from('profiles').update({ display_name: 'Sam Check', username: 'sam_check_tmp' }).eq('id', data.user.id)
  await supabase.rpc('join_community', { p_slug: process.env.NEXT_PUBLIC_CABAL_COMMUNITY ?? 'chicago', p_code: null })
  return NextResponse.redirect(new URL('/app', request.url))
}
