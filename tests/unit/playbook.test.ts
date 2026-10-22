import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYBOOK, noticedDone, withItem } from '@/lib/playbook'

describe('the Cabal Playbook', () => {
  it('has the four starting items with storable ids', () => {
    expect(PLAYBOOK.map((i) => i.id)).toEqual(['product-hunt', 'introduce', 'lock-in', 'support'])
    for (const i of PLAYBOOK) expect(i.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('never suggests gaming Product Hunt', () => {
    const ph = PLAYBOOK.find((i) => i.id === 'product-hunt')!
    expect(ph.note).toMatch(/never trade or ask for votes/i)
    const all = PLAYBOOK.map((i) => `${i.title} ${i.body} ${i.note ?? ''}`).join(' ')
    expect(all).not.toMatch(/upvote (us|this|each other)|vote ring|xp|badge|streak|points/i)
  })

  it('ticks and unticks without duplicates, unknown ids or reordering', () => {
    expect(withItem([], 'support', true)).toEqual(['support'])
    expect(withItem(['support'], 'product-hunt', true)).toEqual(['product-hunt', 'support'])
    expect(withItem(['support', 'support'], 'support', true)).toEqual(['support'])
    expect(withItem(['product-hunt', 'support'], 'product-hunt', false)).toEqual(['support'])
    expect(withItem(['old-item', 'support'], 'introduce', true)).toEqual(['introduce', 'support'])
  })

  it('counts what Cabal noticed', () => {
    expect([...noticedDone(null)]).toEqual([])
    expect([...noticedDone({ introduced: true, locked_in: false })]).toEqual(['introduce'])
    expect([...noticedDone({ introduced: true, locked_in: true })].sort()).toEqual(['introduce', 'lock-in'])
  })

  it('leaves members who were already here alone', () => {
    const sql = readFileSync('supabase/migrations/0029_welcome_playbook.sql', 'utf8')
    expect(sql).toMatch(/update public\.user_settings set welcome_seen = true, playbook_hidden = true;/)
    expect(sql).toMatch(/welcome_seen boolean not null default false/)
  })
})
