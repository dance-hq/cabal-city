import { describe, expect, it } from 'vitest'
import { USERNAME_PATTERN, cleanLinks, linkLabel, usernameCandidates, usernameFrom } from '@/lib/username'

describe('usernameFrom', () => {
  it('makes a mentionable name from a display name', () => {
    expect(usernameFrom('Ada Lovelace')).toBe('ada_lovelace')
    expect(usernameFrom('  José   Núñez ')).toBe('jose_nunez')
    expect(usernameFrom("D'Angelo O'Brien-Smith")).toBe('d_angelo_o_brien_smith')
  })

  it('falls back to the email name, then to "member"', () => {
    expect(usernameFrom('李', 'li.wei')).toBe('li_wei')
    expect(usernameFrom('✨', '')).toBe('member')
  })

  it('always fits the database rule', () => {
    for (const n of ['A', 'Bartholomew Montgomery-Fitzgerald the Third', '___x___', 'Zoë']) {
      for (const u of usernameCandidates(usernameFrom(n, 'someone'))) expect(u).toMatch(USERNAME_PATTERN)
    }
  })
})

describe('usernameCandidates', () => {
  it('tries the plain name first, then numbered variants', () => {
    const c = usernameCandidates('ada', 4, () => 0.5)
    expect(c).toEqual(['ada', 'ada_50', 'ada_500', 'ada_5000'])
  })

  it('trims long names to leave room for the number', () => {
    const long = 'a'.repeat(24)
    for (const u of usernameCandidates(long).slice(1)) expect(u.length).toBeLessThanOrEqual(24)
  })
})

describe('cleanLinks', () => {
  it('adds https and drops things that are not web addresses', () => {
    expect(cleanLinks(['yoursite.com', ' https://x.com/ada ', 'not a link', '', 'localhost'])).toEqual([
      'https://yoursite.com',
      'https://x.com/ada',
    ])
  })

  it('keeps at most four, without repeats', () => {
    expect(cleanLinks(['a.com', 'a.com', 'b.com', 'c.com', 'd.com', 'e.com'])).toHaveLength(4)
  })

  it('labels links by host and path', () => {
    expect(linkLabel('https://www.linkedin.com/in/ada/')).toBe('linkedin.com/in/ada')
    expect(linkLabel('https://ada.dev')).toBe('ada.dev')
  })
})
