// IRC-style name colors: everyone keeps the same soft color everywhere, so you
// learn who's talking at a glance. Blue (--mark) is kept for you alone, and red
// is left out so a name never reads as an error.
export const NICK_COLORS = 6

export function nickIndex(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % NICK_COLORS) + 1
}

export function nickColor(id: string | null | undefined, mine = false) {
  if (mine) return 'var(--mark)'
  if (!id) return 'var(--muted-foreground)'
  return `var(--nick-${nickIndex(id)})`
}
