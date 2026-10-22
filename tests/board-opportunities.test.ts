import { describe, expect, it } from 'vitest'
import { arrangeIdeas, githubLabel, shipHeading, splitSuggestion, type Idea } from '@/lib/board'
import {
  arrangeOpportunities,
  daysBetween,
  deadlineLabel,
  fitLabel,
  fitsYou,
  isStale,
  type Opportunity,
} from '@/lib/opportunities'

// 2026-10-21 15:00 in Chicago (CDT, UTC-5).
const NOW = Date.parse('2026-10-21T20:00:00Z')

const idea = (p: Partial<Idea>): Idea => ({
  id: 'x',
  title: 'x',
  body: null,
  status: 'requested',
  status_at: null,
  created_at: '2026-10-01T00:00:00Z',
  author_id: 'a',
  github_url: null,
  hidden: false,
  votes: 0,
  comments: 0,
  voted: false,
  ...p,
})

const opp = (p: Partial<Opportunity>): Opportunity => ({
  id: 'o',
  community_id: null,
  kind: 'credits',
  title: 'o',
  provider: null,
  summary: 'something useful',
  eligibility: null,
  place: 'Remote',
  deadline: null,
  url: 'https://example.com',
  audiences: [],
  verified_at: '2026-10-21',
  saved: false,
  ...p,
})

describe('ship heading', () => {
  it('only says today when it shipped today in Chicago', () => {
    expect(shipHeading('2026-10-21T17:47:09Z', NOW)).toBe('Today’s ship')
    // 11pm Chicago on the 20th is already the 21st in UTC: still yesterday here.
    expect(shipHeading('2026-10-21T04:00:00Z', NOW)).toBe('Yesterday’s ship')
    expect(shipHeading('2026-10-15T12:00:00Z', NOW)).toBe('Latest ship')
  })
})

describe('ideas', () => {
  it('ranks by support, keeps shipped ones off the open tabs', () => {
    const list = [
      idea({ id: 'a', votes: 2 }),
      idea({ id: 'b', votes: 5 }),
      idea({ id: 'c', votes: 9, status: 'shipped' }),
      idea({ id: 'd', votes: 2, status: 'building' }),
    ]
    expect(arrangeIdeas(list, 'popular').map((i) => i.id)).toEqual(['b', 'd', 'a'])
  })

  it('orders recent by date', () => {
    const list = [idea({ id: 'old', created_at: '2026-10-01T00:00:00Z' }), idea({ id: 'new', created_at: '2026-10-20T00:00:00Z' })]
    expect(arrangeIdeas(list, 'recent').map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('labels GitHub links', () => {
    expect(githubLabel('https://github.com/dance-hq/cabal-city/pull/24')).toBe('PR #24')
    expect(githubLabel('https://github.com/dance-hq/cabal-city/issues/7')).toBe('Issue #7')
    expect(githubLabel('https://github.com/dance-hq/cabal-city')).toBe('GitHub')
  })

  it('turns feedback text into a title and description', () => {
    expect(splitSuggestion('Dark mode timer\nIt glows at night')).toEqual({ title: 'Dark mode timer', body: 'It glows at night' })
    expect(splitSuggestion('x'.repeat(130)).title).toBe('')
  })
})

describe('opportunities', () => {
  it('counts days between calendar dates', () => {
    expect(daysBetween('2026-10-21', '2026-11-18')).toBe(28)
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
  })

  it('describes deadlines from Chicago today', () => {
    expect(deadlineLabel('2026-10-21', NOW)).toEqual({ text: 'Closes today', soon: true })
    expect(deadlineLabel('2026-10-22', NOW)).toEqual({ text: 'Closes tomorrow', soon: true })
    expect(deadlineLabel('2026-11-02', NOW).text).toBe('Closes in 12 days')
    expect(deadlineLabel('2026-11-18', NOW).soon).toBe(false)
  })

  it('flags entries nobody has checked in 90 days', () => {
    expect(isStale('2026-07-01', NOW)).toBe(true)
    expect(isStale('2026-09-01', NOW)).toBe(false)
  })

  it('treats profile fit as a hint only', () => {
    expect(fitsYou(opp({ audiences: ['founder'] }), ['founder'])).toBe(true)
    expect(fitsYou(opp({ audiences: ['founder'] }), ['investor'])).toBe(false)
    expect(fitsYou(opp({ audiences: ['founder'] }), [])).toBe(false)
    expect(fitsYou(opp({ audiences: ['founder'] }), null)).toBe(false)
  })

  it('fits when any of your roles matches, and says which', () => {
    const o = opp({ audiences: ['founder', 'builder'] })
    expect(fitsYou(o, ['investor', 'builder'])).toBe(true)
    expect(fitLabel(o, ['builder', 'investor'])).toBe('For builders')
    expect(fitLabel(o, ['builder', 'founder'])).toBe('For founders and builders')
    expect(fitLabel(opp({ audiences: ['founder', 'builder', 'investor'] }), ['investor', 'founder', 'builder'])).toBe(
      'For founders, builders and investors',
    )
    expect(fitLabel(o, ['investor'])).toBeNull()
  })

  it('puts the soonest deadline first, then what fits you', () => {
    const list = [
      opp({ id: 'open-fit', audiences: ['builder'] }),
      opp({ id: 'late', deadline: '2026-11-18' }),
      opp({ id: 'soon', deadline: '2026-11-02' }),
      opp({ id: 'open', verified_at: '2026-10-22' }),
    ]
    expect(arrangeOpportunities(list, ['builder']).map((o) => o.id)).toEqual(['soon', 'late', 'open-fit', 'open'])
  })
})
