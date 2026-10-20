// Turns Supabase/Postgres errors into short sentences people can act on.
// Messages raised by our own SQL functions are already written for people.
export function friendlyError(err: unknown): string {
  if (!err) return 'Something went wrong.'
  if (typeof err === 'string') return err
  const e = err as { message?: string; code?: string }
  if (e.code === '23505') return 'That already exists.'
  if (e.code === '23514') return 'One of those values is too long or not allowed.'
  if (e.code === 'P0429') return e.message ?? 'Slow down a little.'
  if (e.message?.includes('Failed to fetch')) return "Couldn't reach Cabal. Check your connection."
  if (e.message?.includes('row-level security')) return "You don't have access to that."
  return e.message || 'Something went wrong.'
}
