import { HEARTBEAT_MS, PRESENCE_TTL_MS, githubUrl } from '@/lib/config'

// Everything /docs says, in one place. Each claim points at the file that
// makes it true, and `proves` is text that must still appear in that file:
// tests/unit/docs.test.ts fails when the code changes and this page doesn't.
//
// This page is public. Keep exact abuse limits, which server jobs hold
// privileged keys, and unfixed weaknesses off it; the same test checks for
// those. Security problems go through SECURITY.md, never here.

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

export const SECTIONS = [
  { id: 'short-version', title: 'The short version' },
  { id: 'built-on', title: 'What it runs on' },
  { id: 'step-by-step', title: 'What happens when you…' },
  { id: 'who-sees-what', title: 'Who can see what' },
  { id: 'how-fresh', title: 'How quickly things update' },
  { id: 'good-to-know', title: 'Good to know' },
  { id: 'run-your-own', title: 'Run your own' },
] as const

const seconds = (ms: number) => Math.round(ms / 1000)

const SCHEMA = 'supabase/migrations/0001_cabal.sql'
const BOARD = 'supabase/migrations/0014_build_cabal_opportunities.sql'
const LOCK_IN = 'supabase/migrations/0009_lock_in.sql'
const RESUME = 'supabase/migrations/0010_lock_in_auto_resume.sql'
const STORE = 'components/cabal/store.tsx'
const E2EE = 'lib/e2ee/crypto.ts'
const E2EE_SCHEMA = 'supabase/migrations/0017_dm_encryption.sql'
const SIGN_IN = 'app/api/auth/code/route.ts'

export const BUILT_ON: Fact[] = [
  {
    label: 'The app you use',
    body: 'Next.js and React. The same app runs in a browser tab and inside the desktop app.',
    sources: [{ path: 'app/' }, { path: STORE }],
  },
  {
    label: 'Your data and its rules',
    body: 'A Postgres database on Supabase. The rules about who can read and write each thing are written into the database itself, so no app, modified or not, can get around them.',
    sources: [{ path: 'supabase/migrations/' }],
  },
  {
    label: 'Signing in',
    body: 'A one-time code we email you, checked by Supabase. There are no passwords to leak.',
    sources: [{ path: SIGN_IN }, { path: 'lib/email.ts' }],
  },
  {
    label: 'Live updates',
    body: 'A connection that stays open (Supabase Realtime), so messages and who’s online arrive without refreshing. Typing indicators are passed along and never stored.',
    sources: [{ path: STORE }, { path: 'hooks/use-typing.ts' }],
  },
  {
    label: 'Profile photos',
    body: 'Supabase Storage. Only you can upload to your own folder.',
    sources: [{ path: 'lib/avatar.ts' }, { path: SCHEMA, proves: ['(storage.foldername(name))[1] = auth.uid()::text'] }],
  },
  {
    label: 'Hosting',
    body: 'Vercel sends the pages and runs a few small server jobs, like emailing your sign-in code. Resend delivers the emails.',
    sources: [{ path: 'app/api/' }],
  },
  {
    label: 'Desktop app',
    body: 'Electron. A window around cabal.city, plus a tray icon, an unread badge and the corner timer.',
    sources: [{ path: 'desktop/src/main.cjs' }],
  },
  {
    label: 'Checks on every change',
    body: 'GitHub Actions type-checks, tests and builds every change. Tagging a release builds the Mac, Windows and Linux downloads.',
    sources: [{ path: '.github/workflows/ci.yml' }, { path: '.github/workflows/desktop-release.yml' }],
  },
]

