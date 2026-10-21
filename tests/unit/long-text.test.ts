import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  charCount,
  excerptAfterTitle,
  fileName,
  findMatches,
  INLINE_MAX_CHARS,
  INLINE_MAX_LINES,
  isLong,
  LONG_TEXT_MAX,
  longBody,
  looksLikeMarkdown,
  packPreview,
  PREVIEW_CHARS,
  previewOf,
  titleOf,
  unpackPreview,
} from '@/lib/long-text'
import { MESSAGE_MAX } from '@/lib/config'
import {
  conversationKey,
  exportPublicKey,
  newKeyPair,
  openLongText,
  openMessage,
  sealLongText,
  sealMessage,
  type MessageContext,
} from '@/lib/e2ee/crypto'

// A prompt like the one that hit the old 4,000-character wall: Markdown,
// code, tabs, trailing spaces, blank-line runs, emoji and CRLF.
function bigPrompt(target = 22_000): string {
  const chunk = [
    '# System prompt: senior reviewer',
    '',
    'You are reviewing a pull request.  Keep **every** rule below.',
    '',
    '',
    '',
    '',
    '```ts',
    'function add(a: number, b: number) {',
    '\treturn a + b   ',
    '}',
    '```',
    '- bullet with trailing spaces   ',
    '> quoted 🚀 text\r',
    '',
  ].join('\n')
  let out = ''
  while (out.length < target) out += chunk
  return out
}

