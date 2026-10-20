import { describe, expect, it } from 'vitest'
import { cleanBody, mentions, safeHref, tokenize } from '@/lib/text'

describe('tokenize', () => {
  it('turns http(s) URLs into links and leaves trailing punctuation out', () => {
    const tokens = tokenize('see https://example.com/a?b=1, then (https://x.dev/y).')
    expect(tokens.filter((t) => t.type === 'link').map((t) => t.value)).toEqual([
      'https://example.com/a?b=1',
      'https://x.dev/y',
    ])
  })

  it('keeps balanced parentheses inside links', () => {
    const [link] = tokenize('https://en.wikipedia.org/wiki/Foo_(bar)').filter((t) => t.type === 'link')
    expect(link.value).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
  })

  it('never links javascript: or data: URLs', () => {
    const tokens = tokenize('javascript:alert(1) data:text/html,<b>x</b>')
    expect(tokens.some((t) => t.type === 'link')).toBe(false)
    expect(safeHref('javascript:alert(1)')).toBeNull()
  })

  it('treats HTML as plain text', () => {
    const tokens = tokenize('<img src=x onerror=alert(1)>')
    expect(tokens).toEqual([{ type: 'text', value: '<img src=x onerror=alert(1)>' }])
  })

  it('finds @mentions but not emails', () => {
    const tokens = tokenize('hi @ada, mail me at grace@example.com')
    expect(tokens.filter((t) => t.type === 'mention').map((t) => t.value)).toEqual(['@ada'])
  })

  it('round-trips the original text', () => {
    const body = 'ok @ada look https://a.b/c! and emoji 🚀'
    expect(tokenize(body).map((t) => t.value).join('')).toBe(body)
  })
})

describe('mentions', () => {
  it('matches case-insensitively and only whole usernames', () => {
    expect(mentions('ping @Ada', 'ada')).toBe(true)
    expect(mentions('ping @adam', 'ada')).toBe(false)
    expect(mentions('ping @ada', null)).toBe(false)
  })
})

describe('cleanBody', () => {
  it('strips control characters and trims', () => {
    expect(cleanBody('  hi\u0007 there\n\n\n\n\nbye  ')).toBe('hi there\n\n\nbye')
  })
})
