import { describe, expect, it } from 'vitest'
import { channelQuery, encodeChannelLinks, linkLabel, matchChannels, type LinkableChannel } from '@/lib/channel-links'
import { channelIdFromUrl, channelRef, plainText, tokenize } from '@/lib/text'

const LOBBY = '11111111-1111-4111-8111-111111111111'
const DANCE = '22222222-2222-4222-8222-222222222222'
const DANCE_TWO = '33333333-3333-4333-8333-333333333333'

const room = (id: string, slug: string): LinkableChannel => ({
  id, kind: 'room', slug, team_id: null, team_name: null, team_visibility: null, joined: true, member_count: null, welcome: null,
})
const team = (id: string, name: string, joined = true): LinkableChannel => ({
  id, kind: 'team', slug: 'general', team_id: `t-${id}`, team_name: name, team_visibility: 'public', joined, member_count: 3, welcome: null,
})

describe('channel links in text', () => {
  it('reads a stored link as a channel token', () => {
    expect(tokenize(`see ${channelRef(LOBBY)} now`)).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'channel', value: `<#${LOBBY}>`, channelId: LOBBY },
      { type: 'text', value: ' now' },
    ])
  })

  it('reads a pasted link to this app as a channel, and other links as links', () => {
    const origins = ['https://cabal.city']
    expect(tokenize(`https://cabal.city/app?c=${DANCE}.`, { appOrigins: origins })[0]).toMatchObject({ type: 'channel', channelId: DANCE })
    expect(tokenize(`https://evil.example/app?c=${DANCE}`, { appOrigins: origins })[0]).toMatchObject({ type: 'link' })
    expect(channelIdFromUrl('https://cabal.city/app?c=not-an-id', origins)).toBeNull()
  })

  it('still finds mentions next to channel links', () => {
    expect(tokenize(`@matt ${channelRef(LOBBY)}`).map((t) => t.type)).toEqual(['mention', 'text', 'channel'])
  })

  it('writes plain text without leaking channels you cannot see', () => {
    const label = linkLabel([{ id: LOBBY, kind: 'room', slug: 'lobby', team_name: null }])
    expect(plainText(`go to ${channelRef(LOBBY)} or ${channelRef(DANCE)}`, label)).toBe('go to #lobby or #private-channel')
  })
})

describe('the # picker', () => {
  it('opens after # at the start of a word, not inside links', () => {
    expect(channelQuery('hey #da')).toEqual({ query: 'da', start: 4 })
    expect(channelQuery('#')).toEqual({ query: '', start: 0 })
    expect(channelQuery('https://x.com/page#top')).toBeNull()
    expect(channelQuery('#lobby ')).toBeNull()
  })

  it('ranks name starts first, then joined, rooms before teams', () => {
    const list = [team(DANCE, 'Dance Technologies'), room(LOBBY, 'lobby'), team(DANCE_TWO, 'Indie Dance', false)]
    expect(matchChannels(list, 'da').map((c) => c.id)).toEqual([DANCE, DANCE_TWO])
    expect(matchChannels(list, '', LOBBY).map((c) => c.id)).toEqual([DANCE, DANCE_TWO])
  })
})

describe('encoding links on send', () => {
  const list = [room(LOBBY, 'lobby'), team(DANCE, 'Dance Technologies')]

  it('links typed names, including team names with spaces', () => {
    expect(encodeChannelLinks('try #lobby and #Dance Technologies!', new Map(), list)).toBe(
      `try ${channelRef(LOBBY)} and ${channelRef(DANCE)}!`,
    )
  })

  it('leaves unknown names, partial words and URLs alone', () => {
    expect(encodeChannelLinks('#lobbyist #nope x.com/#lobby', new Map(), list)).toBe('#lobbyist #nope x.com/#lobby')
  })

  it('only links a shared name when you picked which one', () => {
    const dup = [...list, team(DANCE_TWO, 'Dance Technologies')]
    expect(encodeChannelLinks('#Dance Technologies', new Map(), dup)).toBe('#Dance Technologies')
    expect(encodeChannelLinks('#Dance Technologies', new Map([['Dance Technologies', DANCE_TWO]]), dup)).toBe(channelRef(DANCE_TWO))
  })
})