const ctx: MessageContext = {
  channelId: '33333333-3333-4333-8333-333333333333',
  messageId: '44444444-4444-4444-8444-444444444444',
  authorId: '11111111-1111-4111-8111-111111111111',
  sk: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rk: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

async function pair() {
  const [a, b] = await Promise.all([newKeyPair(), newKeyPair()])
  await exportPublicKey(a.publicKey)
  return {
    sender: await conversationKey(a.privateKey, b.publicKey),
    recipient: await conversationKey(b.privateKey, a.publicKey),
  }
}

describe('When a message becomes a long message', () => {
  it('leaves ordinary messages alone', () => {
    expect(INLINE_MAX_CHARS).toBe(MESSAGE_MAX)
    expect(isLong('hello')).toBe(false)
    expect(isLong('x'.repeat(INLINE_MAX_CHARS))).toBe(false)
    expect(isLong(Array(INLINE_MAX_LINES).fill('line').join('\n'))).toBe(false)
  })

  it('takes over past the inline size, by characters or by lines', () => {
    expect(isLong('x'.repeat(INLINE_MAX_CHARS + 1))).toBe(true)
    expect(isLong(Array(INLINE_MAX_LINES + 1).fill('l').join('\n'))).toBe(true)
    expect(isLong(bigPrompt())).toBe(true)
  })

  it('counts characters the way Postgres does, not UTF-16 units', () => {
    expect(charCount('🚀🚀')).toBe(2)
    expect('🚀🚀'.length).toBe(4)
    expect(isLong('🚀'.repeat(INLINE_MAX_CHARS))).toBe(false)
  })
})

describe('The full text', () => {
  it('is kept exactly, including blank-line runs, tabs, trailing spaces and CRLF', () => {
    const raw = bigPrompt()
    const kept = longBody(raw)
    expect(kept).toBe(raw.trimEnd())
    expect(kept).toContain('\n\n\n\n\n')
    expect(kept).toContain('\treturn a + b   \n')
    expect(kept).toContain('text\r\n')
  })

  it('only drops blank lines before it, whitespace after it, and NUL', () => {
    expect(longBody('\n\n  \n    indented first line\nnext\n\n  ')).toBe('    indented first line\nnext')
    expect(longBody('a\u0000b')).toBe('ab')
  })

  it('allows well over 100,000 characters', () => {
    expect(LONG_TEXT_MAX).toBeGreaterThanOrEqual(100_000)
  })
})

describe('The preview', () => {
  it('is the start of the text and never splits an emoji', () => {
    const text = `${'a'.repeat(PREVIEW_CHARS - 1)}🚀 and more`
    const p = previewOf(text)
    expect(text.startsWith(p)).toBe(true)
    expect(p.endsWith('\ud83d')).toBe(false)
    expect(p.length).toBeLessThanOrEqual(PREVIEW_CHARS)
  })

  it('fits the ordinary message column', () => {
    expect(previewOf(bigPrompt()).length).toBeLessThanOrEqual(MESSAGE_MAX)
  })

  it('finds an obvious title and leaves it out of the excerpt', () => {
    expect(titleOf('# Launch plan\n\nStep one')).toBe('Launch plan')
    expect(titleOf('Title: **Q3 spec**\nbody')).toBe('Q3 spec')
    expect(titleOf('Short first line\nthen a long body')).toBe('Short first line')
    expect(titleOf('This first line is a full sentence that goes on and on and on past seventy characters.')).toBeNull()
    expect(titleOf('{"json": true}')).toBeNull()
    expect(excerptAfterTitle('# Launch plan\n\nStep one', 'Launch plan')).toBe('Step one')
  })

  it('round-trips the sealed preview with its length inside', () => {
    const text = bigPrompt()
    const p = unpackPreview(packPreview(text))
    expect(p).toEqual({ v: 1, chars: charCount(text), preview: previewOf(text) })
    expect(unpackPreview('not json')).toBeNull()
    expect(unpackPreview('{"v":1,"chars":0,"preview":"x"}')).toBeNull()
  })
})

describe('Reading it', () => {
  it('finds every match, case-insensitively', () => {
    expect(findMatches('Rule one. rule two. RULE three.', 'rule')).toEqual([
      [0, 4],
      [10, 14],
      [20, 24],
    ])
    expect(findMatches('abc', '  ')).toEqual([])
  })

  it('downloads as Markdown when it looks like Markdown', () => {
    expect(looksLikeMarkdown(bigPrompt())).toBe(true)
    expect(looksLikeMarkdown('just a long plain paragraph of words')).toBe(false)
    expect(fileName('System prompt: senior reviewer', 'md')).toBe('system-prompt-senior-reviewer.md')
    expect(fileName(null, 'txt')).toBe('cabal-message.txt')
  })
})

describe('Long direct messages', () => {
  it('open on the other side exactly as sent', async () => {
    const { sender, recipient } = await pair()
    const text = longBody(bigPrompt())
    const env = await sealLongText(sender, ctx, text)
    expect(env.ct).not.toContain('reviewer')
    expect(await openLongText(recipient, ctx, env)).toBe(text)
  })

  it("can't be swapped with the preview or moved to another message", async () => {
    const { sender, recipient } = await pair()
    const full = await sealLongText(sender, ctx, 'the full text')
    const preview = await sealMessage(sender, ctx, packPreview('the full text'))
    await expect(openMessage(recipient, ctx, full)).rejects.toThrow()
    await expect(openLongText(recipient, ctx, preview)).rejects.toThrow()
    await expect(openLongText(recipient, { ...ctx, messageId: '55555555-5555-4555-8555-555555555555' }, full)).rejects.toThrow()
  })

  it('stay inside the database limits at the very largest size', async () => {
    const { sender } = await pair()
    // Four-byte characters are the worst case for size.
    const worst = '🚀'.repeat(LONG_TEXT_MAX)
    const full = await sealLongText(sender, ctx, worst)
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeLessThan(1_100_000)
    const preview = await sealMessage(sender, ctx, packPreview(worst))
    expect(new TextEncoder().encode(JSON.stringify(preview)).length).toBeLessThan(24_000)
  })
})

describe('Limits agree across the stack', () => {
  const sql = readFileSync('supabase/migrations/0019_long_messages.sql', 'utf8')

  it('the database holds what the app sends', () => {
    expect(sql).toContain(`char_length(body) between 1 and ${LONG_TEXT_MAX}`)
    expect(sql).toContain(`long_chars between 1 and ${LONG_TEXT_MAX}`)
    // Plain previews live in messages.body, which still holds MESSAGE_MAX.
    expect(PREVIEW_CHARS).toBeLessThan(MESSAGE_MAX)
  })
})
