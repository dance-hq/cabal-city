import { describe, expect, it } from 'vitest'
import { encodeMentions, matchPeople, mentionQuery, personLabel } from '@/lib/mentions'
import { mentions, personRef, plainText, tokenize } from '@/lib/text'
import type { ShownStatus } from '@/lib/types'

const ADA = '11111111-1111-4111-8111-111111111111'
const ADA2 = '22222222-2222-4222-8222-222222222222'
const GRACE = '33333333-3333-4333-8333-333333333333'
const people = [
  { id: ADA, username: 'ada', display_name: 'Ada Lovelace', avatar_url: null },
  { id: ADA2, username: 'ada2', display_name: 'Ada Lovelace', avatar_url: null },
  { id: GRACE, username: 'grace', display_name: 'Grace Hopper', avatar_url: null },
]

describe('mentionQuery', () => {
  it('opens on @ at a word start, not in emails', () => {
    expect(mentionQuery('hey @gr')).toEqual({ query: 'gr', start: 4 })
    expect(mentionQuery('@')).toEqual({ query: '', start: 0 })
    expect(mentionQuery('mail grace@exa')).toBeNull()
    expect(mentionQuery('hey @grace ')).toBeNull()
  })
})

describe('matchPeople', () => {
  it('matches first name, last name or username and skips you', () => {
    expect(matchPeople(people, 'hop', { excludeId: ADA }).map((p) => p.id)).toEqual([GRACE])
    expect(matchPeople(people, 'gra').map((p) => p.id)).toEqual([GRACE])
    expect(matchPeople(people, '', { excludeId: ADA }).map((p) => p.id)).toEqual([ADA2, GRACE])
  })

  it('puts the person you are talking to, then whoever is online, first', () => {
    expect(matchPeople(people, '', { firstId: GRACE })[0].id).toBe(GRACE)
    const statusOf = (id: string): ShownStatus => (id === ADA2 ? 'online' : 'offline')
    expect(matchPeople(people, 'ada', { statusOf })[0].id).toBe(ADA2)
  })
})

describe('encodeMentions', () => {
  it('stores picked names, typed usernames and unique names as person refs', () => {
    const picked = new Map([['Ada Lovelace', ADA2]])
    expect(encodeMentions('hi @Ada Lovelace and @grace', picked, people)).toBe(`hi ${personRef(ADA2)} and ${personRef(GRACE)}`)
    expect(encodeMentions('cc @Grace Hopper.', new Map(), people)).toBe(`cc ${personRef(GRACE)}.`)
  })

  it('leaves ambiguous names, unknown handles and emails alone', () => {
    expect(encodeMentions('hi @Ada Lovelace', new Map(), people)).toBe('hi @Ada Lovelace')
    expect(encodeMentions('hi @nobody, mail grace@example.com', new Map(), people)).toBe('hi @nobody, mail grace@example.com')
    expect(encodeMentions('hi @gracey', new Map(), people)).toBe('hi @gracey')
  })
})

describe('stored person refs', () => {
  it('tokenize as mentions of that user and count as mentioning them', () => {
    const body = `ping ${personRef(GRACE)} and @ada`
    expect(tokenize(body).filter((t) => t.type === 'mention')).toEqual([
      { type: 'mention', value: personRef(GRACE), userId: GRACE, username: null },
      { type: 'mention', value: '@ada', userId: null, username: 'ada' },
    ])
    expect(mentions(body, { id: GRACE, username: 'grace' })).toBe(true)
    expect(mentions(body, { id: ADA, username: 'ada' })).toBe(true)
    expect(mentions(body, { id: ADA2, username: 'ada2' })).toBe(false)
  })

  it('read as the current name in plain text', () => {
    const lookup = (id: string) => people.find((p) => p.id === id)
    expect(plainText(`hi ${personRef(GRACE)}`, () => '#x', personLabel(lookup))).toBe('hi @Grace Hopper')
    expect(plainText(`hi ${personRef('44444444-4444-4444-8444-444444444444')}`, () => '#x', personLabel(lookup))).toBe(
      'hi @Former member',
    )
  })
})
