import { tokenize } from './text'

// What a link card shows. Everything is plain text; images are https only so a
// card never triggers mixed-content warnings.
export type LinkPreviewData = {
  site: string
  title: string
  description: string | null
  image: string | null
}

// The first ordinary link in a message (channel links and links into the app
// itself never get a card).
export function firstPreviewableLink(body: string, appOrigins: readonly string[] = []): string | null {
  for (const t of tokenize(body, { appOrigins })) {
    if (t.type !== 'link') continue
    try {
      if (appOrigins.includes(new URL(t.href).origin)) continue
    } catch {
      continue
    }
    return t.href
  }
  return null
}

export function parsePreview(html: string, pageUrl: string): LinkPreviewData | null {
  const head = html.slice(0, 300_000)
  const meta = new Map<string, string>()
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag[0])
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase()
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content)
  }
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]

  const title = clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 160)
  if (!title) return null
  const description =
    clean(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 280) || null
  const image = httpsUrl(
    meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('twitter:image') ?? meta.get('twitter:image:src'),
    pageUrl,
  )
  let host = ''
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '')
  } catch {}
  const site = clean(meta.get('og:site_name'), 60) || host
  return { site, title, description, image }
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([^\s=<>/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = m[1].toLowerCase()
    if (!(name in out)) out[name] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return out
}

function clean(raw: string | undefined, max: number): string {
  if (!raw) return ''
  const text = decodeEntities(raw.replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function httpsUrl(raw: string | undefined, base: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(decodeEntities(raw.trim()), base)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const href = url.toString()
    return href.length <= 2048 ? href : null
  } catch {
    return null
  }
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return NAMED[code.toLowerCase()] ?? whole
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff) ? String.fromCodePoint(n) : whole
  })
}
