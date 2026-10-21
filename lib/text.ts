// Message text is rendered as plain React text nodes (React escapes it), so
// the only markup we ever create is <a> for http(s) links, a highlight for
// @mentions and a button for channel links. Nothing here produces HTML strings.

// A mention is either a stored person reference (<@user-id>, from the @ picker)
// or a typed @username. Exactly one of userId / username is set.
export type Token =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string }
  | { type: 'mention'; value: string; userId: string | null; username: string | null }
  | { type: 'channel'; value: string; channelId: string }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATTERN = new RegExp(
  `<([#@])(${UUID})>|(https?:\\/\\/[^\\s<>"']+)|(?<![A-Za-z0-9_])@([A-Za-z0-9_]{2,24})\\b`,
  'gi',
)
const TRAILING = /[).,!?:;'"\]]+$/
const CHANNEL_REF = new RegExp(`<#(${UUID})>`, 'gi')
const PERSON_REF = new RegExp(`<@(${UUID})>`, 'gi')
const CHANNEL_PARAM = new RegExp(`^${UUID}$`, 'i')

// Messages store a channel link as <#id>, so renaming a team never breaks old
// links and an invite-only team's name is only ever shown to people on it.
export function channelRef(channelId: string): string {
  return `<#${channelId.toLowerCase()}>`
}

// …and a mention as <@id>, so it always shows the person's current name.
export function personRef(userId: string): string {
  return `<@${userId.toLowerCase()}>`
}

// A pasted link to a conversation in this app (…/app?c=<id>) reads as a
// channel link too. `origins` are the app's own origins, e.g. the current one.
export function channelIdFromUrl(href: string, origins: readonly string[]): string | null {
  try {
    const url = new URL(href)
    if (!origins.includes(url.origin) || url.pathname.replace(/\/+$/, '') !== '/app') return null
    const c = url.searchParams.get('c')
    return c && CHANNEL_PARAM.test(c) ? c.toLowerCase() : null
  } catch {
    return null
  }
}

// For places that can only show plain text: notifications, previews, excerpts.
export function plainText(
  body: string,
  label: (channelId: string) => string,
  person: (userId: string) => string = () => '@member',
): string {
  return body
    .replace(CHANNEL_REF, (_, id: string) => label(id.toLowerCase()))
    .replace(PERSON_REF, (_, id: string) => person(id.toLowerCase()))
}

export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function tokenize(body: string, opts: { appOrigins?: readonly string[] } = {}): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const match of body.matchAll(PATTERN)) {
    const start = match.index ?? 0
    let value = match[0]
    if (match[1]) {
      if (start > last) tokens.push({ type: 'text', value: body.slice(last, start) })
      const id = match[2].toLowerCase()
      tokens.push(
        match[1] === '#'
          ? { type: 'channel', value, channelId: id }
          : { type: 'mention', value, userId: id, username: null },
      )
      last = start + value.length
    } else if (match[3]) {
      // Leave trailing punctuation out of the link, but keep balanced parens.
      const trail = value.match(TRAILING)?.[0] ?? ''
      let cut = trail.length
      if (trail.startsWith(')') && (value.match(/\(/g)?.length ?? 0) >= (value.match(/\)/g)?.length ?? 0)) cut -= 1
      if (cut > 0) value = value.slice(0, value.length - cut)
      const href = safeHref(value)
      if (!href) continue
      if (start > last) tokens.push({ type: 'text', value: body.slice(last, start) })
      const channelId = opts.appOrigins ? channelIdFromUrl(href, opts.appOrigins) : null
      tokens.push(channelId ? { type: 'channel', value, channelId } : { type: 'link', value, href })
      last = start + value.length
    } else {
      if (start > last) tokens.push({ type: 'text', value: body.slice(last, start) })
      tokens.push({ type: 'mention', value, userId: null, username: match[4] })
      last = start + value.length
    }
  }
  if (last < body.length) tokens.push({ type: 'text', value: body.slice(last) })
  return tokens
}

export function isMentionOf(
  t: Extract<Token, { type: 'mention' }>,
  me: { id?: string | null; username?: string | null },
): boolean {
  if (t.userId) return !!me.id && t.userId === me.id.toLowerCase()
  return !!me.username && !!t.username && t.username.toLowerCase() === me.username.toLowerCase()
}

export function mentions(body: string, me: { id?: string | null; username?: string | null }): boolean {
  if (!me.id && !me.username) return false
  return tokenize(body).some((t) => t.type === 'mention' && isMentionOf(t, me))
}

export function cleanBody(raw: string): string {
  // Strip control characters except newline/tab and collapse runs of blank lines.
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}
