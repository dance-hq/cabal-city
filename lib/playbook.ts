// The Cabal Playbook: a few good ways to settle in. Add, reword or reorder
// items here; ids are stored in user_settings.playbook_done, so keep an id
// stable once it ships (lowercase letters, digits and dashes only).

export const PRODUCT_HUNT_URL = 'https://www.producthunt.com'

export type PlaybookId = 'product-hunt' | 'introduce' | 'lock-in' | 'support'

export type PlaybookItem = {
  id: PlaybookId
  title: string
  body: string
  // A quieter second line, for the one rule worth saying out loud.
  note?: string
}

export const PLAYBOOK: PlaybookItem[] = [
  {
    id: 'product-hunt',
    title: 'Get set up on Product Hunt',
    body: 'Make an account if you don\u2019t have one and spend a little time looking around, so it feels familiar when someone here launches.',
    note: 'Upvote and comment only on what you genuinely like. Never trade or ask for votes.',
  },
  {
    id: 'introduce',
    title: 'Introduce yourself',
    body: 'Say who you are and what you\u2019re building, whenever you feel like it.',
  },
  {
    id: 'lock-in',
    title: 'Start your first Lock in',
    body: 'Try one focused session and your hours start adding up. Locked in means heads down, not on call.',
  },
  {
    id: 'support',
    title: 'Support another builder',
    body: 'Try someone\u2019s launch, answer an ask, give honest feedback or make an introduction.',
  },
]

// What Cabal can see you've already done, from playbook_progress().
export type Noticed = { introduced: boolean; locked_in: boolean }

export function noticedDone(noticed: Noticed | null | undefined): Set<PlaybookId> {
  const done = new Set<PlaybookId>()
  if (noticed?.introduced) done.add('introduce')
  if (noticed?.locked_in) done.add('lock-in')
  return done
}

const IDS = new Set<string>(PLAYBOOK.map((i) => i.id))

// Ticking or unticking keeps the stored list short, known and in Playbook order.
export function withItem(done: readonly string[], id: PlaybookId, on: boolean): PlaybookId[] {
  const next = new Set(done.filter((d) => IDS.has(d)))
  if (on) next.add(id)
  else next.delete(id)
  return PLAYBOOK.map((i) => i.id).filter((i) => next.has(i))
}
