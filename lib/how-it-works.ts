import { HEARTBEAT_MS, PRESENCE_TTL_MS, githubUrl } from '@/lib/config'

// Everything /how-it-works says, in one place. Each claim points at the file
// that makes it true. `proves` is text that must still appear in that file;
// tests/unit/how-it-works.test.ts fails when the code changes and this page
// doesn't, so the page can't quietly go stale.

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
  { id: 'not-great-yet', title: "What isn't great yet" },
  { id: 'run-your-own', title: 'Run your own' },
] as const

const seconds = (ms: number) => Math.round(ms / 1000)

const SCHEMA = 'supabase/migrations/0001_cabal.sql'
const STORE = 'components/cabal/store.tsx'
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
    body: 'Vercel sends the pages and runs a handful of small server jobs that need a master key: emailing sign-in codes, passing on feedback and deleting accounts. Resend delivers the emails.',
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
        text: 'You type your email. Our server first checks it hasn’t sent too many codes: at most 5 per email every 15 minutes, and 30 per network every hour.',
        sources: [{ path: SIGN_IN, proves: ['PER_EMAIL = { count: 5, minutes: 15 }', 'PER_IP = { count: 30, minutes: 60 }'] }],
      },
      {
        text: 'To count them, it keeps a scrambled (hashed) copy of the email and network address, and deletes it after 24 hours.',
        sources: [{ path: SIGN_IN, proves: ['since(24 * 60)'] }],
      },
      {
        text: 'It asks Supabase for a one-time 8-digit code and emails it to you through Resend.',
        sources: [{ path: 'lib/email.ts' }],
      },
      {
        text: 'You type the code. Supabase checks it and gives your browser a sign-in cookie. Accounts can only be created this way: signing up directly with Supabase is switched off.',
        sources: [{ path: 'proxy.ts' }, { path: 'docs/self-hosting.md' }],
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
        text: 'It saves the message directly to the database. Before accepting it, the database checks you’re allowed in that conversation and, in a direct message, that neither of you has blocked the other.',
        sources: [{ path: SCHEMA }],
      },
      {
        text: 'The database sets the time itself, trims the text, and allows each person up to 15 messages every 20 seconds.',
        sources: [{ path: SCHEMA, proves: ["interval '20 seconds'", 'recent >= 15'] }],
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
    id: 'lock-in',
    title: 'Locking in',
    steps: [
      {
        text: 'One tap starts a session. The start time comes from the server, so refreshing doesn’t reset your timer.',
        sources: [{ path: 'supabase/migrations/0009_lock_in.sql' }],
      },
      {
        text: 'While Cabal is open, it checks in once a minute.',
        sources: [{ path: 'components/cabal/work-session.tsx', proves: ['BEAT_MS = 60_000'] }],
      },
      {
        text: 'If Cabal goes quiet for more than 5 minutes (closed, or the computer asleep), the session pauses at the moment it went quiet. That time isn’t counted.',
        sources: [{ path: 'supabase/migrations/0010_lock_in_auto_resume.sql', proves: ["interval '5 minutes'"] }],
      },
      {
        text: 'When you come back, it picks up on its own and tells you how long you were away.',
      },
      {
        text: 'A session paused for more than 3 hours ends at the moment it paused.',
        sources: [{ path: 'supabase/migrations/0010_lock_in_auto_resume.sql', proves: ["interval '3 hours'"] }],
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
  { label: 'Direct messages', body: 'Only the two of you. Community admins can’t read them.' },
  { label: 'Your email', body: 'Not shown to other members. It’s used to send you sign-in codes.' },
  {
    label: 'Your status and lock-ins',
    body: 'Members of the community. Go invisible and nothing is shared: your presence is deleted, not hidden.',
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

export const NOT_GREAT_YET: Fact[] = [
  {
    label: 'Built for a city, not a country',
    body: 'Cabal is comfortable with a few hundred people online at once. Every open window’s “still here” check-in is sent to everyone, so well beyond that, online status needs rebuilding. Messages would hold up fine.',
    sources: [{ path: STORE }],
  },
  {
    label: 'Online means open, not at the keyboard',
    body: 'We don’t watch your keyboard or mouse, on purpose. Someone can show as online while they’re away from their desk. Away is something you choose.',
  },
  {
    label: 'Mac downloads aren’t signed',
    body: 'macOS warns you the first time you open Cabal, and Macs don’t get automatic updates until the app is signed.',
    sources: [{ path: 'docs/desktop.md' }],
  },
  {
    label: 'Database changes are applied by hand',
    body: 'When a release changes the database, someone on the team runs that change before the new code goes out. It isn’t automated yet.',
    sources: [{ path: 'scripts/db.mjs' }],
  },
]

export const RUN_YOUR_OWN: { label: string; path: string }[] = [
  { label: 'Self-hosting guide', path: 'docs/self-hosting.md' },
  { label: 'How the code fits together', path: 'docs/architecture.md' },
  { label: 'Contributing', path: 'CONTRIBUTING.md' },
  { label: 'MIT license', path: 'LICENSE' },
]

export const SECURITY_POLICY = 'SECURITY.md'

/** The commit the running site was built from, when Vercel tells us. */
export const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? ''

/** A link to a file at the exact version that's running, or null without a GitHub repo. */
export function codeUrl(path: string): string | null {
  if (!githubUrl) return null
  const folder = path.endsWith('/')
  return `${githubUrl}/${folder ? 'tree' : 'blob'}/${BUILD_SHA || 'main'}/${path.replace(/\/$/, '')}`
}

export function allSources(): Source[] {
  return [
    ...BUILT_ON.flatMap((f) => f.sources ?? []),
    ...JOURNEYS.flatMap((j) => j.steps.flatMap((s) => s.sources ?? [])),
    ...WHO_SEES_WHAT_PROOF,
    ...FRESHNESS.flatMap((f) => f.sources ?? []),
    ...NOT_GREAT_YET.flatMap((f) => f.sources ?? []),
    ...RUN_YOUR_OWN.map((r) => ({ path: r.path })),
    { path: SECURITY_POLICY },
  ]
}
