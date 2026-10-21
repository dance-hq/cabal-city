import { HEARTBEAT_MS, PRESENCE_TTL_MS, config, githubUrl } from '@/lib/config'

// Everything /docs says, in one place. Each claim points at the file that
// makes it true, and `proves` is text that must still appear in that file:
// tests/unit/docs.test.ts fails when the code changes and this page doesn't.
//
// This page is public. Keep exact abuse limits, which server jobs hold
// privileged keys, and unfixed weaknesses off it; the same test checks for
// those. Security problems go through SECURITY.md, never here.
//
// Text in `backticks` renders as inline code.

export const REVIEWED_ON = 'October 21, 2026'

export type Source = {
  /** Repository path. A trailing slash means a folder. */
  path: string
  proves?: string[]
}

export type Fact = {
  label: string
  value?: string
  body: string
  sources?: Source[]
}

export type Journey = {
  id: string
  title: string
  steps: { text: string; sources?: Source[] }[]
}

export type Command = { run: string; note?: string }

export type Freshness = { what: string; how: string; when: string; sources?: Source[] }

export const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'quickstart', title: 'Run it locally' },
  { id: 'layout', title: 'Repository layout' },
  { id: 'permissions', title: 'Permissions' },
  { id: 'data-model', title: 'Data model' },
  { id: 'realtime', title: 'Realtime and polling' },
  { id: 'flows', title: 'Request flows' },
  { id: 'encryption', title: 'End-to-end encryption' },
  { id: 'testing', title: 'Tests and CI' },
  { id: 'contributing', title: 'Self-hosting and contributing' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

const seconds = (ms: number) => Math.round(ms / 1000)

const SCHEMA = 'supabase/migrations/0001_cabal.sql'
const FEEDBACK = 'supabase/migrations/0005_feedback.sql'
const BOARD = 'supabase/migrations/0014_build_cabal_opportunities.sql'
const LOCK_IN = 'supabase/migrations/0009_lock_in.sql'
const RESUME = 'supabase/migrations/0010_lock_in_auto_resume.sql'
const STORE = 'components/cabal/store.tsx'
const E2EE = 'lib/e2ee/crypto.ts'
const E2EE_SESSION = 'lib/e2ee/session.ts'
const VAULT = 'lib/e2ee/vault.ts'
const E2EE_SCHEMA = 'supabase/migrations/0017_dm_encryption.sql'
const SIGN_IN = 'app/api/auth/code/route.ts'

// --- Overview ------------------------------------------------------------------

export const OVERVIEW =
  'Cabal is a Next.js app, plus an Electron shell around it, backed by one Supabase project. The client talks to Postgres directly with the public anon key and the signed-in user’s JWT. There is no API layer making permission decisions: row-level security and `security definer` functions in the migrations do that, so a modified client gets exactly the same answers as ours.'

export const MAP = {
  client: { title: 'Client', body: 'Next.js and React, in a browser tab or the Electron app.' },
  server: {
    wire: 'HTTPS',
    title: 'Route handlers on Vercel',
    body: 'Server-only tasks the browser can’t do itself, like emailing a sign-in code.',
    sources: [{ path: 'app/api/' }] as Source[],
  },
  database: {
    wire: 'PostgREST · Realtime',
    title: 'Supabase',
    body: 'Postgres with RLS on every table, Auth, Realtime and Storage. Every read and write is checked here.',
    sources: [{ path: 'supabase/migrations/' }] as Source[],
  },
  caption:
    'Resend delivers email. GitHub Actions builds the desktop installers and GitHub Releases hosts them. Any host that runs Next.js can stand in for Vercel.',
}

export const STACK: Fact[] = [
  {
    label: 'Web app',
    value: 'Next.js 16 · React 19',
    body: 'App Router, Tailwind CSS 4 and shadcn/ui on Base UI. Client state lives in one provider, `components/cabal/store.tsx`; data fetching goes through SWR.',
    sources: [{ path: 'app/' }, { path: STORE }],
  },
  {
    label: 'Database',
    value: 'Supabase Postgres',
    body: 'Tables, RLS policies, triggers and RPCs are plain SQL in numbered migrations. `pnpm db:migrate` applies them in order and records each one, so re-running is safe.',
    sources: [{ path: 'supabase/migrations/' }, { path: 'scripts/db.mjs', proves: ['cabal_migrations'] }],
  },
  {
    label: 'Auth',
    value: 'Supabase Auth · email OTP',
    body: 'One-time email codes, no passwords. `proxy.ts` refreshes the session cookie on each request.',
    sources: [{ path: SIGN_IN }, { path: 'lib/supabase/proxy.ts', proves: ['supabase.auth.getUser()'] }],
  },
  {
    label: 'Live updates',
    value: 'Supabase Realtime',
    body: '`postgres_changes` for rows, which Realtime filters through the same RLS policies, and private broadcast topics for typing indicators.',
    sources: [{ path: STORE }, { path: 'hooks/use-typing.ts' }],
  },
  {
    label: 'Files',
    value: 'Supabase Storage',
    body: 'One `avatars` bucket. A storage policy limits each user to writing inside their own folder.',
    sources: [{ path: 'lib/avatar.ts' }, { path: SCHEMA, proves: ['(storage.foldername(name))[1] = auth.uid()::text'] }],
  },
  {
    label: 'Email',
    value: 'Resend',
    body: 'Sign-in codes. In development, codes print to the server log when Resend isn’t configured.',
    sources: [{ path: 'lib/email.ts' }, { path: '.env.example', proves: ['codes print to the dev server log'] }],
  },
  {
    label: 'Desktop',
    value: 'Electron',
    body: 'Loads the hosted app and adds a tray icon, an unread badge, a lock-in timer overlay and automatic updates from GitHub Releases on Windows and Linux.',
    sources: [{ path: 'desktop/src/main.cjs' }, { path: 'docs/desktop.md' }],
  },
]

// --- Run it locally ----------------------------------------------------------

const repoDir = config.githubRepo.split('/')[1] || 'cabal'

export const SETUP: Command[] = [
  { run: `git clone ${githubUrl ? `${githubUrl}.git` : 'https://github.com/<owner>/cabal.git'}` },
  { run: `cd ${repoDir}` },
  { run: 'pnpm install' },
  { run: 'cp .env.example .env.local', note: 'then fill in your Supabase project' },
  { run: 'pnpm db:migrate', note: 'applies supabase/migrations/*.sql in order' },
  { run: 'pnpm db:seed', note: 'your community and its starting rooms' },
  { run: 'pnpm dev' },
]

export const DEV_COMMANDS: Command[] = [
  { run: 'node scripts/dev-code.mjs you@example.com', note: 'print a sign-in code' },
  { run: 'pnpm typecheck' },
  { run: 'pnpm test', note: 'unit, plus integration if configured' },
  { run: 'pnpm desktop', note: 'run the Electron app' },
]

export const SETUP_NOTES: Fact[] = [
  {
    label: 'Environment',
    body: '`.env.example` lists every variable with a note on where to find it. Only `NEXT_PUBLIC_*` values are sent to the browser.',
    sources: [{ path: '.env.example' }],
  },
  {
    label: 'Supabase Auth',
    body: 'Turn off “Allow new users to sign up” and keep “Confirm email” on. Cabal creates accounts itself, so the sign-in route is the only way in.',
    sources: [{ path: 'docs/self-hosting.md', proves: ['Allow new users to sign up'] }],
  },
  {
    label: 'Your community',
    body: 'The slug, name, join policy and starting rooms live in `supabase/seed.sql`. Set `NEXT_PUBLIC_CABAL_COMMUNITY` to the same slug. Nothing community-specific is hard-coded.',
    sources: [{ path: 'supabase/seed.sql' }, { path: 'lib/config.ts' }],
  },
]

// --- Repository layout -------------------------------------------------------

export const LAYOUT: { path: string; body: string }[] = [
  { path: 'app/', body: 'Routes: the marketing pages, `/app` (the client), `/login`, `/onboarding`, `/join/[code]` and this page.' },
  { path: 'app/api/', body: 'Route handlers for the few things that have to run on a server.' },
  { path: 'components/cabal/', body: 'The client UI. `store.tsx` owns client state, the Realtime subscription and sending messages.' },
  { path: 'hooks/', body: 'Message pagination, typing indicators, lock-ins and buddy groups.' },
  { path: 'lib/', body: 'Shared logic and types. Deployment settings and timing constants are in `lib/config.ts`.' },
  { path: 'lib/e2ee/', body: 'Direct-message encryption: primitives, the per-user session and the IndexedDB key store.' },
  { path: 'lib/supabase/', body: 'Supabase clients for the browser, server components and `proxy.ts`.' },
  { path: 'supabase/migrations/', body: 'The schema and every permission rule. Read these to know what anyone can do.' },
  { path: 'desktop/', body: 'The Electron app, with its own `package.json` and lockfile.' },
  { path: 'tests/', body: 'Unit tests, plus `integration/` tests against a real Supabase project.' },
  { path: 'scripts/', body: 'Migrations and seeding (`db.mjs`), dev sign-in codes, brand assets.' },
  { path: 'docs/', body: 'Self-hosting, architecture and desktop release notes.' },
]

// --- Permissions ---------------------------------------------------------------

export const PERMISSIONS_INTRO =
  'RLS is on for every table. Reads are policies. Writes that need more than one check go through `security definer` functions that pin `search_path = \'\'` and check `auth.uid()` themselves. Columns members may edit are granted one by one, so nobody can update their own role.'

export const PERMISSIONS: Fact[] = [
  {
    label: 'Rooms',
    body: 'Members of the community who aren’t banned.',
    sources: [{ path: SCHEMA, proves: ['create function public.can_read_channel'] }],
  },
  {
    label: 'Public teams',
    body: 'Anyone in the community who joins, including history from before they joined.',
    sources: [{ path: 'supabase/migrations/0004_open_team_rooms.sql' }],
  },
  {
    label: 'Invite-only teams',
    body: 'Team members only. Community admins aren’t let in unless they’re on the team.',
  },
  {
    label: 'Direct messages',
    body: 'The two participants. Posting also requires that neither has blocked the other. Message bodies are ciphertext, so the database can’t read them either.',
    sources: [
      { path: SCHEMA, proves: ['p.channel_id = c.id and p.user_id = auth.uid()'] },
      { path: E2EE_SCHEMA, proves: ["new.body := ''"] },
    ],
  },
  {
    label: 'Profiles',
    body: 'People in your community: name, role, photo, what you’re building and up to four links. Members edit only the columns granted to them.',
    sources: [
      { path: 'supabase/migrations/0011_profile_identity.sql', proves: ['grant update (identity) on public.profiles to authenticated'] },
      { path: 'supabase/migrations/0016_profile_links.sql' },
    ],
  },
  {
    label: 'Presence and lock-ins',
    body: 'People in your community. `invisible` deletes your presence rows instead of hiding them, so there is nothing to read.',
    sources: [{ path: LOCK_IN, proves: ["coalesce(us.availability, 'online') <> 'invisible'"] }],
  },
  {
    label: 'Build Cabal board',
    body: 'Members of any Cabal community. Private feedback (“Send feedback”) stays visible to admins only.',
    sources: [{ path: BOARD, proves: ['on_board and (hidden_at is null and public.is_any_member()'] }],
  },
  {
    label: 'Public keys',
    body: 'People in your community, plus anyone you’ve had a direct message with, so old conversations stay readable after someone leaves.',
    sources: [{ path: E2EE_SCHEMA, proves: ['or public.shares_community(owner)'] }],
  },
  {
    label: 'Email addresses',
    body: 'Never shown to other members. Included only in feedback you send, so the team can reply.',
    sources: [{ path: 'app/api/feedback/route.ts', proves: ['email: user.email ?? null'] }],
  },
  {
    label: 'Admin role',
    body: 'Granted on the server to emails listed in `CABAL_ADMIN_EMAILS`. Being first to sign up grants nothing.',
    sources: [{ path: 'app/api/session/bootstrap/route.ts', proves: ['CABAL_ADMIN_EMAILS'] }],
  },
]

export const PERMISSIONS_PROOF: Source[] = [{ path: 'tests/integration/permissions.test.ts' }]

// --- Data model ------------------------------------------------------------------

export const DATA_MODEL: Fact[] = [
  {
    label: 'People',
    value: 'communities · community_members · profiles · user_settings · blocks',
    body: 'One deployment runs one community; membership carries the role and ban state.',
    sources: [{ path: SCHEMA }],
  },
  {
    label: 'Conversations',
    value: 'channels · dm_participants · messages · channel_reads · reports',
    body: '`channels.kind` is `room`, `team` or `dm`. `my_channels()` returns your channels with unread counts. Links to channels are stored as `<#channel-id>`, so renames never break them.',
    sources: [
      { path: SCHEMA, proves: ["kind in ('room', 'team', 'dm')"] },
      { path: 'supabase/migrations/0015_linkable_channels.sql' },
    ],
  },
  {
    label: 'Long messages',
    value: 'messages.long_text · message_texts',
    body: 'Anything too big to read inline is sent whole, exactly as typed. The message row keeps a short preview, so conversation lists and Realtime stay light; the full text lives in `message_texts` and is fetched only when someone opens it. `send_long_message()` writes both in one transaction, and a deferred trigger refuses a long message without its text.',
    sources: [
      { path: 'supabase/migrations/0019_long_messages.sql', proves: ['create table public.message_texts', 'create constraint trigger messages_long_text_present'] },
      { path: 'lib/long-text.ts', proves: ['export function isLong'] },
    ],
  },
  {
    label: 'Teams',
    value: 'teams · team_members · team_invites',
    body: 'Public or invite-only, each with its own channel and an optional pinned welcome note.',
    sources: [{ path: 'supabase/migrations/0013_team_welcome.sql' }],
  },
  {
    label: 'Presence',
    value: 'presence_sessions',
    body: 'One row per open window. The server stamps every heartbeat, so clients can’t fake being online.',
    sources: [{ path: SCHEMA, proves: ['create function public.presence_heartbeat'] }],
  },
  {
    label: 'Lock-in',
    value: 'work_sessions',
    body: 'Focus sessions with server-owned start, pause and end times. At most one open session per person.',
    sources: [{ path: 'supabase/migrations/0006_work_sessions.sql', proves: ['work_sessions_one_open'] }, { path: RESUME }],
  },
  {
    label: 'Buddy groups',
    value: 'buddy_groups · buddy_group_members',
    body: 'Your own AIM-style groups. Only you can see them.',
    sources: [{ path: 'supabase/migrations/0008_buddy_groups.sql' }],
  },
  {
    label: 'Build Cabal',
    value: 'feedback · idea_votes · idea_comments · ships · opportunities · opportunity_saves · opportunity_submissions',
    body: 'Ideas are `feedback` rows moved onto the public board; bug reports stay private. Opportunities are curated per city or for everyone.',
    sources: [{ path: FEEDBACK }, { path: BOARD }],
  },
  {
    label: 'Encryption',
    value: 'e2ee_keys · e2ee_backups · e2ee_device_requests · messages.sealed',
    body: 'Public keys, recovery-key-locked backups and in-flight device approvals. See End-to-end encryption below.',
    sources: [{ path: E2EE_SCHEMA }],
  },
]

// --- Realtime and polling ---------------------------------------------------------

export const FRESHNESS: Freshness[] = [
  {
    what: 'New and edited messages',
    how: '`postgres_changes` on `messages`',
    when: 'Instant',
    sources: [{ path: STORE, proves: ["table: 'messages'"] }],
  },
  {
    what: 'Typing',
    how: 'Private broadcast on `chan:<id>`, never stored',
    when: 'Instant',
    sources: [{ path: 'hooks/use-typing.ts', proves: ['private: true'] }],
  },
  {
    what: 'Coming online, going offline',
    how: '`postgres_changes` on `presence_sessions`',
    when: `Instant, or ${seconds(PRESENCE_TTL_MS)}s after a crash`,
    sources: [{ path: STORE, proves: ["table: 'presence_sessions'"] }, { path: 'lib/config.ts' }],
  },
  {
    what: 'Profiles, settings, invites, read markers',
    how: '`postgres_changes`, filtered to your rows where it applies',
    when: 'Instant',
    sources: [{ path: STORE, proves: ["table: 'channel_reads'"] }],
  },
  {
    what: 'Device unlock requests',
    how: '`postgres_changes` on `e2ee_device_requests`',
    when: 'Instant',
    sources: [{ path: 'components/cabal/e2ee-provider.tsx', proves: ["table: 'e2ee_device_requests'"] }],
  },
  {
    what: 'Who’s locked in',
    how: 'SWR poll of `community_lock_ins()`',
    when: '30s',
    sources: [{ path: 'hooks/use-lock-ins.ts', proves: ['refreshInterval: 30_000'] }],
  },
  {
    what: 'A peer’s public key',
    how: 'SWR poll, and on window focus',
    when: '60s',
    sources: [{ path: 'components/cabal/e2ee-dm.tsx', proves: ['refreshInterval: 60_000'] }],
  },
  {
    what: 'Team members',
    how: 'SWR poll while a team is open',
    when: '60s',
    sources: [{ path: 'components/cabal/team-dialogs.tsx', proves: ['refreshInterval: 60_000'] }],
  },
  {
    what: 'Community member list',
    how: 'SWR poll',
    when: '2 min',
    sources: [{ path: STORE, proves: ['refreshInterval: 120_000'] }],
  },
  {
    what: 'New deploys',
    how: 'Poll `/api/version`, then show an update bar',
    when: '10 min',
    sources: [{ path: 'components/cabal/update-bar.tsx', proves: ['refreshInterval: 10 * 60_000'] }],
  },
  {
    what: 'Desktop updates',
    how: '`electron-updater` against GitHub Releases (Windows, Linux)',
    when: '6 h',
    sources: [{ path: 'desktop/src/main.cjs', proves: ['6 * 60 * 60 * 1000'] }],
  },
]

export const PRESENCE_NOTE = `Each open window calls \`presence_heartbeat()\` every ${seconds(HEARTBEAT_MS)}s and counts as online for ${seconds(PRESENCE_TTL_MS)}s after the last one. Online means a window is open, not that someone is at the keyboard: Cabal doesn’t track input. Away and Do not disturb are set by hand.`

// --- Request flows ------------------------------------------------------------------

export const JOURNEYS: Journey[] = [
  {
    id: 'sign-in',
    title: 'Sign in',
    steps: [
      {
        text: 'The client posts an email to `/api/auth/code`. The handler rate-limits by email and by network, counting hashed identifiers that it deletes after 24 hours.',
        sources: [{ path: SIGN_IN, proves: ['since(24 * 60)'] }],
      },
      {
        text: 'It creates the account if needed, has Supabase Auth issue a one-time code, and sends it through Resend.',
        sources: [{ path: 'lib/email.ts' }],
      },
      {
        text: 'The client calls `supabase.auth.verifyOtp()`. Supabase checks the code and sets the session cookie.',
        sources: [{ path: 'components/auth/login-form.tsx', proves: ['supabase.auth.verifyOtp('] }],
      },
      {
        text: 'On first sign-in, `/onboarding` asks for a name and a role. The `@username` is derived from the name; on a unique violation (`23505`) it retries with a number.',
        sources: [{ path: 'lib/username.ts' }, { path: 'components/auth/onboarding-form.tsx', proves: ["error.code !== '23505'"] }],
      },
    ],
  },
  {
    id: 'send',
    title: 'Send a message',
    steps: [
      {
        text: 'The client generates the message UUID and renders it straight away as pending.',
        sources: [{ path: STORE, proves: ['retryId ?? crypto.randomUUID()'] }],
      },
      {
        text: 'In a DM, it seals the text on the device and sends `{ body: \'\', sealed: { v, sk, rk, iv, ct } }` instead.',
        sources: [{ path: STORE, proves: ['e2ee.seal('] }],
      },
      {
        text: 'It inserts the row through PostgREST. The insert policy requires `author_id = auth.uid()` and `can_post_channel()`, which covers membership, bans and blocks.',
        sources: [{ path: SCHEMA, proves: ['public.can_post_channel(channel_id)'] }],
      },
      {
        text: 'A `BEFORE INSERT` trigger sets `created_at` from the server clock, trims and length-checks plain text, rate-limits the author, and validates a sealed envelope against both people’s current keys.',
        sources: [{ path: E2EE_SCHEMA, proves: ['new.created_at := now();'] }],
      },
      {
        text: 'Realtime delivers the `INSERT` to everyone RLS lets read it. Recipients open sealed messages locally.',
        sources: [{ path: STORE }],
      },
      {
        text: 'A retry after a dropped connection reuses the UUID. If the first attempt landed, the duplicate fails with `23505` and the client counts it as sent.',
        sources: [{ path: STORE, proves: ["error.code !== '23505'"] }],
      },
    ],
  },
  {
    id: 'lock-in',
    title: 'Lock in',
    steps: [
      {
        text: '`lock_in()` opens a `work_sessions` row with the server’s clock, so a refresh never resets the timer.',
        sources: [{ path: LOCK_IN, proves: ['create function public.lock_in'] }],
      },
      {
        text: 'While Cabal is open, the client calls `lock_in_beat()` once a minute.',
        sources: [{ path: 'components/cabal/work-session.tsx', proves: ['BEAT_MS = 60_000'] }],
      },
      {
        text: 'If beats stop for more than 5 minutes, the session pauses as of the last beat and the gap isn’t counted. It resumes on its own when Cabal is next open.',
        sources: [{ path: RESUME, proves: ["interval '5 minutes'"] }],
      },
      {
        text: 'A session paused for more than 3 hours closes, saved with the time it actually ran.',
        sources: [{ path: RESUME, proves: ["interval '3 hours'"] }],
      },
    ],
  },
  {
    id: 'leave',
    title: 'Close Cabal',
    steps: [
      {
        text: 'On `pagehide` the client calls `presence_leave()`; the desktop app does the same when the machine suspends.',
        sources: [
          { path: STORE, proves: ["'pagehide'"] },
          { path: 'desktop/src/main.cjs', proves: ["powerMonitor.on('suspend'"] },
        ],
      },
      {
        text: `If that call never arrives, the session expires ${seconds(PRESENCE_TTL_MS)}s after its last heartbeat.`,
        sources: [{ path: 'lib/config.ts' }],
      },
      {
        text: 'The last open conversation is kept in `localStorage` under `cabal:last-open:<user id>`, on the device, not the server.',
        sources: [{ path: STORE, proves: ['cabal:last-open:'] }],
      },
    ],
  },
]

// --- End-to-end encryption ------------------------------------------------------

export const ENCRYPTION_INTRO =
  'Direct messages are end-to-end encrypted using only the Web Crypto API in browsers, Electron and Node; no third-party code touches keys. The server stores public keys and ciphertext and checks that envelopes are well formed. It never sees a private key or a plaintext message.'

export const PRIMITIVES: Fact[] = [
  {
    label: 'Identity key',
    value: 'ECDH P-256',
    body: 'One active key pair per person, generated on the device. The private key stays in IndexedDB (`cabal-e2ee`); the raw public key goes in `e2ee_keys`, one active row per user. Keys are long-lived; resetting replaces them.',
    sources: [{ path: E2EE, proves: ["namedCurve: 'P-256'"] }, { path: VAULT, proves: ["'cabal-e2ee'"] }, { path: E2EE_SCHEMA, proves: ['e2ee_keys_one_active'] }],
  },
  {
    label: 'Conversation key',
    value: 'ECDH → HKDF base key',
    body: 'Each side derives the same 256 bits from its private key and the other’s public key. Nothing is exchanged.',
    sources: [{ path: E2EE, proves: ["deriveBits({ name: 'ECDH', public: theirs }, mine, 256)"] }],
  },
  {
    label: 'Message key',
    value: 'HKDF-SHA-256 → AES-256-GCM',
    body: 'Salt `cabal-dm-v1:<channel id>`, info `message:<message id>`, random 96-bit IV. Every message has its own key, so disclosing one key discloses one message.',
    sources: [{ path: E2EE, proves: ['`message:${ctx.messageId}`', 'randomBytes(12)'] }],
  },
  {
    label: 'Associated data',
    value: 'channel | message | author | sk | rk',
    body: 'Binds the ciphertext to its conversation, message id, author and both key ids, so it can’t be moved to another message or attributed to someone else.',
    sources: [{ path: E2EE, proves: ["['cabal-dm-v1', ctx.channelId, ctx.messageId, ctx.authorId, ctx.sk, ctx.rk]"] }],
  },
  {
    label: 'Padding',
    value: '64-byte buckets · 4 KB for long text',
    body: 'A 4-byte length prefix, then zeros up to the next multiple of 64 bytes, so “ok” and a full sentence look the same size. The full text of a long message is padded in 4 KB steps.',
    sources: [{ path: E2EE, proves: ['function pad(text: string, step = 64)', 'pad(text, 4096)'] }],
  },
  {
    label: 'Long messages',
    value: 'preview + full text',
    body: 'The message carries a sealed preview with the length inside it, so the server never learns the length. The full text is sealed separately under the same per-message key with its own label (`cabal-dm-long-v1`), so the two can’t be swapped.',
    sources: [{ path: E2EE, proves: ["'cabal-dm-long-v1'"] }, { path: 'lib/long-text.ts', proves: ['export function packPreview'] }],
  },
  {
    label: 'Envelope',
    value: '{ v, sk, rk, iv, ct }',
    body: 'Stored in `messages.sealed` with an empty `body`. The insert trigger checks its exact shape and that `sk` and `rk` are the sender’s and recipient’s current keys; a stale key is refused, and the client fetches the new one and resends.',
    sources: [{ path: E2EE_SCHEMA, proves: ["array['ct', 'iv', 'rk', 'sk', 'v']"] }],
  },
]

export const DEVICE_LINK: Journey = {
  id: 'device-link',
  title: 'Adding a device',
  steps: [
    {
      text: 'The new device makes an ephemeral P-256 key and a 16-byte nonce, and publishes the key with `SHA-256(nonce)` as a commitment.',
      sources: [{ path: E2EE, proves: ['nonce: toBase64(randomBytes(16))'] }, { path: E2EE_SESSION, proves: ["rpc('e2ee_request_device'"] }],
    },
    {
      text: 'A device you already use answers with its own ephemeral key and nonce.',
      sources: [{ path: E2EE_SESSION, proves: ["rpc('e2ee_claim_device'"] }],
    },
    {
      text: 'Only then does the new device reveal its nonce, and the database checks it against the commitment. Neither side can pick its nonce after seeing the other’s, so nobody in the middle, the server included, can grind for a matching code.',
      sources: [{ path: E2EE_SCHEMA, proves: ["commitment = encode(sha256(decode(p_nonce, 'base64')), 'base64')"] }],
    },
    {
      text: 'Both screens show six digits derived from SHA-256 over both keys and both nonces. You approve only if they match.',
      sources: [{ path: E2EE, proves: ['hash.getUint32(0) % 1_000_000'] }, { path: 'components/cabal/e2ee-approve.tsx' }],
    },
    {
      text: 'The approving device seals your whole keyring (every key you’ve had) with AES-GCM under HKDF of the two ephemeral keys, and the new device opens it.',
      sources: [{ path: E2EE, proves: ['export async function sealForDevice'] }],
    },
  ],
}

export const KEY_CARE: Fact[] = [
  {
    label: 'Recovery key',
    value: '120 bits · 24 characters',
    body: 'Crockford base32 with no I, L, O or U. Look-alike characters, case, spaces and dashes are normalised on input.',
    sources: [{ path: E2EE, proves: ['RECOVERY_BYTES = 15'] }],
  },
  {
    label: 'Backup',
    value: 'AES-GCM under HKDF(recovery key)',
    body: 'Salt `cabal-recovery-v1`, info your user id; associated data binds it to you. Stored in `e2ee_backups`, readable only by its owner, and published together with each new key in one call.',
    sources: [{ path: E2EE, proves: ['cabal-recovery-v1'] }, { path: E2EE_SCHEMA, proves: ['create function public.e2ee_publish_key'] }],
  },
  {
    label: 'Security code',
    value: '12 × 5 digits · SHA-512',
    body: 'Over both user ids and public keys, in a fixed order, so both people see the same code. Clients remember each peer’s key and flag a change; a code you’ve checked is remembered for that key only.',
    sources: [{ path: E2EE, proves: ['cabal-safety-v1'] }, { path: E2EE_SESSION, proves: ['changed: seen.seen !== key.id'] }],
  },
  {
    label: 'Reporting',
    body: 'The reporter’s client sends only that message’s key. The server opens the stored ciphertext with it before filing, so a report can’t put words in anyone’s mouth, and the rest of the conversation stays sealed.',
    sources: [{ path: 'app/api/reports/sealed/route.ts', proves: ['openWithMessageKey'] }],
  },
  {
    label: 'Resetting',
    body: 'Starting over retires the old key and publishes a new one. Messages sealed to the old key stay unreadable unless some device still holds the old keyring, and your contacts see your security code change.',
    sources: [{ path: E2EE_SCHEMA, proves: ['set retired_at = now()'] }],
  },
  {
    label: 'Older messages',
    body: 'Direct messages sent before encryption shipped stay as they were and are labelled “sent before encryption”.',
    sources: [{ path: 'components/cabal/message-list.tsx', proves: ['sent before encryption'] }],
  },
]

export const ENCRYPTION_SCOPE: string[] = [
  'Rooms and team channels aren’t end-to-end encrypted. They’re protected by TLS and RLS, and the people who run a Cabal server can read them.',
  'Metadata isn’t hidden: who talks to whom, when, and the padded size of each message all pass through the server so delivery and unread counts work.',
  'Keys live only on your devices and in your recovery-key backup. Lose every device and the recovery key, and nobody can recover those messages. Clearing a browser’s site data deletes its keys.',
]

// --- Tests and CI ------------------------------------------------------------------

export const TESTING: Fact[] = [
  {
    label: 'Unit',
    value: 'tests/unit/',
    body: 'Encryption round trips and tamper cases, recovery-key parsing, presence, usernames, text handling and the sign-in route. No database needed.',
    sources: [{ path: 'tests/unit/e2ee.test.ts', proves: ["fails if it's moved to another message, author or conversation"] }],
  },
  {
    label: 'Integration',
    value: 'tests/integration/',
    body: 'Creates throwaway users on a real Supabase project, then tries to read and post where each shouldn’t be able to. Runs when a test project is configured; files run one at a time.',
    sources: [{ path: 'tests/integration/permissions.test.ts', proves: ['describe.skipIf(!run)'] }, { path: 'vitest.config.mts', proves: ['fileParallelism: false'] }],
  },
  {
    label: 'This page',
    value: 'tests/unit/docs.test.ts',
    body: 'Every path linked here must exist and every quoted snippet must still appear in its file. Change the code without updating `lib/docs.ts` and CI fails.',
    sources: [{ path: 'tests/unit/docs.test.ts' }, { path: 'lib/docs.ts' }],
  },
  {
    label: 'CI',
    value: 'GitHub Actions',
    body: 'Typecheck, tests and a production build on every push to `main` and every pull request, plus a syntax and rules check for the desktop app. Pushing a version tag builds the Mac, Windows and Linux installers.',
    sources: [{ path: '.github/workflows/ci.yml', proves: ['pnpm typecheck'] }, { path: '.github/workflows/desktop-release.yml' }],
  },
]

// --- Self-hosting and contributing -------------------------------------------------

export const RUN_YOUR_OWN: { label: string; path: string }[] = [
  { label: 'Self-hosting guide', path: 'docs/self-hosting.md' },
  { label: 'Architecture notes', path: 'docs/architecture.md' },
  { label: 'Desktop builds and releases', path: 'docs/desktop.md' },
  { label: 'Contributing', path: 'CONTRIBUTING.md' },
  { label: 'Security policy', path: 'SECURITY.md' },
  { label: 'MIT license', path: 'LICENSE' },
]

export const SELF_HOST_INTRO =
  'Cabal is MIT-licensed. Running your own needs one Supabase project, a Resend account and a Next.js host. Upgrades are `git pull`, then `pnpm db:migrate`, then deploy; migrations only add things or replace functions.'

/** A link to the file on GitHub's main branch, or null without a GitHub repo. */
export function codeUrl(path: string): string | null {
  if (!githubUrl) return null
  const folder = path.endsWith('/')
  return `${githubUrl}/${folder ? 'tree' : 'blob'}/main/${path.replace(/\/$/, '')}`
}

export const reportUrl = githubUrl ? `${githubUrl}/security/advisories/new` : null

const allFacts = () => [...STACK, ...SETUP_NOTES, ...PERMISSIONS, ...DATA_MODEL, ...PRIMITIVES, ...KEY_CARE, ...TESTING]
const allJourneys = () => [...JOURNEYS, DEVICE_LINK]

export function allSources(): Source[] {
  return [
    ...MAP.server.sources,
    ...MAP.database.sources,
    ...allFacts().flatMap((f) => f.sources ?? []),
    ...allJourneys().flatMap((j) => j.steps.flatMap((s) => s.sources ?? [])),
    ...FRESHNESS.flatMap((f) => f.sources ?? []),
    ...LAYOUT.map((l) => ({ path: l.path })),
    ...PERMISSIONS_PROOF,
    ...RUN_YOUR_OWN.map((r) => ({ path: r.path })),
  ]
}

/** Every sentence the page shows from this file, for the public-safety check. */
export function allText(): string[] {
  return [
    OVERVIEW,
    MAP.client.title,
    MAP.client.body,
    MAP.server.wire,
    MAP.server.title,
    MAP.server.body,
    MAP.database.wire,
    MAP.database.title,
    MAP.database.body,
    MAP.caption,
    PERMISSIONS_INTRO,
    PRESENCE_NOTE,
    ENCRYPTION_INTRO,
    SELF_HOST_INTRO,
    ...ENCRYPTION_SCOPE,
    ...[...SETUP, ...DEV_COMMANDS].flatMap((c) => [c.run, c.note ?? '']),
    ...LAYOUT.map((l) => l.body),
    ...FRESHNESS.flatMap((f) => [f.what, f.how, f.when]),
    ...allFacts().flatMap((f) => [f.label, f.value ?? '', f.body]),
    ...allJourneys().flatMap((j) => [j.title, ...j.steps.map((s) => s.text)]),
  ]
}