export const JOURNEYS: Journey[] = [
  {
    id: 'sign-in',
    title: 'Signing in',
    steps: [
      {
        text: 'You type your email. Our server limits how many codes one email address, or one network, can ask for.',
        sources: [{ path: SIGN_IN }],
      },
      {
        text: 'To count them, it keeps a scrambled (hashed) copy of the email and network address, and deletes it after a day.',
        sources: [{ path: SIGN_IN, proves: ['since(24 * 60)'] }],
      },
      {
        text: 'It asks Supabase for a one-time code and emails it to you through Resend.',
        sources: [{ path: 'lib/email.ts' }],
      },
      {
        text: 'You type the code. Supabase checks it and gives your browser a sign-in cookie. Signing up directly with Supabase is switched off, so this is the only way in.',
        sources: [{ path: 'docs/self-hosting.md' }],
      },
      {
        text: 'The first time, you type your name and pick a role. Your @username is made from your name, and you can change it later.',
        sources: [{ path: 'components/auth/onboarding-form.tsx' }, { path: 'lib/username.ts' }],
      },
    ],
  },
  {
    id: 'message',
    title: 'Sending a message',
    steps: [
      {
        text: 'Your app gives the message its own ID and shows it straight away, marked as sending.',
        sources: [{ path: 'hooks/use-messages.ts' }],
      },
      {
        text: 'In a direct message, your app first encrypts the text on your device, for exactly the two of you. The database only ever gets something your two devices can open.',
        sources: [
          { path: E2EE, proves: ["name: 'AES-GCM'"] },
          { path: STORE, proves: ['e2ee.seal('] },
        ],
      },
      {
        text: 'It saves the message directly to the database. Before accepting it, the database checks you’re allowed in that conversation and, in a direct message, that neither of you has blocked the other.',
        sources: [{ path: SCHEMA }],
      },
      {
        text: 'The database sets the time itself, trims the text, and limits how fast one person can post.',
        sources: [{ path: SCHEMA }],
      },
      {
        text: 'Everyone allowed to read it receives it over their live connection, filtered by the same rules.',
        sources: [{ path: STORE }],
      },
      {
        text: 'If your connection drops while sending, the app tries again with the same ID, so the message can’t arrive twice.',
        sources: [{ path: 'hooks/use-messages.ts' }],
      },
    ],
  },
  {
    id: 'new-device',
    title: 'Using a new device',
    steps: [
      {
        text: 'The keys that open your direct messages are made on your device and only ever kept on your devices. A new one starts with direct messages locked; rooms and teams work straight away.',
        sources: [{ path: 'lib/e2ee/vault.ts' }],
      },
      {
        text: 'To unlock it, approve it from a device you already use. Both screens show the same six digits, and you approve only if they match.',
        sources: [{ path: 'components/cabal/e2ee-approve.tsx' }],
      },
      {
        text: 'Each device commits to its part of that code before seeing the other’s, so nobody in between, including us, can slip in a key of their own and fake a match.',
        sources: [{ path: E2EE_SCHEMA, proves: ["commitment = encode(sha256(decode(p_nonce, 'base64')), 'base64')"] }],
      },
      {
        text: 'No other device to hand? Your recovery key opens a backup of your keys. The backup is locked with that key, and only you have it.',
        sources: [{ path: E2EE, proves: ['cabal-recovery-v1'] }],
      },
      {
        text: 'Lost both? You can start over with new keys. Earlier direct messages then stay unreadable for good, and the people you talk to see your security code change.',
      },
    ],
  },
  {
    id: 'lock-in',
    title: 'Locking in',
    steps: [
      {
        text: 'One tap starts a session. The start time comes from the server, so refreshing doesn’t reset your timer.',
        sources: [{ path: LOCK_IN }],
      },
      {
        text: 'While Cabal is open, it checks in once a minute.',
        sources: [{ path: 'components/cabal/work-session.tsx', proves: ['BEAT_MS = 60_000'] }],
      },
      {
        text: 'If Cabal goes quiet for more than 5 minutes (closed, or the computer asleep), the session pauses at the moment it went quiet. That time isn’t counted.',
        sources: [{ path: RESUME, proves: ["interval '5 minutes'"] }],
      },
      {
        text: 'When you come back, it picks up on its own and tells you how long you were away.',
      },
      {
        text: 'A session paused for more than 3 hours ends at the moment it paused.',
        sources: [{ path: RESUME, proves: ["interval '3 hours'"] }],
      },
    ],
  },
  {
    id: 'leave',
    title: 'Closing Cabal',
    steps: [
      {
        text: 'Closing the tab or quitting the desktop app tells the server you’ve gone, and your light goes off. The desktop app does the same when your computer goes to sleep.',
        sources: [
          { path: STORE, proves: ["'pagehide'"] },
          { path: 'desktop/src/main.cjs', proves: ["powerMonitor.on('suspend'"] },
        ],
      },
      {
        text: `If that never arrives (a crash, or the Wi-Fi drops), your light goes off by itself ${seconds(PRESENCE_TTL_MS)} seconds after your last check-in. Open windows check in every ${seconds(HEARTBEAT_MS)} seconds.`,
        sources: [{ path: 'lib/config.ts' }],
      },
      {
        text: 'Next time, your sign-in cookie keeps you signed in and the conversation you had open reopens. That’s remembered on your own device, not on our server.',
        sources: [{ path: STORE, proves: ['cabal:last-open:'] }],
      },
    ],
  },
]

