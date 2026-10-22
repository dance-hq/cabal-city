// Runs against a real Supabase project (yours, or CI's). Skipped unless
// NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are set. Creates throwaway users and removes them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  commitmentOf,
  contextOf,
  conversationKey,
  exportPublicKey,
  lockWithRecoveryKey,
  newDeviceOffer,
  newKeyPair,
  newRecoveryKey,
  openFile,
  openFileMeta,
  openLongText,
  openMessage,
  packKeyring,
  sealFile,
  sealLongText,
  sealMessage,
} from '@/lib/e2ee/crypto'
import { charCount, longBody, packPreview, previewOf, unpackPreview } from '@/lib/long-text'
import { attachmentPath } from '@/lib/attachments'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const run = Boolean(url && anon && service)

type Person = { id: string; email: string; db: SupabaseClient; username: string }

const tag = Math.random().toString(36).slice(2, 8)
// A throwaway community, so test people never show up in a real one.
const slug = `cabal-test-${tag}`
const admin = run ? createClient(url!, service!, { auth: { persistSession: false } }) : (null as never)
const people: Person[] = []
const uploads: string[] = []
let communityId = ''

async function person(name: string): Promise<Person> {
  const email = `cabal-test-${name}-${tag}@example.com`
  const created = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (created.error) throw created.error
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw link.error
  const db = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await db.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: 'email' })
  if (error) throw error
  const username = `t_${name}_${tag}`
  const p = { id: created.data.user.id, email, db, username }
  people.push(p)
  return p
}

