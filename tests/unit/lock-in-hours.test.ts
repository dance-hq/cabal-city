import { describe, expect, it } from 'vitest'
import { dayIndex, hours, readBoard, readStats, share, weekRange, withRunning, zoneCity } from '@/lib/lock-in-hours'

const CHICAGO = 'America/Chicago'

describe('lock in hours', () => {
  it('reads stats, padding the week to seven days', () => {
    const s = readStats({
      today_seconds: 3600,
      week_seconds: 7200,
      all_seconds: 90000,
      sessions: 12,
      days: [3600, 3600],
      self: true,
      board: false,
      time_zone: CHICAGO,
      week_start: '2026-10-19T05:00:00Z',
      recent: [{ id: 'a', started_at: '2026-10-20T14:00:00Z', ended_at: '2026-10-20T15:00:00Z', worked_seconds: 3600, focus: null, note: 'Shipped it' }],
    })!
    expect(s.days).toEqual([3600, 3600, 0, 0, 0, 0, 0])
    expect(s.recent[0].note).toBe('Shipped it')
    expect(s.live).toBe(true)
    expect(readStats(null)).toBeNull()
  })

  it('adds the running session to today, this week and all time', () => {
    const s = readStats({ today_seconds: 60, week_seconds: 120, all_seconds: 600, sessions: 1, days: [0, 0, 120, 0, 0, 0, 0], time_zone: CHICAGO, week_start: '2026-10-19T05:00:00Z' })!
    // Wednesday 2026-10-21, 10:00 in Chicago.
    const wednesday = Date.parse('2026-10-21T15:00:00Z')
    const live = withRunning(s, 30 * 60_000, wednesday)
    expect(live.todaySeconds).toBe(60 + 1800)
    expect(live.weekSeconds).toBe(120 + 1800)
    expect(live.allSeconds).toBe(600 + 1800)
    expect(live.days[2]).toBe(120 + 1800)
    expect(withRunning(s, 0, wednesday)).toBe(s)
  })

  it('finds the weekday in the community time zone, not UTC', () => {
    // Monday 04:30 UTC is still Sunday evening in Chicago.
    expect(dayIndex(CHICAGO, Date.parse('2026-10-26T04:30:00Z'))).toBe(6)
    expect(dayIndex(CHICAGO, Date.parse('2026-10-26T05:30:00Z'))).toBe(0)
    expect(dayIndex('UTC', Date.parse('2026-10-26T04:30:00Z'))).toBe(0)
  })

  it('labels hours plainly', () => {
    expect(hours(0)).toBe('0m')
    expect(hours(59)).toBe('0m')
    expect(hours(42 * 60)).toBe('42m')
    expect(hours(2 * 3600 + 5 * 60)).toBe('2h 05m')
    expect(hours(124 * 3600 + 59 * 60)).toBe('124h')
  })

  it('names the week in local dates, across months and DST', () => {
    expect(weekRange(Date.parse('2026-10-19T05:00:00Z'), Date.parse('2026-10-26T05:00:00Z'), CHICAGO)).toBe('Oct 19 – 25')
    // Contains the end of daylight time (Nov 1, 2026).
    expect(weekRange(Date.parse('2026-10-26T05:00:00Z'), Date.parse('2026-11-02T06:00:00Z'), CHICAGO)).toBe('Oct 26 – Nov 1')
  })

  it('reads the board and sizes bars against the top', () => {
    const b = readBoard({ week_start: '2026-10-19T05:00:00Z', week_end: '2026-10-26T05:00:00Z', time_zone: CHICAGO, joined: true, rows: [{ user_id: 'u', seconds: 100, sessions: 2, rank: 1 }] })!
    expect(b.rows[0]).toEqual({ userId: 'u', seconds: 100, sessions: 2, rank: 1 })
    expect(share(0, 100)).toBe(0)
    expect(share(1, 1000)).toBe(0.04)
    expect(share(50, 100)).toBe(0.5)
    expect(zoneCity(CHICAGO)).toBe('Chicago')
    expect(zoneCity('America/New_York')).toBe('New York')
  })
})
