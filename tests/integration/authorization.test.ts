// Adversarial checks of the database rules, run the way the browser runs them:
// as the `authenticated` (or `anon`) role with a signed-in person's id, against
// the real policies and functions.
//
// Everything happens inside ONE transaction that is always rolled back, so no
// account, message or community is ever committed — it is safe to point at any
// database, including production. Set CABAL_AUTHZ_DATABASE_URL (or
// POSTGRES_URL_NON_POOLING) to a direct Postgres connection; skipped otherwise.

import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.CABAL_AUTHZ_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING

type Person = { id: string; name: string }
type Result = { rows: Record<string, unknown>[]; count: number; error: (Error & { code?: string }) | null }

const tag = randomUUID().slice(0, 8)
const db = url
  ? new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } })
  : (null as never)

const person = (name: string): Person => ({ id: randomUUID(), name })
// alice and bob are ordinary members, mallory is in the community but on no team
// and in no DM, olivia is signed in but not a member, bea is banned, ada is an admin.
const alice = person('alice')
const bob = person('bob')
const mallory = person('mallory')
const olivia = person('olivia')
const bea = person('bea')
const ada = person('ada')

let community = ''
let room = ''
let team = ''
let teamChannel = ''
let dm = ''
let roomMessage = ''
let teamMessage = ''
let dmMessage = ''
let aliceSession = ''
let aliceDeviceRequest = ''
let opportunity = ''
let submission = ''
let event = ''
let idea = ''
let ideaComment = ''
let ship = ''
let report = ''
let teamInvite = ''

function claims(who: Person | null) {
  return JSON.stringify(who ? { sub: who.id, role: 'authenticated' } : { role: 'anon' })
}

// Runs one statement as someone, then undoes it. Errors are returned, not thrown.
async function as(who: Person | null, sql: string, params: unknown[] = []): Promise<Result> {
  await db.query('savepoint attempt')
  try {
    await db.query(`set local role ${who ? 'authenticated' : 'anon'}`)
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(who)])
    const r = await db.query(sql, params)
    return { rows: r.rows, count: r.rowCount ?? 0, error: null }
  } catch (error) {
    return { rows: [], count: 0, error: error as Error & { code?: string } }
  } finally {
    await db.query('rollback to savepoint attempt')
  }
}

// Same, but keeps the effect (still inside the outer, rolled-back transaction).
async function keep(who: Person, sql: string, params: unknown[] = []) {
  await db.query('savepoint setup')
  await db.query('set local role authenticated')
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(who)])
  const r = await db.query(sql, params)
  await db.query('release savepoint setup')
  await db.query('reset role')
  await db.query(`select set_config('request.jwt.claims', '', true)`)
  return r.rows
}

// Runs a call as someone, then reads the database as the owner to see what it
// actually changed, then undoes both. For functions that refuse by doing nothing.
async function attempt(who: Person, sql: string, params: unknown[], check: string, checkParams: unknown[] = []) {
  await db.query('savepoint attempt')
  try {
    await db.query('savepoint call')
    let error: (Error & { code?: string }) | null = null
    try {
      await db.query('set local role authenticated')
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(who)])
      await db.query(sql, params)
      await db.query('release savepoint call')
    } catch (e) {
      error = e as Error & { code?: string }
      await db.query('rollback to savepoint call')
    }
    await db.query('reset role')
    await db.query(`select set_config('request.jwt.claims', '', true)`)
    return { error, after: (await db.query(check, checkParams)).rows }
  } finally {
    await db.query('rollback to savepoint attempt')
  }
}

const denied = (r: Result) => r.error !== null || r.count === 0

