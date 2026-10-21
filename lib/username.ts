// New members only type their name; the @username people mention them with
// is made from it and can be changed later in their profile.
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{2,24}$/

export function usernameFrom(name: string, fallback = ''): string {
  const fromName = slug(name)
  if (fromName.length >= 2) return fromName
  const fromFallback = slug(fallback)
  return fromFallback.length >= 2 ? fromFallback : 'member'
}

// Candidates to try in order when the plain one is taken.
export function usernameCandidates(base: string, count = 6, random: () => number = Math.random): string[] {
  const out = [base]
  for (let i = 0; out.length < count; i++) {
    const digits = i < 3 ? 2 + i : 4
    const suffix = String(Math.floor(random() * 10 ** digits)).padStart(digits, '0')
    out.push(`${base.slice(0, 24 - suffix.length - 1)}_${suffix}`)
  }
  return out
}

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
    .replace(/_+$/, '')
}

// Profile links: keep what looks like a link, add https:// when it's missing.
export function cleanLinks(raw: readonly string[]): string[] {
  const out: string[] = []
  for (const value of raw) {
    const v = value.trim()
    if (!v) continue
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
    try {
      const url = new URL(withScheme)
      if (!url.hostname.includes('.') || /[\s<>"']/.test(withScheme) || withScheme.length > 200) continue
      if (!out.includes(withScheme)) out.push(withScheme)
    } catch {}
  }
  return out.slice(0, 4)
}

export function linkLabel(href: string): string {
  try {
    const url = new URL(href)
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname.replace(/\/+$/, '')
    return path ? `${host}${path}` : host
  } catch {
    return href
  }
}
