import { describe, expect, it } from 'vitest'
import {
  dayKey,
  dayLabel,
  fromLocal,
  groupByDay,
  happeningNow,
  timeRange,
  toIcs,
  toLocalRange,
  type CalendarEvent,
} from '@/lib/calendar'

const TZ = 'America/Chicago'
const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Demo night',
  host: 'Cabal',
  // 6:30–8 PM Chicago (CDT, UTC−5)
  starts_at: '2026-10-22T23:30:00Z',
  ends_at: '2026-10-23T01:00:00Z',
  venue: 'Ferris, 1 W Superior',
  url: 'https://lu.ma/demo',
  summary: 'Five demos, then drinks.',
  time_zone: TZ,
  ...over,
})

describe('calendar', () => {
  it('reads days and times in the community zone, not UTC', () => {
    expect(dayKey('2026-10-23T01:00:00Z', TZ)).toBe('2026-10-22')
    expect(timeRange(event())).toBe('6:30 PM – 8 PM')
    expect(timeRange(event({ ends_at: null }))).toBe('6:30 PM')
  })

  it('labels today and tomorrow', () => {
    const now = Date.parse('2026-10-22T15:00:00Z')
    expect(dayLabel('2026-10-22', TZ, now).lead).toBe('Today')
    expect(dayLabel('2026-10-23', TZ, now).lead).toBe('Tomorrow')
    expect(dayLabel('2026-10-25', TZ, now)).toEqual({ lead: null, date: 'Sun, Oct 25' })
  })

  it('groups by day and keeps something still going under today', () => {
    const now = Date.parse('2026-10-23T14:00:00Z')
    const groups = groupByDay(
      [
        event({ id: 'later', starts_at: '2026-10-24T15:00:00Z', ends_at: null }),
        event({ id: 'multi', starts_at: '2026-10-22T14:00:00Z', ends_at: '2026-10-24T22:00:00Z' }),
      ],
      now,
    )
    expect(groups.map((g) => [g.key, g.events.map((e) => e.id)])).toEqual([
      ['2026-10-23', ['multi']],
      ['2026-10-24', ['later']],
    ])
  })

  it('knows when something is happening now, with a default length', () => {
    expect(happeningNow(event(), Date.parse('2026-10-23T00:00:00Z'))).toBe(true)
    expect(happeningNow(event({ ends_at: null }), Date.parse('2026-10-23T02:00:00Z'))).toBe(true)
    expect(happeningNow(event({ ends_at: null }), Date.parse('2026-10-23T03:00:00Z'))).toBe(false)
  })

  it('turns form fields into wall-clock times, rolling past midnight', () => {
    expect(toLocalRange('2026-10-31', '21:00', '')).toEqual({ starts: '2026-10-31T21:00', ends: null })
    expect(toLocalRange('2026-10-31', '21:00', '23:30').ends).toBe('2026-10-31T23:30')
    expect(toLocalRange('2026-10-31', '21:00', '01:00').ends).toBe('2026-11-01T01:00')
    expect(fromLocal('2026-11-05T08:30:00')).toEqual({ date: '2026-11-05', time: '08:30' })
  })

  it('writes a calendar file in UTC with escaped text', () => {
    const ics = toIcs(event({ venue: 'Ferris; 1 W Superior, Chicago' }), 'https://cabal.city')
    expect(ics).toContain('DTSTART:20261022T233000Z')
    expect(ics).toContain('DTEND:20261023T010000Z')
    expect(ics).toContain('LOCATION:Ferris\\; 1 W Superior\\, Chicago')
    expect(ics).toContain('UID:e1@cabal.city')
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR')
  })
})