async function join(p: Person, displayName: string) {
  const { error: e1 } = await p.db.from('profiles').update({ display_name: displayName, username: p.username }).eq('id', p.id)
  if (e1) throw e1
  const { data, error: e2 } = await p.db.rpc('join_community', { p_slug: slug, p_code: null })
  if (e2) throw e2
  communityId = data as string
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Direct messages are end-to-end encrypted: each test person gets a key pair,
// and DMs are sealed exactly the way the app does it.
type Keys = { id: string; pair: CryptoKeyPair; publicKey: string }
const keys = new Map<string, Keys>()

async function publishKey(p: Person) {
  const pair = await newKeyPair()
  const publicKey = await exportPublicKey(pair.publicKey)
  const id = crypto.randomUUID()
  const backup = await lockWithRecoveryKey(await packKeyring([{ id, privateKey: pair.privateKey, publicKey }]), newRecoveryKey(), p.id)
  const { error } = await p.db.rpc('e2ee_publish_key', {
    p_id: id,
    p_public_key: publicKey,
    p_backup_iv: backup.iv,
    p_backup: backup.keyring,
    p_replace: false,
  })
  if (error) throw error
  keys.set(p.id, { id, pair, publicKey })
}

async function sealedRow(from: Person, to: Person, channelId: string, text: string, over: { rk?: string } = {}) {
  const mine = keys.get(from.id)!
  const theirs = keys.get(to.id)!
  const id = crypto.randomUUID()
  const ctx = { channelId, messageId: id, authorId: from.id, sk: mine.id, rk: over.rk ?? theirs.id }
  const sealed = await sealMessage(await conversationKey(mine.pair.privateKey, theirs.pair.publicKey), ctx, text)
  return { id, channel_id: channelId, author_id: from.id, body: '', sealed }
}

describe.skipIf(!run)('permissions and messaging (live database)', () => {
  let ada: Person, grace: Person, outsider: Person
  let dmId = ''
  let teamId = ''
  let teamChannelId = ''

  beforeAll(async () => {
    const { data: c, error } = await admin
      .from('communities')
      .insert({ slug, name: `Cabal test ${tag}`, join_policy: 'open' })
      .select('id')
      .single()
    if (error) throw error
    const { error: roomError } = await admin
      .from('channels')
      .insert({ community_id: c.id, kind: 'room', slug: 'lobby', name: 'lobby', position: 0 })
    if (roomError) throw roomError
    ;[ada, grace, outsider] = await Promise.all([person('ada'), person('grace'), person('out')])
    await join(ada, 'Ada Test')
    await join(grace, 'Grace Test')
    await join(outsider, 'Outsider Test')
    await Promise.all([publishKey(ada), publishKey(grace)])
  })

  afterAll(async () => {
    if (uploads.length) await admin.storage.from('attachments').remove(uploads)
    // Rooms, teams, DMs, members and their messages all go with the community.
    await admin.from('communities').delete().eq('slug', slug)
    for (const p of people) {
      await admin.from('messages').delete().eq('author_id', p.id)
      await admin.auth.admin.deleteUser(p.id)
    }
  })

  it('cannot join without a finished profile', async () => {
    const blank = await person('blank')
    const { error } = await blank.db.rpc('join_community', { p_slug: slug, p_code: null })
    expect(error?.message).toMatch(/profile/i)
  })

  it('does not let members make themselves admin', async () => {
    const { data } = await grace.db
      .from('community_members')
      .update({ role: 'admin' })
      .eq('user_id', grace.id)
      .select()
    expect(data ?? []).toHaveLength(0)
    const { data: row } = await admin.from('community_members').select('role').eq('user_id', grace.id).single()
    expect(row?.role).toBe('member')
  })

  it('keeps feedback between its author and admins', async () => {
    const direct = await grace.db
      .from('feedback')
      .insert({ community_id: communityId, author_id: grace.id, kind: 'bug', body: 'direct' })
    expect(direct.error).not.toBeNull()

    const { data: row, error } = await admin
      .from('feedback')
      .insert({ community_id: communityId, author_id: grace.id, kind: 'bug', body: 'The send button jumps' })
      .select('id')
      .single()
    if (error) throw error

    const own = await grace.db.from('feedback').select('id').eq('id', row.id)
    expect(own.data).toHaveLength(1)
    const other = await ada.db.from('feedback').select('id').eq('id', row.id)
    expect(other.data ?? []).toHaveLength(0)

    const denied = await ada.db.rpc('resolve_feedback', { p_feedback: row.id })
    expect(denied.error?.message).toMatch(/admins only/i)

    await admin.from('community_members').update({ role: 'admin' }).eq('user_id', ada.id).eq('community_id', communityId)
    const seen = await ada.db.from('feedback').select('id').eq('id', row.id)
    expect(seen.data).toHaveLength(1)
    const resolved = await ada.db.rpc('resolve_feedback', { p_feedback: row.id })
    expect(resolved.error).toBeNull()
    const { data: after } = await admin.from('feedback').select('resolved_at, resolved_by').eq('id', row.id).single()
    expect(after?.resolved_by).toBe(ada.id)
    await admin.from('community_members').update({ role: 'member' }).eq('user_id', ada.id).eq('community_id', communityId)
  })

  it('keeps work sessions private, with one running at a time', async () => {
    const none = await grace.db.rpc('current_work_session')
    expect(none.error).toBeNull()
    expect(none.data).toBeNull()

    const first = await grace.db.rpc('start_work_session')
    expect(first.error).toBeNull()
    const second = await grace.db.rpc('start_work_session')
    expect(second.error).toBeNull()
    const current = await grace.db.rpc('current_work_session')
    expect(Date.parse(current.data)).toBe(Date.parse(second.data))

    const open = await admin.from('work_sessions').select('id').eq('user_id', grace.id).is('ended_at', null)
    expect(open.data).toHaveLength(1)
    const others = await ada.db.from('work_sessions').select('id').eq('user_id', grace.id)
    expect(others.data ?? []).toHaveLength(0)
    const direct = await grace.db.from('work_sessions').insert({ user_id: grace.id })
    expect(direct.error).not.toBeNull()

    const ended = await grace.db.rpc('end_work_session')
    expect(typeof ended.data).toBe('number')
    const again = await grace.db.rpc('end_work_session')
    expect(again.data).toBeNull()

    // A session whose app went quiet pauses where it stopped; one left paused
    // for over 12 hours is over.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    await admin.from('work_sessions').insert({
      user_id: grace.id,
      started_at: tenMinutesAgo,
      running_since: tenMinutesAgo,
      last_beat: tenMinutesAgo,
    })
    // Coming back picks it up on its own; the quiet stretch isn't counted.
    const quiet = await grace.db.rpc('my_lock_in')
    expect(quiet.data?.paused_at).toBeNull()
    expect(quiet.data?.worked_seconds).toBe(60)
    expect(quiet.data?.away_seconds).toBeGreaterThanOrEqual(530)

    // A pause you press yourself waits for you to Resume.
    await grace.db.rpc('pause_lock_in')
    const mine = await grace.db.rpc('my_lock_in')
    expect(mine.data?.paused_by).toBe('you')

    // Over 3 hours paused, it closes itself.
    await admin
      .from('work_sessions')
      .update({ paused_at: new Date(Date.now() - 4 * 3600_000).toISOString() })
      .eq('user_id', grace.id)
      .is('ended_at', null)
    const stale = await grace.db.rpc('my_lock_in')
    expect(stale.data).toBeNull()
  })

  it('pauses, resumes and shares a lock-in only with the community', async () => {
    const started = await grace.db.rpc('lock_in', { p_focus: '  the eval harness ', p_shared: true })
    expect(started.error).toBeNull()
    expect(started.data?.focus).toBe('the eval harness')

    const seen = await ada.db.rpc('community_lock_ins', { p_community: communityId })
    expect(seen.data?.map((r: { user_id: string; focus: string }) => [r.user_id, r.focus])).toContainEqual([
      grace.id,
      'the eval harness',
    ])
    // (The "outsider" joined this test community too, so ask about one they're not in.)
    const outsiderView = await outsider.db.rpc('community_lock_ins', { p_community: crypto.randomUUID() })
    expect(outsiderView.error).not.toBeNull()

    const paused = await grace.db.rpc('pause_lock_in')
    expect(paused.data?.paused_at).toBeTruthy()
    const hidden = await ada.db.rpc('community_lock_ins', { p_community: communityId })
    expect(hidden.data?.some((r: { user_id: string }) => r.user_id === grace.id)).toBe(false)

    const resumed = await grace.db.rpc('resume_lock_in')
    expect(resumed.data?.paused_at).toBeNull()
    const ended = await grace.db.rpc('end_work_session')
    expect(typeof ended.data).toBe('number')
  })

  it('never makes a second session, and closes a forgotten one at 8 hours', async () => {
    const [a, b] = await Promise.all([grace.db.rpc('lock_in'), grace.db.rpc('lock_in')])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    const open = await admin.from('work_sessions').select('id, started_at').eq('user_id', grace.id).is('ended_at', null)
    expect(open.data).toHaveLength(1)
    // Locking in again from another device keeps the same session.
    const again = await grace.db.rpc('lock_in')
    expect(again.data?.started_at).toBe(open.data![0].started_at)

    // Paused, Lock in picks it back up instead of starting over.
    await grace.db.rpc('pause_lock_in')
    const resumed = await grace.db.rpc('lock_in')
    expect(resumed.data?.paused_at).toBeNull()
    expect(resumed.data?.started_at).toBe(open.data![0].started_at)
    const done = await grace.db.rpc('finish_lock_in')
    expect(done.data?.id).toBe(open.data![0].id)
    expect(await grace.db.rpc('finish_lock_in')).toMatchObject({ data: null })

    // Left running for 9 hours (the app kept checking in): saved at 8.
    const nineHoursAgo = new Date(Date.now() - 9 * 3600_000).toISOString()
    const { data: forgotten } = await admin
      .from('work_sessions')
      .insert({ user_id: grace.id, started_at: nineHoursAgo, running_since: nineHoursAgo, last_beat: new Date().toISOString() })
      .select('id')
      .single()
    const after = await grace.db.rpc('my_lock_in')
    expect(after.data).toBeNull()
    const { data: saved } = await admin.from('work_sessions').select('worked_seconds, ended_at').eq('id', forgotten!.id).single()
    expect(saved?.worked_seconds).toBe(8 * 3600)
    expect(Date.parse(saved!.ended_at) - Date.parse(nineHoursAgo)).toBe(8 * 3600_000)
    await admin.from('work_sessions').delete().eq('id', forgotten!.id)
  })

  it('ranks finished hours by week for people who opted in, and keeps notes private', async () => {
    await admin.from('work_sessions').delete().in('user_id', [ada.id, grace.id])
    const first = await ada.db.rpc('lock_in_board', { p_community: communityId })
    expect(first.error).toBeNull()
    // The week starts Monday 00:00 in the community's time zone (Chicago).
    const weekStart = Date.parse(first.data.week_start)
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: first.data.time_zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(weekStart)
    expect(first.data.time_zone).toBe('America/Chicago')
    expect(local).toBe('Mon 00:00')
    expect([167, 168, 169]).toContain((Date.parse(first.data.week_end) - weekStart) / 3600_000)

    const end = Date.now() - 30_000
    const finished = (user: string, seconds: number, endedAt = end, note?: string) => ({
      user_id: user,
      started_at: new Date(endedAt - seconds * 1000).toISOString(),
      ended_at: new Date(endedAt).toISOString(),
      running_since: null,
      worked_seconds: seconds,
      note: note ?? null,
    })
    const { data: rows } = await admin
      .from('work_sessions')
      .insert([
        finished(grace.id, 7200, end, 'Shipped the eval harness'),
        finished(grace.id, 30, end - 3600_000), // under a minute: not counted
        finished(grace.id, 10800, weekStart - 3600_000), // last week
        finished(ada.id, 3600, end),
      ])
      .select('id, user_id')
    const graceSession = rows!.find((r) => r.user_id === grace.id)!.id

    // Nobody opted in yet: an empty board, but your own numbers are there.
    const empty = await ada.db.rpc('lock_in_board', { p_community: communityId })
    expect(empty.data.rows).toEqual([])
    expect(empty.data.joined).toBe(false)
    const mine = await grace.db.rpc('lock_in_stats', { p_community: communityId })
    expect(mine.data).toMatchObject({ week_seconds: 7200, all_seconds: 18000, sessions: 2, self: true, board: false })
    expect(mine.data.days.reduce((s: number, d: number) => s + d, 0)).toBe(7200)
    expect(mine.data.recent[0].note).toBe('Shipped the eval harness')
    // Not shared, so not visible to anyone else.
    expect((await ada.db.rpc('lock_in_stats', { p_community: communityId, p_user: grace.id })).data).toBeNull()

    // Opting in is your own setting; you can't flip it for someone else.
    expect((await grace.db.from('user_settings').update({ lock_in_board: true }).eq('user_id', grace.id)).error).toBeNull()
    await ada.db.from('user_settings').update({ lock_in_board: false }).eq('user_id', grace.id)
    const { data: graceSettings } = await admin.from('user_settings').select('lock_in_board').eq('user_id', grace.id).single()
    expect(graceSettings?.lock_in_board).toBe(true)

    const one = await ada.db.rpc('lock_in_board', { p_community: communityId })
    expect(one.data.rows).toEqual([{ user_id: grace.id, seconds: 7200, sessions: 1, rank: 1 }])

    await ada.db.from('user_settings').update({ lock_in_board: true }).eq('user_id', ada.id)
    const two = await grace.db.rpc('lock_in_board', { p_community: communityId })
    expect(two.data.joined).toBe(true)
    expect(two.data.rows.map((r: { user_id: string; rank: number }) => [r.user_id, r.rank])).toEqual([
      [grace.id, 1],
      [ada.id, 2],
    ])
    const lastWeek = await grace.db.rpc('lock_in_board', { p_community: communityId, p_weeks_ago: 1 })
    expect(lastWeek.data.rows).toEqual([{ user_id: grace.id, seconds: 10800, sessions: 1, rank: 1 }])

    // A running timer doesn't move the board.
    await ada.db.rpc('lock_in')
    const running = await grace.db.rpc('lock_in_board', { p_community: communityId })
    expect(running.data.rows.find((r: { user_id: string }) => r.user_id === ada.id).seconds).toBe(3600)
    await ada.db.rpc('finish_lock_in')

    // Shared numbers are visible to members, but never the sessions or notes.
    const shared = await ada.db.rpc('lock_in_stats', { p_community: communityId, p_user: grace.id })
    expect(shared.data).toMatchObject({ week_seconds: 7200, self: false })
    expect(shared.data.recent).toBeUndefined()

    // Notes: only on your own finished sessions.
    expect((await grace.db.rpc('note_lock_in', { p_session: graceSession, p_note: '  Fixed the flaky test ' })).error).toBeNull()
    expect((await ada.db.rpc('note_lock_in', { p_session: graceSession, p_note: 'mine now' })).error).not.toBeNull()
    const { data: noted } = await admin.from('work_sessions').select('note').eq('id', graceSession).single()
    expect(noted?.note).toBe('Fixed the flaky test')

    // Nobody can write hours directly.
    expect((await grace.db.from('work_sessions').update({ worked_seconds: 999_999 }).eq('id', graceSession)).error).not.toBeNull()
    const { data: untouched } = await admin.from('work_sessions').select('worked_seconds').eq('id', graceSession).single()
    expect(untouched?.worked_seconds).toBe(7200)

    // Nothing from a community you're not in.
    const elsewhere = crypto.randomUUID()
    expect((await grace.db.rpc('lock_in_board', { p_community: elsewhere })).error).not.toBeNull()
    expect((await ada.db.rpc('lock_in_stats', { p_community: elsewhere, p_user: grace.id })).error).not.toBeNull()

    // Leaving the board hides you again, and "Locked in now" follows its own setting.
    await ada.db.from('user_settings').update({ lock_in_board: false, lock_in_live: false }).eq('user_id', ada.id)
    expect((await grace.db.rpc('lock_in_stats', { p_community: communityId, p_user: ada.id })).data).toBeNull()
    await ada.db.rpc('lock_in')
    const now = await grace.db.rpc('community_lock_ins', { p_community: communityId })
    expect(now.data?.some((r: { user_id: string }) => r.user_id === ada.id)).toBe(false)
    await ada.db.rpc('finish_lock_in')
    await ada.db.from('user_settings').update({ lock_in_live: true }).eq('user_id', ada.id)
  })

  it('hides the invite code column from direct reads', async () => {
    const { error } = await grace.db.from('communities').select('invite_code').eq('slug', slug)
    expect(error).not.toBeNull()
  })

  it('sends a DM that only the two participants can read', async () => {
    const { data, error } = await ada.db.rpc('open_dm', { p_other: grace.id })
    expect(error).toBeNull()
    dmId = data as string

    const sent = await ada.db.from('messages').insert(await sealedRow(ada, grace, dmId, 'hi grace')).select('body').single()
    expect(sent.error).toBeNull()
    // The database never sees the words.
    expect(sent.data?.body).toBe('')

    const forGrace = await grace.db.from('messages').select('id, channel_id, author_id, body, sealed').eq('channel_id', dmId)
    expect(forGrace.data).toHaveLength(1)
    const m = forGrace.data![0]
    const g = keys.get(grace.id)!
    const a = keys.get(ada.id)!
    expect(JSON.stringify(m)).not.toContain('hi grace')
    expect(await openMessage(await conversationKey(g.pair.privateKey, a.pair.publicKey), contextOf(m, m.sealed), m.sealed)).toBe(
      'hi grace',
    )

    const forOutsider = await outsider.db.from('messages').select('body').eq('channel_id', dmId)
    expect(forOutsider.data).toEqual([])
    const outsiderPost = await outsider.db.from('messages').insert({ channel_id: dmId, author_id: outsider.id, body: 'x' })
    expect(outsiderPost.error).not.toBeNull()
  })

  it('tracks unread counts and read state per person', async () => {
    const before = await grace.db.rpc('my_channels', { p_community: communityId })
    expect((before.data as { id: string; unread: number }[]).find((c) => c.id === dmId)?.unread).toBe(1)
    await grace.db.rpc('mark_read', { p_channel: dmId })
    const after = await grace.db.rpc('my_channels', { p_community: communityId })
    expect((after.data as { id: string; unread: number }[]).find((c) => c.id === dmId)?.unread).toBe(0)
  })

  it('delivers a 22,000-character prompt in a DM whole, readable only by the two people', async () => {
    const prompt = ('# Review prompt\n\nKeep   every space.\n\n\n\n\tTabs, `code`, emoji 🚀\n').repeat(400).slice(0, 22_000)
    const text = longBody(prompt)
    const mine = keys.get(ada.id)!
    const theirs = keys.get(grace.id)!
    const id = crypto.randomUUID()
    const ctx = { channelId: dmId, messageId: id, authorId: ada.id, sk: mine.id, rk: theirs.id }
    const conversation = await conversationKey(mine.pair.privateKey, theirs.pair.publicKey)
    const sent = await ada.db
      .rpc('send_long_message', {
        p_id: id,
        p_channel: dmId,
        p_preview: '',
        p_preview_sealed: await sealMessage(conversation, ctx, packPreview(text)),
        p_chars: null,
        p_text: null,
        p_text_sealed: await sealLongText(conversation, ctx, text),
      })
      .select('id, long_text, long_chars, body')
      .single()
    expect(sent.error).toBeNull()
    // The server doesn't learn the words or the exact length.
    expect(sent.data).toMatchObject({ id, long_text: true, long_chars: null, body: '' })

    const row = await grace.db.from('messages').select('id, channel_id, author_id, sealed, long_text').eq('id', id).single()
    const full = await grace.db.from('message_texts').select('body, sealed').eq('message_id', id).single()
    expect(full.error).toBeNull()
    expect(JSON.stringify(full.data)).not.toContain('Review prompt')
    const back = await conversationKey(theirs.pair.privateKey, mine.pair.publicKey)
    const preview = unpackPreview(await openMessage(back, contextOf(row.data!, row.data!.sealed), row.data!.sealed))
    expect(preview?.chars).toBe(charCount(text))
    expect(await openLongText(back, contextOf(row.data!, row.data!.sealed), full.data!.sealed)).toBe(text)

    expect((await outsider.db.from('message_texts').select('message_id').eq('message_id', id)).data).toEqual([])

    // Deleting it deletes the full text too.
    expect((await ada.db.rpc('delete_message', { p_message: id })).error).toBeNull()
    expect((await admin.from('message_texts').select('message_id').eq('message_id', id)).data).toEqual([])
  })

  it('keeps a long room message exact, and refuses one without its whole text', async () => {
    const { data: lobby } = await admin.from('channels').select('id').eq('community_id', communityId).eq('slug', 'lobby').single()
    const text = longBody(`Spec\n\n${'line with  double  spaces\n'.repeat(3000)}`)
    const id = crypto.randomUUID()
    const sent = await grace.db
      .rpc('send_long_message', {
        p_id: id,
        p_channel: lobby!.id,
        p_preview: previewOf(text),
        p_preview_sealed: null,
        p_chars: charCount(text),
        p_text: text,
        p_text_sealed: null,
      })
      .select('long_text, long_chars')
      .single()
    expect(sent.error).toBeNull()
    expect(sent.data).toEqual({ long_text: true, long_chars: charCount(text) })
    const read = await ada.db.from('message_texts').select('body').eq('message_id', id).single()
    expect(read.data?.body).toBe(text)

    // Retrying the same send is a duplicate, not a second copy.
    const retry = await grace.db.rpc('send_long_message', {
      p_id: id,
      p_channel: lobby!.id,
      p_preview: previewOf(text),
      p_preview_sealed: null,
      p_chars: charCount(text),
      p_text: text,
      p_text_sealed: null,
    })
    expect(retry.error?.code).toBe('23505')

    const orphan = await grace.db
      .from('messages')
      .insert({ channel_id: lobby!.id, author_id: grace.id, body: 'preview', long_text: true, long_chars: 10 })
    expect(orphan.error).not.toBeNull()
    const forged = await ada.db.from('message_texts').insert({ message_id: id, channel_id: lobby!.id, body: 'swapped' })
    expect(forged.error).not.toBeNull()
  })

  it('rejects spoofed authors and fake system messages', async () => {
    const spoof = await grace.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'i am ada' })
    expect(spoof.error).not.toBeNull()
    const system = await grace.db.from('messages').insert({ channel_id: dmId, author_id: grace.id, kind: 'system', body: 'official' })
    expect(system.error).not.toBeNull()
  })

  it('only accepts sealed messages addressed to the right two keys', async () => {
    const wrongKey = await sealedRow(ada, grace, dmId, 'hi', { rk: keys.get(ada.id)!.id })
    expect((await ada.db.from('messages').insert(wrongKey)).error?.code).toBe('P0409')

    const extra = await sealedRow(ada, grace, dmId, 'hi')
    const tampered = { ...extra, sealed: { ...extra.sealed, note: 'x' } }
    expect((await ada.db.from('messages').insert(tampered)).error).not.toBeNull()

    const { data: lobby } = await ada.db.from('channels').select('id').eq('community_id', communityId).eq('slug', 'lobby').single()
    const inRoom = await sealedRow(ada, grace, lobby!.id, 'hi')
    expect((await ada.db.from('messages').insert(inRoom)).error).not.toBeNull()

    // Sealed messages can only be reported through the route that checks them.
    const { data: sent } = await grace.db
      .from('messages')
      .select('id')
      .eq('channel_id', dmId)
      .not('sealed', 'is', null)
      .limit(1)
      .single()
    expect((await grace.db.rpc('report_message', { p_message: sent!.id, p_reason: 'test' })).error).not.toBeNull()
    const direct = await grace.db.rpc('report_sealed_message', {
      p_reporter: grace.id,
      p_message: sent!.id,
      p_reason: 'test',
      p_excerpt: 'made up',
    })
    expect(direct.error).not.toBeNull()
  })

  it('keeps keys, backups and unlock requests to their owner', async () => {
    // One key at a time; a second device can't quietly replace it.
    const pair = await newKeyPair()
    const second = await ada.db.rpc('e2ee_publish_key', {
      p_id: crypto.randomUUID(),
      p_public_key: await exportPublicKey(pair.publicKey),
      p_backup_iv: 'AAAAAAAAAAAAAAAA',
      p_backup: 'A'.repeat(40),
      p_replace: false,
    })
    expect(second.error?.code).toBe('P0409')

    expect((await ada.db.from('e2ee_backups').select('user_id')).data).toEqual([{ user_id: ada.id }])
    expect((await grace.db.from('e2ee_backups').select('user_id').eq('user_id', ada.id)).data).toEqual([])
    expect((await outsider.db.from('e2ee_keys').select('id').eq('user_id', ada.id)).data).toHaveLength(1)

    const offer = await newDeviceOffer()
    const req = await ada.db.rpc('e2ee_request_device', {
      p_label: 'Test browser',
      p_key: offer.publicKey,
      p_commitment: await commitmentOf(offer.nonce),
    })
    expect(req.error).toBeNull()
    expect((await grace.db.from('e2ee_device_requests').select('id')).data).toEqual([])

    // The new device can only reveal the nonce it committed to.
    const approver = await newDeviceOffer()
    expect((await ada.db.rpc('e2ee_claim_device', { p_request: req.data, p_key: approver.publicKey, p_nonce: approver.nonce })).error).toBeNull()
    expect((await ada.db.rpc('e2ee_reveal_device', { p_request: req.data, p_nonce: approver.nonce })).error).not.toBeNull()
    expect((await ada.db.rpc('e2ee_reveal_device', { p_request: req.data, p_nonce: offer.nonce })).error).toBeNull()
    await ada.db.from('e2ee_device_requests').delete().eq('id', req.data)
  })

  it('refuses plain direct messages once encryption is required', async ({ skip }) => {
    // Enforced by 0018, which goes live after the app that encrypts DMs.
    const { data: applied } = await admin.from('cabal_migrations').select('name').eq('name', '0018_require_encrypted_dms.sql')
    if (!applied?.length) skip()
    const plain = await ada.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'in the clear' })
    expect(plain.error).not.toBeNull()
  })

  it('keeps private team messages away from non-members, including realtime', async () => {
    const created = await ada.db.rpc('create_team', {
      p_community: communityId,
      p_name: `Test Team ${tag}`,
      p_visibility: 'private',
    })
    expect(created.error).toBeNull()
    teamId = created.data as string
    const { data: ch } = await ada.db.from('channels').select('id').eq('team_id', teamId).single()
    teamChannelId = ch!.id

    // Outsider listens to every message insert it is allowed to see.
    const received: string[] = []
    const listener = outsider.db
      .channel(`test-${tag}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        received.push((p.new as { body: string }).body)
      })
    await new Promise<void>((resolve) => listener.subscribe((s) => s === 'SUBSCRIBED' && resolve()))

    // And tries to join the team's private typing channel.
    await outsider.db.realtime.setAuth()
    const typingStatus = await new Promise<string>((resolve) => {
      outsider.db
        .channel(`chan:${teamChannelId}`, { config: { private: true } })
        .subscribe((s) => (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' ? resolve(s) : undefined))
      setTimeout(() => resolve('TIMEOUT'), 10_000)
    })
    expect(typingStatus).not.toBe('SUBSCRIBED')

    const secret = `secret plan ${tag}`
    expect((await ada.db.from('messages').insert({ channel_id: teamChannelId, author_id: ada.id, body: secret })).error).toBeNull()
    await wait(3000)

    expect(received).not.toContain(secret)
    expect((await outsider.db.from('messages').select('id').eq('channel_id', teamChannelId)).data).toEqual([])
    expect((await outsider.db.from('teams').select('id').eq('id', teamId)).data).toEqual([])
    expect((await outsider.db.from('channels').select('id').eq('id', teamChannelId)).data).toEqual([])
    expect((await outsider.db.from('team_members').select('user_id').eq('team_id', teamId)).data).toEqual([])
    expect((await outsider.db.rpc('invite_to_team', { p_team: teamId, p_user: outsider.id })).error).not.toBeNull()
    expect((await outsider.db.rpc('mark_read', { p_channel: teamChannelId })).error).not.toBeNull()

    // Invite-only rooms don't show up in the directory and can't be joined.
    const listed = await outsider.db.rpc('community_teams', { p_community: communityId })
    expect((listed.data as { id: string }[]).map((t) => t.id)).not.toContain(teamId)
    expect((await outsider.db.rpc('join_team', { p_team: teamId })).error?.message).toMatch(/not found/i)

    await outsider.db.removeAllChannels()
  })

  it('lets anyone in the community find and join an open team room', async () => {
    const created = await ada.db.rpc('create_team', {
      p_community: communityId,
      p_name: `Open Team ${tag}`,
      p_visibility: 'public',
    })
    expect(created.error).toBeNull()
    const openTeam = created.data as string
    const { data: ch } = await ada.db.from('channels').select('id').eq('team_id', openTeam).single()
    const hello = `building in public ${tag}`
    expect((await ada.db.from('messages').insert({ channel_id: ch!.id, author_id: ada.id, body: hello })).error).toBeNull()

    // Listed for everyone, but you join before you read or post.
    const listed = await outsider.db.rpc('community_teams', { p_community: communityId })
    const entry = (listed.data as { id: string; joined: boolean; member_count: number }[]).find((t) => t.id === openTeam)
    expect(entry).toMatchObject({ joined: false, member_count: 1 })
    expect((await outsider.db.from('messages').select('id').eq('channel_id', ch!.id)).data).toEqual([])
    expect((await outsider.db.from('messages').insert({ channel_id: ch!.id, author_id: outsider.id, body: 'x' })).error).not.toBeNull()

    const joined = await outsider.db.rpc('join_team', { p_team: openTeam })
    expect(joined.error).toBeNull()
    expect(joined.data).toBe(ch!.id)
    const history = await outsider.db.from('messages').select('body').eq('channel_id', ch!.id)
    expect(history.data?.map((m) => m.body)).toContain(hello)
    expect((await outsider.db.from('messages').insert({ channel_id: ch!.id, author_id: outsider.id, body: 'hi all' })).error).toBeNull()
    // Joining twice is harmless and doesn't post a second notice.
    expect((await outsider.db.rpc('join_team', { p_team: openTeam })).error).toBeNull()
    const notices = await ada.db.from('messages').select('body').eq('channel_id', ch!.id).eq('kind', 'system').like('body', '%joined.')
    expect(notices.data).toHaveLength(1)

    // Only owners decide who can join. Going invite-only keeps current members.
    expect((await outsider.db.rpc('set_team_visibility', { p_team: openTeam, p_visibility: 'private' })).error).not.toBeNull()
    expect((await ada.db.rpc('set_team_visibility', { p_team: openTeam, p_visibility: 'private' })).error).toBeNull()
    expect((await grace.db.rpc('join_team', { p_team: openTeam })).error).not.toBeNull()
    expect((await outsider.db.from('messages').select('id').eq('channel_id', ch!.id)).data?.length).toBeGreaterThan(0)

    // Leaving takes away access again.
    expect((await outsider.db.rpc('remove_team_member', { p_team: openTeam, p_user: outsider.id })).error).toBeNull()
    expect((await outsider.db.from('messages').select('id').eq('channel_id', ch!.id)).data).toEqual([])
  })

  it('lets an invited member join and talk, and owners remove them', async () => {
    expect((await ada.db.rpc('invite_to_team', { p_team: teamId, p_user: grace.id })).error).toBeNull()
    const { data: invite } = await grace.db.from('team_invites').select('id, team:teams(name)').eq('team_id', teamId).single()
    expect((invite as unknown as { team: { name: string } }).team.name).toContain('Test Team')

    expect((await grace.db.rpc('respond_team_invite', { p_invite: invite!.id, p_accept: true })).error).toBeNull()
    const read = await grace.db.from('messages').select('body').eq('channel_id', teamChannelId)
    expect(read.data?.some((m) => m.body.startsWith('secret plan'))).toBe(true)
    expect((await grace.db.from('messages').insert({ channel_id: teamChannelId, author_id: grace.id, body: 'on it' })).error).toBeNull()

    // A member can't remove the owner; the owner can remove the member.
    expect((await grace.db.rpc('remove_team_member', { p_team: teamId, p_user: ada.id })).error).not.toBeNull()
    expect((await ada.db.rpc('remove_team_member', { p_team: teamId, p_user: grace.id })).error).toBeNull()
    expect((await grace.db.from('messages').select('id').eq('channel_id', teamChannelId)).data).toEqual([])
  })

  it('shows availability, hides invisible people, and stamps presence on the server', async () => {
    const session = crypto.randomUUID()
    await grace.db.rpc('set_availability', { p_availability: 'away' })
    expect((await grace.db.rpc('presence_heartbeat', { p_session: session, p_community: communityId })).error).toBeNull()

    const seen = await ada.db.from('presence_sessions').select('availability, last_seen').eq('user_id', grace.id)
    expect(seen.data?.[0]?.availability).toBe('away')
    expect(Math.abs(Date.now() - Date.parse(seen.data![0].last_seen))).toBeLessThan(60_000)

    // Clients can't write presence rows directly (e.g. to stay "online" forever).
    const forged = await grace.db.from('presence_sessions').insert({
      id: crypto.randomUUID(),
      user_id: grace.id,
      community_id: communityId,
      availability: 'online',
      last_seen: '2099-01-01T00:00:00Z',
    })
    expect(forged.error).not.toBeNull()

    await grace.db.rpc('set_availability', { p_availability: 'invisible' })
    await grace.db.rpc('presence_heartbeat', { p_session: session, p_community: communityId })
    expect((await ada.db.from('presence_sessions').select('id').eq('user_id', grace.id)).data).toEqual([])

    await grace.db.rpc('set_availability', { p_availability: 'online' })
    await grace.db.rpc('presence_heartbeat', { p_session: session, p_community: communityId })
    await grace.db.rpc('presence_leave', { p_session: session })
    expect((await ada.db.from('presence_sessions').select('id').eq('user_id', grace.id)).data).toEqual([])
  })

  it('shares a photo in a room only once a message claims it, and stops when it is deleted', async () => {
    const { data: lobby } = await grace.db.from('channels').select('id').eq('community_id', communityId).eq('slug', 'lobby').single()
    const id = crypto.randomUUID()
    const fileId = crypto.randomUUID()
    const path = attachmentPath(lobby!.id, id, fileId)
    uploads.push(path)
    const photo = new Blob([crypto.getRandomValues(new Uint8Array(2048))], { type: 'image/png' })
    expect((await grace.db.storage.from('attachments').upload(path, photo, { contentType: 'image/png' })).error).toBeNull()

    // Nobody else can read it until a message claims it.
    expect((await ada.db.storage.from('attachments').createSignedUrl(path, 60)).error).not.toBeNull()

    // A message can't claim files that never arrived.
    const missing = await grace.db.rpc('send_message_with_files', {
      p_id: crypto.randomUUID(),
      p_channel: lobby!.id,
      p_body: 'look',
      p_sealed: null,
      p_files: [{ id: crypto.randomUUID(), path: `${lobby!.id}/x/y`, kind: 'image', mime: 'image/png', name: 'a.png' }],
    })
    expect(missing.error).not.toBeNull()
    // Nor can a plain insert say it has files.
    expect((await grace.db.from('messages').insert({ channel_id: lobby!.id, author_id: grace.id, body: 'hi', files: 1 })).error).not.toBeNull()

    const sent = await grace.db
      .rpc('send_message_with_files', {
        p_id: id,
        p_channel: lobby!.id,
        p_body: '',
        p_sealed: null,
        p_files: [{ id: fileId, path, kind: 'image', mime: 'image/png', name: 'board.png', width: 40, height: 30 }],
      })
      .select('id, body, files')
      .single()
    expect(sent.error).toBeNull()
    expect(sent.data).toMatchObject({ body: '', files: 1 })

    const rows = await ada.db.from('message_files').select('path, bytes, kind, name').eq('message_id', id)
    expect(rows.data).toEqual([{ path, bytes: 2048, kind: 'image', name: 'board.png' }])
    const link = await ada.db.storage.from('attachments').createSignedUrl(path, 60)
    expect(link.error).toBeNull()
    expect((await fetch(link.data!.signedUrl)).status).toBe(200)

    expect((await grace.db.rpc('delete_message', { p_message: id })).error).toBeNull()
    expect((await ada.db.from('message_files').select('id').eq('message_id', id)).data).toEqual([])
    expect((await ada.db.storage.from('attachments').createSignedUrl(path, 60)).error).not.toBeNull()
  })

  it('sends a DM photo the server stores but cannot read', async () => {
    const mine = keys.get(ada.id)!
    const theirs = keys.get(grace.id)!
    const id = crypto.randomUUID()
    const fileId = crypto.randomUUID()
    const ctx = { channelId: dmId, messageId: id, authorId: ada.id, sk: mine.id, rk: theirs.id }
    const conversation = await conversationKey(mine.pair.privateKey, theirs.pair.publicKey)
    const bytes = crypto.getRandomValues(new Uint8Array(4096))
    const meta = { name: 'secret-plan.jpg', mime: 'image/jpeg', kind: 'image' as const, width: 800, height: 600 }
    const file = await sealFile(conversation, ctx, fileId, bytes, meta)
    const path = attachmentPath(dmId, id, fileId)
    uploads.push(path)

    // Encrypted files must be stored as opaque bytes.
    const asPhoto = await ada.db.storage
      .from('attachments')
      .upload(path, new Blob([file.cipher], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
    expect(asPhoto.error).toBeNull()
    const refused = await ada.db.rpc('send_message_with_files', {
      p_id: id,
      p_channel: dmId,
      p_body: '',
      p_sealed: await sealMessage(conversation, ctx, ''),
      p_files: [{ id: fileId, path, sealed: file.sealed }],
    })
    expect(refused.error).not.toBeNull()
    await ada.db.storage.from('attachments').remove([path])

    const up = await ada.db.storage
      .from('attachments')
      .upload(path, new Blob([file.cipher], { type: 'application/octet-stream' }), { contentType: 'application/octet-stream' })
    expect(up.error).toBeNull()
    const sent = await ada.db.rpc('send_message_with_files', {
      p_id: id,
      p_channel: dmId,
      p_body: '',
      p_sealed: await sealMessage(conversation, ctx, 'the plan'),
      p_files: [{ id: fileId, path, sealed: file.sealed }],
    })
    expect(sent.error).toBeNull()

    const row = await grace.db.from('message_files').select('id, kind, mime, name, sealed').eq('message_id', id).single()
    expect(row.data).toMatchObject({ kind: null, mime: null, name: null })
    expect(JSON.stringify(row.data)).not.toContain('secret-plan')

    const download = await grace.db.storage.from('attachments').download(path)
    expect(download.error).toBeNull()
    const g = keys.get(grace.id)!
    const theirConversation = await conversationKey(g.pair.privateKey, mine.pair.publicKey)
    const opened = await openFileMeta(theirConversation, ctx, fileId, row.data!.sealed)
    expect(opened).toMatchObject(meta)
    expect(await openFile(theirConversation, ctx, fileId, opened, new Uint8Array(await download.data!.arrayBuffer()))).toEqual(bytes)

    expect((await outsider.db.storage.from('attachments').download(path)).error).not.toBeNull()
    expect((await outsider.db.from('message_files').select('id').eq('message_id', id)).data).toEqual([])
  })

  it('blocks DMs between people who blocked each other', async () => {
    expect((await grace.db.from('blocks').insert({ blocker_id: grace.id, blocked_id: ada.id })).error).toBeNull()
    try {
      // Existing history stays readable; only new messages are refused, in both directions.
      expect((await ada.db.from('messages').insert(await sealedRow(ada, grace, dmId, 'hello?'))).error).not.toBeNull()
      expect((await grace.db.from('messages').insert(await sealedRow(grace, ada, dmId, 'hi'))).error).not.toBeNull()
    } finally {
      await grace.db.from('blocks').delete().eq('blocker_id', grace.id)
    }
    expect((await ada.db.from('messages').insert(await sealedRow(ada, grace, dmId, 'unblocked'))).error).toBeNull()
  })

  it('rate-limits message floods', async () => {
    let limited = false
    for (let i = 0; i < 18 && !limited; i++) {
      const { error } = await ada.db.from('messages').insert(await sealedRow(ada, grace, dmId, `spam ${i}`))
      if (error) limited = /too quickly/i.test(error.message)
    }
    expect(limited).toBe(true)
  })
})
