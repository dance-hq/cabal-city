// Message text is rendered as plain React text nodes (React escapes it), so
// the only markup we ever create is <a> for http(s) links and a highlight
// for @mentions. Nothing here produces HTML strings.

export type Token =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'mention'; value: string; username: string }

const PATTERN = /(https?:\/\/[^\s<>"']+)|(?<![A-Za-z0-9_])@([A-Za-z0-9_]{2,24})\b/g
const TRAILING = /[).,!?:;'"\]]+$/

export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function tokenize(body: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const match of body.matchAll(PATTERN)) {
    const start = match.index ?? 0
    let value = match[0]
    if (match[1]) {
      // Leave trailing punctuation out of the link, but keep balanced parens.
      const trail = value.match(TRAILING)?.[0] ?? ''
      let cut = trail.length
      if (trail.startsWith(')') && (value.match(/\(/g)?.length ?? 0) >= (value.match(/\)/g)?.length ?? 0)) cut -= 1
      if (cut > 0) value = value.slice(0, value.length - cut)
      const href = safeHref(value)
      if (!href) continue
      if (start > last) tokens.push({ type: 'text', value: body.slice(last, start) })
      tokens.push({ type: 'link', value, href })
      last = start + value.length
    } else {
      if (start > last) tokens.push({ type: 'text', value: body.slice(last, start) })
      tokens.push({ type: 'mention', value, username: match[2] })
      last = start + value.length
    }
  }
  if (last < body.length) tokens.push({ type: 'text', value: body.slice(last) })
  return tokens
}

export function mentions(body: string, username: string | null | undefined): boolean {
  if (!username) return false
  const lower = username.toLowerCase()
  return tokenize(body).some((t) => t.type === 'mention' && t.username.toLowerCase() === lower)
}

export function cleanBody(raw: string): string {
  // Strip control characters except newline/tab and collapse runs of blank lines.
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}
