import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFeedbackEmail } from '@/lib/email'
import { crossSiteResponse, isCrossSite } from '@/lib/same-origin'

const short = z.string().trim().max(300)

const body = z.object({
  community: z.string().uuid(),
  kind: z.enum(['bug', 'idea']),
  body: z.string().trim().min(1).max(2000),
  context: z
    .object({
      page: short,
      app: short,
      build: short,
      browser: short,
      screen: short,
    })
    .partial()
    .optional(),
})

const PER_HOUR = 10

export async function POST(request: NextRequest) {
  if (isCrossSite(request.headers)) return crossSiteResponse()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to send feedback.' }, { status: 401 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write a little about what happened.' }, { status: 400 })
  const { community, kind, body: text, context = {} } = parsed.data

  // Runs as the signer, so it's only true for active members of that community.
  const { data: member } = await supabase.rpc('is_member', { cid: community })
  if (!member) return NextResponse.json({ error: "You're not in this community." }, { status: 403 })

  const admin = createAdminClient()
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gte('created_at', since)
  if ((count ?? 0) >= PER_HOUR) {
    return NextResponse.json({ error: 'That’s a lot of feedback for one hour. Try again a bit later.' }, { status: 429 })
  }

  const details = Object.fromEntries(Object.entries(context).filter(([, v]) => v)) as Record<string, string>
  const { error } = await admin
    .from('feedback')
    .insert({ community_id: community, author_id: user.id, kind, body: text, context: details })
  if (error) {
    console.error('[cabal] feedback insert failed', error.message)
    return NextResponse.json({ error: 'Couldn’t send that. Try again in a moment.' }, { status: 500 })
  }

  // Saved either way; the email is only a heads-up for the admins.
  const { data: profile } = await admin.from('profiles').select('display_name, username').eq('id', user.id).maybeSingle()
  await sendFeedbackEmail({
    kind,
    body: text,
    name: profile?.display_name || 'Someone',
    username: profile?.username ?? null,
    email: user.email ?? null,
    context: details,
  }).catch((e) => console.error('[cabal] feedback email failed', e))

  return NextResponse.json({ ok: true })
}
