import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextOf, fromBase64, isEnvelope, openWithMessageKey } from '@/lib/e2ee/crypto'
import { unpackPreview } from '@/lib/long-text'
import { crossSiteResponse, isCrossSite } from '@/lib/same-origin'

const body = z.object({
  message: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  // The key for this one message only (32 bytes). It can't open any other.
  key: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
})

// Only the two people in a direct message can read it. To report one, the
// reporter's app hands over the key for that single message. We check it
// really opens the message as stored, so a report can't put words in anyone's
// mouth, and only then file it with the text for the admins.
export async function POST(request: NextRequest) {
  if (isCrossSite(request.headers)) return crossSiteResponse()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to report a message.' }, { status: 401 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say what’s wrong with the message.' }, { status: 400 })
  const { message, reason, key } = parsed.data

  // Read as the reporter, so it's only found if they're in the conversation.
  const { data: m } = await supabase
    .from('messages')
    .select('id, channel_id, author_id, sealed, long_text, deleted_at')
    .eq('id', message)
    .maybeSingle()
  if (!m || !isEnvelope(m.sealed) || m.deleted_at || m.author_id === user.id) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  }

  let text: string
  try {
    text = await openWithMessageKey(fromBase64(key), contextOf(m, m.sealed), m.sealed)
    // A long message's sealed part is its preview; the report carries that start of it.
    if (m.long_text) {
      const preview = unpackPreview(text)
      if (!preview) throw new Error('Bad preview')
      text = preview.preview
    }
  } catch {
    return NextResponse.json({ error: 'That message couldn’t be checked, so it wasn’t reported.' }, { status: 400 })
  }

  const { error } = await createAdminClient().rpc('report_sealed_message', {
    p_reporter: user.id,
    p_message: m.id,
    p_reason: reason,
    p_excerpt: text,
  })
  if (error) {
    const limited = error.code === 'P0429'
    if (!limited) console.error('[cabal] sealed report', error.message)
    return NextResponse.json({ error: limited ? error.message : 'Couldn’t send the report. Try again.' }, { status: limited ? 429 : 500 })
  }
  return NextResponse.json({ ok: true })
}
