// Long messages: anything too big to read comfortably in the conversation is
// sent whole, exactly as typed, and shown as a compact card that opens in a
// reader. Limits here match supabase/migrations/0019_long_messages.sql.

import { MESSAGE_MAX } from './config'

/** Messages up to this many characters (and lines) stay ordinary inline messages. */
export const INLINE_MAX_CHARS = MESSAGE_MAX
export const INLINE_MAX_LINES = 80
/** The most one message can carry. */
export const LONG_TEXT_MAX = 200_000
/** How much of a long message rides along with it as its preview. */
export const PREVIEW_CHARS = 600

/** Characters as people (and Postgres' char_length) count them, not UTF-16 units. */
export function charCount(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) i++
    }
    n++
  }
  return n
}

export function lineCount(text: string): number {
  if (!text) return 0
  let n = 1
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

export function isLong(text: string): boolean {
  return charCount(text) > INLINE_MAX_CHARS || lineCount(text) > INLINE_MAX_LINES
}

/**
 * The text a long message is stored as. Nothing inside it changes: only blank
 * lines before it, trailing whitespace after it, and NUL characters (which no
 * database text column can hold) are left out.
 */
export function longBody(raw: string): string {
  return raw.replace(/\u0000/g, '').replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd()
}

// Never ends on half of a surrogate pair.
function sliceChars(text: string, max: number): string {
  let out = text.slice(0, max)
  const last = out.charCodeAt(out.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
  return out
}

/** The start of the text, for the card in the conversation. */
export function previewOf(text: string): string {
  return sliceChars(text.trimStart(), PREVIEW_CHARS).trimEnd()
}

const HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/
const LABEL = /^\s*(?:title|subject|name)\s*:\s*(.+)$/i

function tidy(line: string): string {
  return line
    .replace(/^\s*(?:[-*+>]|\d+[.)])\s+/, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A title if the text has an obvious one: a Markdown heading or "Title:" line
 * near the top, or a short first line. Otherwise null.
 */
export function titleOf(text: string): string | null {
  const lines = text.split('\n', 24)
  for (const line of lines) {
    const m = line.match(HEADING) ?? line.match(LABEL)
    if (m) {
      const t = tidy(m[1])
      if (t) return t.length > 90 ? `${sliceChars(t, 89)}…` : t
    }
  }
  const first = lines.find((l) => l.trim())
  if (!first || /^\s*(```|~~~|[{[<])/.test(first)) return null
  const t = tidy(first)
  return t && t.length <= 70 && !/[.,;:]$/.test(t) ? t : null
}

/** The preview without the line the title came from, so the card doesn't say it twice. */
export function excerptAfterTitle(preview: string, title: string | null): string {
  if (!title) return preview
  const lines = preview.split('\n')
  const i = lines.findIndex((l) => l.trim())
  if (i >= 0) {
    const line = lines[i]
    const m = line.match(HEADING) ?? line.match(LABEL)
    if (tidy(m ? m[1] : line).startsWith(title.replace(/…$/, ''))) return lines.slice(i + 1).join('\n').replace(/^\s*\n/, '')
  }
  return preview
}

/** Case-insensitive matches as [start, end) offsets, capped so huge texts stay responsive. */
export function findMatches(text: string, query: string, cap = 2000): [number, number][] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hay = text.toLowerCase()
  // Lower-casing can change length for a few scripts; fall back to exact case then.
  const source = hay.length === text.length ? hay : text
  const needle = source === hay ? q : query.trim()
  const out: [number, number][] = []
  for (let i = source.indexOf(needle); i !== -1 && out.length < cap; i = source.indexOf(needle, i + needle.length)) {
    out.push([i, i + needle.length])
  }
  return out
}

export function looksLikeMarkdown(text: string): boolean {
  return /^\s{0,3}(#{1,6}\s|```|~~~|[-*+]\s+\S|\d+\.\s+\S|>\s)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/m.test(text.slice(0, 20_000))
}

export function formatCount(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
}

export function fileName(title: string | null, ext: 'md' | 'txt'): string {
  const base =
    (title ?? 'cabal-message')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cabal-message'
  return `${base}.${ext}`
}

// --- Direct messages ---------------------------------------------------------------
// A sealed long message carries its preview and length inside the encryption,
// so the server never learns either.

export type SealedPreview = { v: 1; chars: number; preview: string }

export function packPreview(text: string): string {
  const payload: SealedPreview = { v: 1, chars: charCount(text), preview: previewOf(text) }
  return JSON.stringify(payload)
}

export function unpackPreview(raw: string): SealedPreview | null {
  try {
    const p = JSON.parse(raw) as Partial<SealedPreview>
    if (p.v !== 1 || typeof p.preview !== 'string' || !Number.isInteger(p.chars) || (p.chars as number) < 1) return null
    return { v: 1, chars: p.chars as number, preview: p.preview }
  } catch {
    return null
  }
}
