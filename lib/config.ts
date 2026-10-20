// Everything specific to one deployment lives here and in environment
// variables. Running Cabal for another community means changing env vars
// and supabase/seed.sql, not the code.

// Accept "cabal.city", "https://cabal.city/" and the like.
export function normalizeAppUrl(value: string | undefined): string {
  const v = (value ?? '').trim().replace(/\/+$/, '')
  if (!v) return ''
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

// Accept "owner/repo" or a full GitHub URL.
export function normalizeGithubRepo(value: string | undefined): string {
  const v = (value ?? '').trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  return /^[\w.-]+\/[\w.-]+$/.test(v) ? v : ''
}

export const config = {
  appName: 'Cabal',
  communitySlug: (process.env.NEXT_PUBLIC_CABAL_COMMUNITY ?? '').trim() || 'chicago',
  appUrl: normalizeAppUrl(process.env.NEXT_PUBLIC_CABAL_APP_URL),
  githubRepo: normalizeGithubRepo(process.env.NEXT_PUBLIC_CABAL_GITHUB_REPO),
}

export const githubUrl = config.githubRepo ? `https://github.com/${config.githubRepo}` : ''

// Presence: each open session pings every HEARTBEAT_MS. A session counts as
// connected while its last ping is newer than PRESENCE_TTL_MS. Browsers may
// slow background timers to once a minute, so the TTL leaves room for that.
export const HEARTBEAT_MS = 25_000
export const PRESENCE_TTL_MS = 90_000

export const MESSAGE_MAX = 4000
export const STATUS_MAX = 80