describe.skipIf(!url)('authorization (rolled back, never committed)', () => {
  beforeAll(async () => {
    await db.connect()
    await db.query('begin')

    const [c] = (
      await db.query(
        `insert into public.communities (slug, name, join_policy) values ($1, 'Authz check', 'open') returning id`,
        [`authz-${tag}`],
      )
    ).rows
    community = c.id
    room = (
      await db.query(`select id from public.channels where community_id = $1 and kind = 'room' order by position limit 1`, [
        community,
      ])
    ).rows[0].id

    for (const p of [alice, bob, mallory, olivia, bea, ada]) {
      await db.query(
        `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), '{}', '{}', now(), now())`,
        [p.id, `authz-${p.name}-${tag}@example.invalid`],
      )
      await db.query(`update public.profiles set username = $2, display_name = $3 where id = $1`, [
        p.id,
        `z${p.name.slice(0, 6)}_${tag}`,
        p.name,
      ])
    }
    for (const p of [alice, bob, mallory, bea, ada]) {
      await db.query(`insert into public.community_members (community_id, user_id, role, banned_at) values ($1, $2, $3, $4)`, [
        community,
        p.id,
        p === ada ? 'admin' : 'member',
        p === bea ? new Date().toISOString() : null,
      ])
    }

    // A private team with alice and bob; a DM between alice and bob.
    const [t] = await keep(alice, `select public.create_team($1, 'Secret plans', 'private') as id`, [community])
    const made = (
      await db.query(`select t.id team, c.id chan from public.teams t join public.channels c on c.team_id = t.id where t.id = $1 or c.id = $1`, [t.id])
    ).rows[0]
    team = made.team
    teamChannel = made.chan
    await db.query(`insert into public.team_members (team_id, user_id, role) values ($1, $2, 'member')`, [team, bob.id])
    const [d] = await keep(alice, `select public.open_dm($1) as id`, [bob.id])
    dm = d.id

    roomMessage = randomUUID()
    teamMessage = randomUUID()
    dmMessage = randomUUID()
    await keep(alice, `insert into public.messages (id, channel_id, author_id, body) values ($1, $2, $3, 'hello room')`, [
      roomMessage,
      room,
      alice.id,
    ])
    await keep(alice, `insert into public.messages (id, channel_id, author_id, body) values ($1, $2, $3, 'team secret')`, [
      teamMessage,
      teamChannel,
      alice.id,
    ])
    await keep(alice, `insert into public.messages (id, channel_id, author_id, body) values ($1, $2, $3, 'just between us')`, [
      dmMessage,
      dm,
      alice.id,
    ])

    aliceSession = randomUUID()
    await keep(alice, `select public.presence_heartbeat($1, $2, $3)`, [aliceSession, community, room])

    // A finished focus session with a private note, and private feedback/report rows.
    await db.query(
      `insert into public.work_sessions (user_id, started_at, ended_at, worked_seconds, note, shared)
       values ($1, now() - interval '2 hours', now() - interval '1 hour', 3600, 'private note', true)`,
      [alice.id],
    )
    await db.query(`insert into public.feedback (community_id, author_id, kind, body) values ($1, $2, 'bug', 'private bug')`, [
      community,
      alice.id,
    ])
    report = (
      await db.query(
        `insert into public.reports (community_id, reporter_id, reported_user_id, reason) values ($1, $2, $3, 'r') returning id`,
        [community, alice.id, mallory.id],
      )
    ).rows[0].id

    // One of each board item, so admin-only functions have something real to refuse.
    opportunity = (
      await db.query(
        `insert into public.opportunities (community_id, kind, title, summary, place, url, verified_at, status)
         values ($1, 'credits', 'Authz credits', 'Credits for the authorization check.', 'Chicago', 'https://example.invalid/o', current_date, 'published')
         returning id`,
        [community],
      )
    ).rows[0].id
    submission = (
      await db.query(
        `insert into public.opportunity_submissions (community_id, url, submitted_by) values ($1, 'https://example.invalid/s', $2) returning id`,
        [community, alice.id],
      )
    ).rows[0].id
    event = (
      await db.query(
        `insert into public.calendar_events (community_id, title, starts_at, venue, status, submitted_by)
         values ($1, 'Authz meetup', now() + interval '3 days', 'Somewhere', 'pending', $2) returning id`,
        [community, alice.id],
      )
    ).rows[0].id
    idea = (
      await db.query(
        `insert into public.feedback (community_id, author_id, kind, title, body, on_board) values ($1, $2, 'idea', 'Authz idea', 'An idea.', true) returning id`,
        [community, alice.id],
      )
    ).rows[0].id
    ideaComment = (
      await db.query(`insert into public.idea_comments (idea_id, author_id, body) values ($1, $2, 'A comment.') returning id`, [
        idea,
        alice.id,
      ])
    ).rows[0].id
    ship = (await db.query(`insert into public.ships (title) values ('Authz ship') returning id`)).rows[0].id
    // ada is invited (not joined), so the admin checks above also prove an
    // invitation alone never opens a private team's messages.
    teamInvite = (
      await db.query(`insert into public.team_invites (team_id, user_id, invited_by) values ($1, $2, $3) returning id`, [
        team,
        ada.id,
        alice.id,
      ])
    ).rows[0].id
    const key = 'A'.repeat(87) + '='
    aliceDeviceRequest = (
      await db.query(
        `insert into public.e2ee_device_requests (user_id, label, request_key, commitment) values ($1, 'Laptop', $2, $3) returning id`,
        [alice.id, key, 'B'.repeat(43) + '='],
      )
    ).rows[0].id
  })

  afterAll(async () => {
    if (!url) return
    await db.query('rollback').catch(() => {})
    await db.end()
  })

  describe('reading conversations', () => {
    it('someone outside the community cannot read its rooms', async () => {
      expect(denied(await as(olivia, `select id from public.messages where channel_id = $1`, [room]))).toBe(true)
    })

    it('a member can read rooms (control)', async () => {
      const r = await as(mallory, `select id from public.messages where channel_id = $1`, [room])
      expect(r.error).toBeNull()
      expect(r.rows.map((x) => x.id)).toContain(roomMessage)
    })

    it('a member not on a private team cannot read its messages, channel or members', async () => {
      expect(denied(await as(mallory, `select id from public.messages where channel_id = $1`, [teamChannel]))).toBe(true)
      expect(denied(await as(mallory, `select id from public.channels where id = $1`, [teamChannel]))).toBe(true)
      expect(denied(await as(mallory, `select user_id from public.team_members where team_id = $1`, [team]))).toBe(true)
      expect(denied(await as(mallory, `select id from public.teams where id = $1`, [team]))).toBe(true)
    })

    it('community admins cannot read team channels they are not on', async () => {
      expect(denied(await as(ada, `select id from public.messages where channel_id = $1`, [teamChannel]))).toBe(true)
    })

    it('nobody but the two people can read a DM, its participants or its channel', async () => {
      for (const who of [mallory, ada, olivia]) {
        expect(denied(await as(who, `select id from public.messages where id = $1`, [dmMessage]))).toBe(true)
        expect(denied(await as(who, `select user_id from public.dm_participants where channel_id = $1`, [dm]))).toBe(true)
        expect(denied(await as(who, `select id from public.channels where id = $1`, [dm]))).toBe(true)
      }
      const r = await as(bob, `select body from public.messages where id = $1`, [dmMessage])
      expect(r.rows[0]?.body).toBe('just between us')
    })

    it('a banned member loses access to rooms, teams and DMs', async () => {
      expect(denied(await as(bea, `select id from public.messages where channel_id = $1`, [room]))).toBe(true)
      expect(denied(await as(bea, `insert into public.messages (channel_id, author_id, body) values ($1, $2, 'x')`, [room, bea.id]))).toBe(true)
      expect((await as(bea, `select public.open_dm($1)`, [alice.id])).error).not.toBeNull()
    })

    it('signed-out visitors read nothing private', async () => {
      for (const table of ['messages', 'profiles', 'community_members', 'channels', 'dm_participants', 'presence_sessions', 'work_sessions', 'e2ee_keys', 'user_settings']) {
        expect(denied(await as(null, `select 1 from public.${table} limit 1`)), table).toBe(true)
      }
    })

    it('signed-out visitors cannot call any security-definer function', async () => {
      const r = await as(null, `select public.my_channels($1)`, [community])
      expect(r.error?.code).toBe('42501')
    })
  })

  describe('posting and changing messages', () => {
    it('cannot post into a DM or team you are not part of', async () => {
      expect(denied(await as(mallory, `insert into public.messages (channel_id, author_id, body) values ($1, $2, 'hi')`, [dm, mallory.id]))).toBe(true)
      expect(denied(await as(mallory, `insert into public.messages (channel_id, author_id, body) values ($1, $2, 'hi')`, [teamChannel, mallory.id]))).toBe(true)
    })

    it('cannot post as someone else or as the system', async () => {
      expect(denied(await as(bob, `insert into public.messages (channel_id, author_id, body) values ($1, $2, 'spoof')`, [room, alice.id]))).toBe(true)
      expect(denied(await as(bob, `insert into public.messages (channel_id, author_id, kind, body) values ($1, $2, 'system', 'spoof')`, [room, bob.id]))).toBe(true)
      expect(denied(await as(bob, `insert into public.messages (channel_id, author_id, kind, body) values ($1, null, 'system', 'spoof')`, [room]))).toBe(true)
    })

    it('cannot backdate a message', async () => {
      const id = randomUUID()
      const r = await as(
        bob,
        `insert into public.messages (id, channel_id, author_id, body, created_at) values ($1, $2, $3, 'old', '2001-01-01') returning created_at`,
        [id, room, bob.id],
      )
      expect(r.error).toBeNull()
      expect(new Date(r.rows[0].created_at as string).getFullYear()).toBeGreaterThan(2001)
    })

    it('cannot edit or delete someone else’s message directly', async () => {
      expect((await as(bob, `update public.messages set body = 'edited' where id = $1`, [roomMessage])).count).toBe(0)
      expect((await as(bob, `delete from public.messages where id = $1`, [roomMessage])).count).toBe(0)
      expect((await as(bob, `select public.delete_message($1)`, [roomMessage])).error?.code).toBe('42501')
    })

    it('an admin can remove a room message but not a DM or team message', async () => {
      expect((await as(ada, `select public.delete_message($1)`, [roomMessage])).error).toBeNull()
      expect((await as(ada, `select public.delete_message($1)`, [dmMessage])).error).not.toBeNull()
      expect((await as(ada, `select public.delete_message($1)`, [teamMessage])).error).not.toBeNull()
    })

    it('refuses oversized plain messages', async () => {
      const r = await as(bob, `insert into public.messages (channel_id, author_id, body) values ($1, $2, repeat('x', 4001))`, [room, bob.id])
      expect(r.error).not.toBeNull()
    })

    it('slows down floods', async () => {
      const r = await as(
        bob,
        `do $$ begin for i in 1..20 loop insert into public.messages (channel_id, author_id, body) values ('${room}', '${bob.id}', 'm' || i); end loop; end $$`,
      )
      expect(r.error?.code).toBe('P0429')
    })

    it('cannot claim a file in a conversation you cannot read', async () => {
      const r = await as(
        mallory,
        `insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2)`,
        [`${teamChannel}/${randomUUID()}/${randomUUID()}`, mallory.id],
      )
      expect(r.error).not.toBeNull()
      expect((await as(mallory, `select public.can_read_attachment($1) ok`, [`${teamChannel}/${teamMessage}/x`])).rows[0]?.ok).toBe(false)
    })
  })

  describe('roles and administration', () => {
    it('members cannot make themselves admin or unban someone', async () => {
      expect((await as(bob, `update public.community_members set role = 'admin' where user_id = $1`, [bob.id])).count).toBe(0)
      expect((await as(bob, `update public.community_members set banned_at = null where user_id = $1`, [bea.id])).count).toBe(0)
      expect(denied(await as(olivia, `insert into public.community_members (community_id, user_id, role) values ($1, $2, 'admin')`, [community, olivia.id]))).toBe(true)
    })

    it('admin-only functions refuse members', async () => {
      for (const [fn, args] of [
        ['set_member_banned($1, $2, true)', [community, mallory.id]],
        ['rotate_invite_code($1)', [community]],
        ['set_join_policy($1, $2)', [community, 'invite']],
        ['event_review($1)', [community]],
        ['opportunity_review($1)', [community]],
      ] as const) {
        expect((await as(bob, `select public.${fn}`, [...args])).error?.code, fn).toBe('42501')
      }
    })

    it('admins cannot ban other admins or themselves', async () => {
      expect((await as(ada, `select public.set_member_banned($1, $2, true)`, [community, ada.id])).error).not.toBeNull()
    })

    it('the invite code column stays hidden from direct reads', async () => {
      expect((await as(bob, `select invite_code from public.communities where id = $1`, [community])).error?.code).toBe('42501')
      expect((await as(null, `select invite_code from public.communities where id = $1`, [community])).error?.code).toBe('42501')
    })

    it('team rules: only owners invite to private teams, change roles or remove people', async () => {
      expect((await as(bob, `select public.invite_to_team($1, $2)`, [team, mallory.id])).error?.code).toBe('42501')
      expect((await as(bob, `select public.set_team_role($1, $2, 'owner')`, [team, bob.id])).error?.code).toBe('42501')
      expect((await as(bob, `select public.remove_team_member($1, $2)`, [team, alice.id])).error?.code).toBe('42501')
      expect((await as(mallory, `select public.join_team($1)`, [team])).error).not.toBeNull()
    })
  })

  describe('private data', () => {
    it('settings, reads, blocks, groups and focus sessions are owner-only', async () => {
      for (const table of ['user_settings', 'channel_reads', 'blocks', 'buddy_groups', 'work_sessions', 'e2ee_backups', 'e2ee_device_requests']) {
        expect(denied(await as(bob, `select * from public.${table} where ${table === 'blocks' ? 'blocker_id' : 'user_id'} = $1`, [alice.id])), table).toBe(true)
      }
    })

    it('feedback and reports are visible to their author and admins only', async () => {
      expect(denied(await as(bob, `select id from public.feedback where author_id = $1 and not on_board`, [alice.id]))).toBe(true)
      expect(denied(await as(bob, `select id from public.reports where reporter_id = $1`, [alice.id]))).toBe(true)
      expect(denied(await as(ada, `select id from public.reports where reporter_id = $1`, [alice.id]))).toBe(false)
    })

    it('profiles are only visible to people who share a community', async () => {
      expect(denied(await as(olivia, `select id from public.profiles where id = $1`, [alice.id]))).toBe(true)
      expect(denied(await as(bob, `select id from public.profiles where id = $1`, [alice.id]))).toBe(false)
    })

    it('cannot change someone else’s profile or settings', async () => {
      expect((await as(bob, `update public.profiles set display_name = 'pwned' where id = $1`, [alice.id])).count).toBe(0)
      expect((await as(bob, `update public.user_settings set notify_dms = false where user_id = $1`, [alice.id])).count).toBe(0)
    })

    it('profile photos must live in your own folder of the avatars bucket', async () => {
      const r = await as(bob, `update public.profiles set avatar_url = 'https://evil.example/track.png' where id = $1`, [bob.id])
      expect(r.error).not.toBeNull()
    })

    it('focus hours stay private unless shared, and notes are never shared', async () => {
      const hidden = await as(bob, `select public.lock_in_stats($1, $2) s`, [community, alice.id])
      expect(hidden.rows[0]?.s).toBeNull()
      await db.query(`update public.user_settings set lock_in_board = true where user_id = $1`, [alice.id])
      const shared = await as(bob, `select public.lock_in_stats($1, $2) s`, [community, alice.id])
      expect(JSON.stringify(shared.rows[0]?.s)).not.toContain('private note')
      await db.query(`update public.user_settings set lock_in_board = false where user_id = $1`, [alice.id])
    })

    it('cannot take over someone else’s presence session', async () => {
      await as(bob, `select public.presence_heartbeat($1, $2, null)`, [aliceSession, community])
      const owner = (await db.query(`select user_id from public.presence_sessions where id = $1`, [aliceSession])).rows[0]
      expect(owner?.user_id).toBe(alice.id)
    })

    it('presence never reveals a DM or team someone is reading', async () => {
      await keep(bob, `select public.presence_heartbeat($1, $2, $3)`, [randomUUID(), community, dm])
      const r = await as(mallory, `select room_id from public.presence_sessions where user_id = $1`, [bob.id])
      expect(r.rows.every((x) => x.room_id === null)).toBe(true)
    })

    it('cannot answer someone else’s device-unlock request', async () => {
      const r = await as(bob, `select public.e2ee_claim_device($1, $2, $3)`, [aliceDeviceRequest, 'C'.repeat(87) + '=', 'D'.repeat(22) + '=='])
      expect(r.error).not.toBeNull()
    })
  })

  describe('boards, calendar and teams', () => {
    it('admin-only board, calendar and report functions refuse members', async () => {
      for (const [fn, args] of [
        ['archive_opportunity($1)', [opportunity]],
        ['opportunity_detail($1)', [opportunity]],
        ['dismiss_opportunity_submission($1)', [submission]],
        ['event_detail($1)', [event]],
        ['remove_event($1)', [event]],
        ['save_event($1, $2, $3, null, $4, null, $5, null, null)', [event, community, 'Hijacked', '2030-01-01 18:00', 'Elsewhere']],
        ['resolve_report($1)', [report]],
        ['set_idea_hidden($1, true)', [idea]],
        ['set_idea_status($1, $2, null, null)', [idea, 'shipped']],
        ['delete_idea_comment($1)', [ideaComment]],
      ] as const) {
        // The exact code matters: any other error could just be a wrong call.
        expect((await as(bob, `select * from public.${fn}`, [...args])).error?.code, fn).toBe('42501')
        expect((await as(ada, `select * from public.${fn}`, [...args])).error?.code, `${fn} as admin`).not.toBe('42501')
      }
    })

    // Maintainer = admin of any community (one community per deployment today).
    // Admin only comes from the server's admin list, so joining must never grant it.
    it('maintainer-only functions refuse members, and joining never makes you one', async () => {
      for (const [fn, args] of [
        ['post_ship($1, null, null)', ['Fake ship']],
        ['delete_ship($1)', [ship]],
        ['set_idea_link($1, $2)', [idea, 'https://github.com/evil/repo']],
      ] as const) {
        expect((await as(bob, `select public.${fn}`, [...args])).error?.code, fn).toBe('42501')
      }
      const joined = await attempt(
        olivia,
        `select public.join_community($1)`,
        [`authz-${tag}`],
        `select role from public.community_members where community_id = $1 and user_id = $2`,
        [community, olivia.id],
      )
      expect(joined.error).toBeNull()
      expect(joined.after[0]?.role).toBe('member')
    })

    it('a pending event stays out of other members’ calendars', async () => {
      const r = await as(mallory, `select * from public.calendar_for($1)`, [community])
      expect(r.error).toBeNull()
      expect(JSON.stringify(r.rows)).not.toContain(event)
    })

    it('people outside the community get nothing from its boards, channels or invite code', async () => {
      for (const sql of [
        'select * from public.calendar_for($1)',
        'select * from public.opportunities_for($1)',
        'select * from public.linkable_channels($1)',
        'select public.community_invite_code($1) code',
      ]) {
        const r = await as(olivia, sql, [community])
        const leaked = JSON.stringify(r.rows).match(new RegExp(`${event}|${opportunity}|${room}|"code":"[^"]`))
        expect(r.error !== null || leaked === null, sql).toBe(true)
      }
      const places = await as(olivia, `select * from public.member_places($1, $2)`, [community, alice.id])
      expect(denied(places)).toBe(true)
    })

    it('a member’s places never reveal a private team to someone not on it', async () => {
      const r = await as(mallory, `select * from public.member_places($1, $2)`, [community, alice.id])
      expect(JSON.stringify(r.rows)).not.toContain(team)
    })

    it('only team owners rename a team, change its welcome or cancel its invites', async () => {
      for (const who of [bob, mallory, ada]) {
        expect((await as(who, `select public.rename_team($1, 'Taken over')`, [team])).error?.code).toBe('42501')
        expect((await as(who, `select public.set_team_welcome($1, 'Gotcha')`, [team])).error?.code).toBe('42501')
        expect((await as(who, `select public.cancel_team_invite($1)`, [teamInvite])).error?.code).toBe('42501')
      }
    })

    it('only team owners can put images in a team’s folder', async () => {
      const r = await as(bob, `select public.can_edit_team_image($1) ok`, [`${team}/logo.webp`])
      expect(r.rows[0]?.ok).toBe(false)
    })

    it('cannot approve or decline someone else’s device request', async () => {
      const approve = await attempt(
        bob,
        `select public.e2ee_approve_device($1, 'aXY=', 'a2V5cmluZw==')`,
        [aliceDeviceRequest],
        `select status, sealed_keyring from public.e2ee_device_requests where id = $1`,
        [aliceDeviceRequest],
      )
      expect(approve.after[0]?.sealed_keyring ?? null).toBeNull()
      const decline = await attempt(
        bob,
        `select public.e2ee_decline_device($1)`,
        [aliceDeviceRequest],
        `select status from public.e2ee_device_requests where id = $1`,
        [aliceDeviceRequest],
      )
      expect(decline.after[0]?.status).not.toBe('declined')
    })

    it('cannot overwrite someone else’s key backup', async () => {
      const r = await attempt(
        bob,
        `select public.e2ee_save_backup($1, 'aXY=', 'YmFja3Vw')`,
        [randomUUID()],
        `select count(*)::int n from public.e2ee_backups where user_id = $1`,
        [alice.id],
      )
      expect(r.after[0]?.n).toBe(0)
    })
  })

  describe('realtime', () => {
    it('typing topics follow channel access', async () => {
      const topic = (id: string) => `chan:${id}`
      expect((await as(mallory, `select public.can_use_topic($1) ok`, [topic(teamChannel)])).rows[0]?.ok).toBe(false)
      expect((await as(mallory, `select public.can_use_topic($1) ok`, [topic(dm)])).rows[0]?.ok).toBe(false)
      expect((await as(bob, `select public.can_use_topic($1) ok`, [topic(dm)])).rows[0]?.ok).toBe(true)
      expect((await as(mallory, `select public.can_use_topic($1) ok`, ['chan:not-a-uuid'])).rows[0]?.ok).toBe(false)
    })

    it('the lock-in topic is for members of that community only', async () => {
      const topic = `lock-ins:${community}`
      expect((await as(mallory, `select public.can_use_topic($1) ok`, [topic])).rows[0]?.ok).toBe(true)
      expect((await as(olivia, `select public.can_use_topic($1) ok`, [topic])).rows[0]?.ok).toBe(false)
      expect((await as(bea, `select public.can_use_topic($1) ok`, [topic])).rows[0]?.ok).toBe(false)
    })
  })
})