export const WHO_SEES_WHAT: Fact[] = [
  { label: 'Rooms', body: 'Every signed-in member of the community.' },
  { label: 'Public teams', body: 'Anyone in the community who joins, including messages from before they joined.' },
  { label: 'Invite-only teams', body: 'Only the people on the team.' },
  {
    label: 'Direct messages',
    body: 'Only the two of you. They’re end-to-end encrypted, so community admins, the team that runs cabal.city and anyone who got into the database can’t read them.',
    sources: [
      { path: SCHEMA, proves: ['p.channel_id = c.id and p.user_id = auth.uid()'] },
      { path: E2EE_SCHEMA, proves: ['new.body := \'\''] },
    ],
  },
  {
    label: 'Your profile',
    body: 'Your name, role, photo, what you’re building and your links: people in your community.',
  },
  {
    label: 'Build Cabal ideas',
    body: 'Every member. What you send with “Send feedback” goes only to the community admins.',
    sources: [{ path: BOARD, proves: ['on_board and (hidden_at is null and public.is_any_member()'] }],
  },
  {
    label: 'Your email',
    body: 'Never shown in Cabal. It’s used to send your sign-in codes, and included when you send feedback so the team can write back.',
    sources: [{ path: 'app/api/feedback/route.ts', proves: ['email: user.email ?? null'] }],
  },
  {
    label: 'Your status and lock-ins',
    body: 'People in your community. Go invisible and nothing is shared: your presence is deleted, not hidden.',
    sources: [{ path: LOCK_IN, proves: ["coalesce(us.availability, 'online') <> 'invisible'"] }],
  },
]

export const WHO_SEES_WHAT_PROOF: Source[] = [{ path: SCHEMA }, { path: 'tests/integration/permissions.test.ts' }]

export const FRESHNESS: Fact[] = [
  {
    label: 'Messages and typing',
    value: 'Instantly',
    body: 'Pushed over your live connection.',
    sources: [{ path: STORE }],
  },
  {
    label: 'Someone coming online',
    value: 'Instantly',
    body: 'Their first check-in is pushed to everyone.',
    sources: [{ path: STORE }],
  },
  {
    label: 'Someone going offline',
    value: `Instantly, or up to ${seconds(PRESENCE_TTL_MS)}s`,
    body: 'Instantly when they close Cabal, or after the timeout if their app crashed or lost its connection.',
    sources: [{ path: 'lib/config.ts' }],
  },
  {
    label: 'Who’s locked in',
    value: 'Within 30 seconds',
    body: 'Checked every 30 seconds rather than pushed.',
    sources: [{ path: 'hooks/use-lock-ins.ts', proves: ['refreshInterval: 30_000'] }],
  },
  {
    label: 'Team members',
    value: 'Within a minute',
    body: 'Checked every minute while a team is open.',
    sources: [{ path: 'components/cabal/team-dialogs.tsx', proves: ['refreshInterval: 60_000'] }],
  },
  {
    label: 'People joining or leaving',
    value: 'Within 2 minutes',
    body: 'The member list is checked every 2 minutes.',
    sources: [{ path: STORE, proves: ['refreshInterval: 120_000'] }],
  },
  {
    label: 'A new version of the site',
    value: 'Within 10 minutes',
    body: 'Open windows show an “updated” bar so you can reload when it suits you.',
    sources: [{ path: 'components/cabal/update-bar.tsx', proves: ['refreshInterval: 10 * 60_000'] }],
  },
  {
    label: 'Desktop app updates',
    value: 'Every 6 hours',
    body: 'On Windows and Linux. Mac downloads aren’t signed yet, so on a Mac you download the new version yourself.',
    sources: [{ path: 'desktop/src/main.cjs', proves: ['6 * 60 * 60 * 1000'] }],
  },
]

