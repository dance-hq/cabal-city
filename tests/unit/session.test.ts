import { describe, expect, it } from 'vitest'
import { describeSession, formatSession, readAwayMs, readLockIn, shortDuration } from '@/lib/session'
import { ago } from '@/lib/time'

describe('lock-in timer', () => {
  it('counts seconds so you can see it moving', () => {
    expect(formatSession(0)).toBe('0:00')
    expect(formatSession(42_000)).toBe('0:42')
    expect(formatSession(12 * 60_000 + 5_000)).toBe('12:05')
    expect(formatSession(3600_000 + 2 * 60_000 + 33_000)).toBe('1:02:33')
    expect(formatSession(-5_000)).toBe('0:00')
  })

  it('reads naturally to screen readers', () => {
    expect(describeSession(20_000)).toBe('under a minute')
    expect(describeSession(60_000)).toBe('1 minute')
    expect(describeSession(60 * 60_000)).toBe('1 hour')
    expect(describeSession(125 * 60_000)).toBe('2 hours 5 minutes')
  })

  it('stays quiet for other people in lists', () => {
    expect(shortDuration(42 * 60_000)).toBe('42m')
    expect(shortDuration(65 * 60_000)).toBe('1h 05m')
  })
})

describe('reading a lock-in from the server', () => {
  const now = Date.parse('2026-10-21T15:00:00Z')

  it('has none when nothing is open', () => {
    expect(readLockIn(null, now).status).toBe('none')
  })

  it('adds time worked before a pause to the running stretch', () => {
    const s = readLockIn(
      { running_since: '2026-10-21T14:50:00Z', worked_seconds: 600, paused_at: null, focus: 'evals', shared: true, now: '2026-10-21T15:00:00Z' },
      now,
    )
    expect(s.status).toBe('running')
    expect(now - s.startedAt!).toBe(20 * 60_000)
    expect(s.focus).toBe('evals')
  })

  it("corrects for this computer's clock being off", () => {
    const fast = now + 90_000
    const s = readLockIn(
      { running_since: '2026-10-21T14:59:00Z', worked_seconds: 0, paused_at: null, focus: null, shared: false, now: '2026-10-21T15:00:00Z' },
      fast,
    )
    expect(fast - s.startedAt!).toBe(60_000)
  })

  it('keeps a paused session paused at what was worked', () => {
    const s = readLockIn(
      { running_since: null, worked_seconds: 1394, paused_at: '2026-10-21T09:00:00Z', focus: null, shared: false, now: '2026-10-21T15:00:00Z' },
      now,
    )
    expect(s.status).toBe('paused')
    expect(s.startedAt).toBeNull()
    expect(formatSession(s.workedMs)).toBe('23:14')
  })

  it('tells your own pause apart from Cabal being away', () => {
    const base = { running_since: null, worked_seconds: 60, paused_at: '2026-10-21T14:00:00Z', focus: null, shared: false, now: '2026-10-21T15:00:00Z' }
    expect(readLockIn({ ...base, paused_by: 'you' }, now).pausedBy).toBe('you')
    expect(readLockIn({ ...base, paused_by: 'away' }, now).pausedBy).toBe('away')
    expect(readLockIn({ ...base, paused_by: null }, now).pausedBy).toBe('away')
  })

  it('only mentions an away gap worth noticing', () => {
    expect(readAwayMs({ away_seconds: 2520 })).toBe(2_520_000)
    expect(readAwayMs({ away_seconds: 20 })).toBeNull()
    expect(readAwayMs({ worked_seconds: 5 })).toBeNull()
    expect(readAwayMs(null)).toBeNull()
  })
})

describe('how long ago', () => {
  const now = Date.parse('2026-10-21T15:00:00Z')
  it('is compact', () => {
    expect(ago('2026-10-21T14:59:30Z', now)).toBe('now')
    expect(ago('2026-10-21T14:55:00Z', now)).toBe('5m')
    expect(ago('2026-10-21T12:00:00Z', now)).toBe('3h')
    expect(ago('2026-10-19T15:00:00Z', now)).toBe('2d')
  })
})
