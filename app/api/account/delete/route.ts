import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Permanently deletes the signed-in person: their photo, every message they
// wrote, and their account. Teams they own pass to the longest-standing other
// member; teams with nobody else in them are deleted.

const body = z.object({ confirm: z.string().trim().min(1).max(254) })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = body.safeParse(await request.json().catch(() => null))
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle()
  const expected = (profile?.username ?? user.email ?? '').toLowerCase()
  if (!parsed.success || !expected || parsed.data.confirm.toLowerCase() !== expected) {
    return NextResponse.json({ error: 'Type your username exactly to confirm.' }, { status: 400 })
  }

  try {
    const { data: files } = await admin.storage.from('avatars').list(user.id, { limit: 100 })
    if (files?.length) {
      await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))
    }

    // Photos and videos they shared, before their messages (and the rows naming them) go.
    const { data: shared } = await admin.from('message_files').select('path').eq('author_id', user.id)
    const paths = (shared ?? []).map((f) => f.path as string)
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from('attachments').remove(paths.slice(i, i + 100))
    }

    const { error: messagesError } = await admin.from('messages').delete().eq('author_id', user.id)
    if (messagesError) throw messagesError

    const { data: owned } = await admin.from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'owner')
    for (const { team_id } of owned ?? []) {
      const { data: next } = await admin
        .from('team_members')
        .select('user_id')
        .eq('team_id', team_id)
        .neq('user_id', user.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (next) {
        await admin.from('team_members').update({ role: 'owner' }).eq('team_id', team_id).eq('user_id', next.user_id)
      } else {
        await admin.from('teams').delete().eq('id', team_id)
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
  } catch (err) {
    console.error('[cabal] account deletion failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "We couldn't delete your account. Try again in a minute." }, { status: 500 })
  }

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
