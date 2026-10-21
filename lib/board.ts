export type IdeaStatus = 'requested' | 'building' | 'shipped'

export type Idea = {
  id: string
  title: string
  body: string | null
  status: IdeaStatus
  status_at: string | null
  created_at: string
  author_id: string
  github_url: string | null
  hidden: boolean
  votes: number
  comments: number
  voted: boolean
}

export type Ship = {
  id: string
  title: string
  body: string | null
  shipped_at: string
  github_url: string | null
  idea_id: string | null
  suggested_by: string | null
}

export type IdeaComment = { id: string; author_id: string; body: string; created_at: string; mine: boolean }

export type BoardTab = 'popular' | 'recent' | 'shipped'

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  requested: 'Requested',
  building: 'Building',
  shipped: 'Shipped',
}

// Shipped ideas move to their own tab; the other two only hold open ones.
export function arrangeIdeas(ideas: Idea[], tab: Exclude<BoardTab, 'shipped'>): Idea[] {
  const open = ideas.filter((i) => i.status !== 'shipped')
  if (tab === 'recent') return open.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return open.sort(
    (a, b) =>
      b.votes - a.votes ||
      (a.status === 'building' ? 0 : 1) - (b.status === 'building' ? 0 : 1) ||
      Date.parse(b.created_at) - Date.parse(a.created_at),
  )
}

// Cabal ships from Chicago, so "today" is a Chicago day for everyone.
export const SHIP_ZONE = 'America/Chicago'

export function zoneDay(iso: string | number, zone = SHIP_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  )
}

// Only calls it today's ship when it really shipped today.
export function shipHeading(shippedAt: string, now = Date.now()): string {
  const day = zoneDay(shippedAt)
  if (day === zoneDay(now)) return 'Today’s ship'
  if (day === zoneDay(now - 86_400_000)) return 'Yesterday’s ship'
  return 'Latest ship'
}

export function shortDate(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  })
}

export function githubLabel(url: string): string {
  const m = url.match(/github\.com\/[^/]+\/[^/]+\/(pull|issues)\/(\d+)/)
  if (!m) return 'GitHub'
  return `${m[1] === 'pull' ? 'PR' : 'Issue'} #${m[2]}`
}

export function isGithubUrl(url: string): boolean {
  return /^https:\/\/github\.com\/\S+$/.test(url.trim())
}

// Text from the old feedback box becomes a title plus an optional description.
export function splitSuggestion(text: string): { title: string; body: string } {
  const clean = text.trim()
  const [first, ...rest] = clean.split(/\n+/)
  if (first.length <= 120) return { title: first.trim(), body: rest.join('\n').trim() }
  return { title: '', body: clean }
}
