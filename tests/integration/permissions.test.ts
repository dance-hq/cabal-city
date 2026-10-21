// Runs against a real Supabase project (yours, or CI's). Skipped unless
// NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are set. Creates throwaway users and removes them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
  })

  afterAll(async () => {
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
    const outsiderView = await outsider.db.rpc('community_lock_ins', { p_community: communityId })
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

  it('hides the invite code column from direct reads', async () => {
    const { error } = await grace.db.from('communities').select('invite_code').eq('slug', slug)
    expect(error).not.toBeNull()
  })

  it('sends a DM that only the two participants can read', async () => {
    const { data, error } = await ada.db.rpc('open_dm', { p_other: grace.id })
    expect(error).toBeNull()
    dmId = data as string

    const sent = await ada.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'hi grace' }).select().single()
    expect(sent.error).toBeNull()

    const forGrace = await grace.db.from('messages').select('body').eq('channel_id', dmId)
    expect(forGrace.data?.map((m) => m.body)).toEqual(['hi grace'])

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

  it('rejects spoofed authors and fake system messages', async () => {
    const spoof = await grace.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'i am ada' })
    expect(spoof.error).not.toBeNull()
    const system = await grace.db.from('messages').insert({ channel_id: dmId, author_id: grace.id, kind: 'system', body: 'official' })
    expect(system.error).not.toBeNull()
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

  it('blocks DMs between people who blocked each other', async () => {
    expect((await grace.db.from('blocks').insert({ blocker_id: grace.id, blocked_id: ada.id })).error).toBeNull()
    try {
      // Existing history stays readable; only new messages are refused, in both directions.
      expect((await ada.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'hello?' })).error).not.toBeNull()
      expect((await grace.db.from('messages').insert({ channel_id: dmId, author_id: grace.id, body: 'hi' })).error).not.toBeNull()
    } finally {
      await grace.db.from('blocks').delete().eq('blocker_id', grace.id)
    }
    expect((await ada.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: 'unblocked' })).error).toBeNull()
  })

  it('rate-limits message floods', async () => {
    let limited = false
    for (let i = 0; i < 18 && !limited; i++) {
      const { error } = await ada.db.from('messages').insert({ channel_id: dmId, author_id: ada.id, body: `spam ${i}` })
      if (error) limited = /too quickly/i.test(error.message)
    }
    expect(limited).toBe(true)
  })
})
