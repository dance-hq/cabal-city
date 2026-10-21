import { describe, expect, it } from 'vitest'
import { calmLine, describeSession, formatSession, greeting } from '@/lib/session'

describe('session time', () => {
  it('shows whole minutes, then hours and minutes', () => {
    expect(formatSession(0)).toBe('0m')
    expect(formatSession(59_000)).toBe('0m')
    expect(formatSession(23 * 60_000 + 30_000)).toBe('23m')
    expect(formatSession(65 * 60_000)).toBe('1h 05m')
    expect(formatSession(-5_000)).toBe('0m')
  })

  it('reads naturally to screen readers', () => {
    expect(describeSession(60_000)).toBe('1 minute')
    expect(describeSession(0)).toBe('0 minutes')
    expect(describeSession(60 * 60_000)).toBe('1 hour')
    expect(describeSession(125 * 60_000)).toBe('2 hours 5 minutes')
  })
})

describe('welcome words', () => {
  it('greets by the time of day', () => {
    expect(greeting(3)).toBe('Late one')
    expect(greeting(8)).toBe('Good morning')
    expect(greeting(13)).toBe('Good afternoon')
    expect(greeting(19)).toBe('Good evening')
    expect(greeting(23)).toBe('Late one')
  })

  it('keeps the same calm line all day', () => {
    const morning = new Date('2026-10-21T01:00:00Z')
    const later = new Date('2026-10-21T22:00:00Z')
    expect(calmLine(morning)).toBe(calmLine(later))
    expect(calmLine(new Date('2026-10-22T01:00:00Z'))).not.toBe(calmLine(morning))
  })
})
