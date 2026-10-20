// Everything specific to one deployment lives here and in environment
// variables. Running Cabal for another community means changing env vars
// and supabase/seed.sql, not the code.

export const config = {
  appName: 'Cabal',
  communitySlug: process.env.NEXT_PUBLIC_CABAL_COMMUNITY ?? 'chicago-ai',
  appUrl: process.env.NEXT_PUBLIC_CABAL_APP_URL ?? '',
  githubRepo: process.env.NEXT_PUBLIC_CABAL_GITHUB_REPO ?? '',
}

export const githubUrl = config.githubRepo ? `https://github.com/${config.githubRepo}` : ''

// Presence: each open session pings every HEARTBEAT_MS. A session counts as
// connected while its last ping is newer than PRESENCE_TTL_MS. Browsers may
// slow background timers to once a minute, so the TTL leaves room for that.
export const HEARTBEAT_MS = 25_000
export const PRESENCE_TTL_MS = 90_000

export const MESSAGE_MAX = 4000
export const STATUS_MAX = 80