export const GOOD_TO_KNOW: Fact[] = [
  {
    label: 'Online means open, not at the keyboard',
    body: 'We don’t watch your keyboard or mouse, on purpose. Someone can show as online while they’re away from their desk. Away is something you choose.',
  },
  {
    label: 'Rooms and teams aren’t end-to-end encrypted',
    body: 'Direct messages are. Rooms and team rooms are encrypted on their way to our servers, but the small team that runs cabal.city could technically read them, and only does so to keep the service running or when the law requires it.',
  },
  {
    label: 'Encryption hides what you say, not that you talked',
    body: 'Who you message and when still pass through our servers, because that’s how messages get delivered and unread counts work.',
  },
  {
    label: 'Keep your recovery key',
    body: 'If you lose every device you’re signed in on and your recovery key, nobody can get those direct messages back, including us. Clearing a browser’s site data removes its keys too.',
    sources: [{ path: 'components/cabal/e2ee-recovery.tsx' }],
  },
  {
    label: 'Reporting a direct message shares only that message',
    body: 'Your app gives the admins the key to that one message, and the server checks it opens what was actually sent before filing the report. The rest of the conversation stays sealed.',
    sources: [{ path: 'app/api/reports/sealed/route.ts', proves: ['openWithMessageKey'] }],
  },
  {
    label: 'Older direct messages',
    body: 'Ones sent before encryption arrived stay as they were, and are marked “sent before encryption”.',
    sources: [{ path: 'components/cabal/message-list.tsx', proves: ['sent before encryption'] }],
  },
  {
    label: 'Mac downloads aren’t signed yet',
    body: 'macOS warns you the first time you open Cabal, and Macs don’t get automatic updates until the app is signed.',
    sources: [{ path: 'docs/desktop.md' }],
  },
]

export const RUN_YOUR_OWN: { label: string; path: string }[] = [
  { label: 'Self-hosting guide', path: 'docs/self-hosting.md' },
  { label: 'How the code fits together', path: 'docs/architecture.md' },
  { label: 'Contributing', path: 'CONTRIBUTING.md' },
  { label: 'Security policy', path: 'SECURITY.md' },
  { label: 'MIT license', path: 'LICENSE' },
]

/** A link to the file on GitHub's main branch, or null without a GitHub repo. */
export function codeUrl(path: string): string | null {
  if (!githubUrl) return null
  const folder = path.endsWith('/')
  return `${githubUrl}/${folder ? 'tree' : 'blob'}/main/${path.replace(/\/$/, '')}`
}

export const reportUrl = githubUrl ? `${githubUrl}/security/advisories/new` : null

const allFacts = () => [...BUILT_ON, ...WHO_SEES_WHAT, ...FRESHNESS, ...GOOD_TO_KNOW]

export function allSources(): Source[] {
  return [
    ...allFacts().flatMap((f) => f.sources ?? []),
    ...JOURNEYS.flatMap((j) => j.steps.flatMap((s) => s.sources ?? [])),
    ...WHO_SEES_WHAT_PROOF,
    ...RUN_YOUR_OWN.map((r) => ({ path: r.path })),
  ]
}

/** Every sentence the page shows from this file, for the public-safety check. */
export function allText(): string[] {
  return [
    ...allFacts().flatMap((f) => [f.label, f.value ?? '', f.body]),
    ...JOURNEYS.flatMap((j) => [j.title, ...j.steps.map((s) => s.text)]),
  ]
}
