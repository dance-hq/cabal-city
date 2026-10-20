import { createHmac } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { config } from '@/lib/config'
import { sendSignInCode } from '@/lib/email'

// Step 1 of sign-in: email a short code. The code is checked by Supabase
// Auth itself (verifyOtp) in the browser or desktop window, so no email links
// have to bounce between a system browser and the app.

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  invite: z.string().trim().max(64).optional(),
})

const PER_EMAIL = { count: 5, minutes: 15 }
const PER_IP = { count: 30, minutes: 60 }

function hash(value: string) {
  return createHmac('sha256', process.env.SUPABASE_JWT_SECRET ?? 'cabal').update(value).digest('hex')
}

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }
  const { email, invite } = parsed.data
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const emailHash = hash(email)
  const ipHash = hash(ip)

  const admin = createAdminClient()

  const since = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  const [byEmail, byIp] = await Promise.all([
    admin
      .from('auth_code_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email_hash', emailHash)
      .gte('created_at', since(PER_EMAIL.minutes)),
    admin
      .from('auth_code_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since(PER_IP.minutes)),
  ])
  if ((byEmail.count ?? 0) >= PER_EMAIL.count || (byIp.count ?? 0) >= PER_IP.count) {
    return NextResponse.json({ error: 'Too many codes requested. Wait a few minutes and try again.' }, { status: 429 })
  }
  await admin.from('auth_code_requests').insert({ email_hash: emailHash, ip_hash: ipHash })
  // Rate limiting only looks back an hour; nothing older needs keeping.
  await admin.from('auth_code_requests').delete().lt('created_at', since(24 * 60))

  // New accounts on an invite-only community need the current invite code.
  const { data: community } = await admin
    .from('communities')
    .select('join_policy, invite_code')
    .eq('slug', config.communitySlug)
    .maybeSingle()

  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  const isNew = !created.error
  if (created.error && created.error.code !== 'email_exists') {
    console.error('[cabal] createUser failed', created.error.message)
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }
  if (isNew && community?.join_policy === 'invite' && invite !== community.invite_code) {
    await admin.auth.admin.deleteUser(created.data.user!.id)
    return NextResponse.json(
      { error: 'This community is invite-only. Open the invite link a member sent you.' },
      { status: 403 },
    )
  }

  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const code = link.data?.properties?.email_otp
  if (link.error || !code) {
    console.error('[cabal] generateLink failed', link.error?.message)
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
  }

  const delivery = await sendSignInCode(email, code)
  if (delivery === 'unconfigured') {
    return NextResponse.json(
      { error: "Email sign-in isn't set up on this server yet (RESEND_API_KEY is missing)." },
      { status: 503 },
    )
  }
  if (delivery === 'failed') {
    return NextResponse.json({ error: "We couldn't send the email. Try again in a minute." }, { status: 502 })
  }

  return NextResponse.json({ ok: true, length: code.length, devLog: delivery === 'console' })
}
