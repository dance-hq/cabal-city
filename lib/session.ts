// Session time is shown in whole minutes on purpose: a ticking seconds
// counter pulls your eye; "1h 05m" just quietly keeps track.
export function formatSession(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}

export function describeSession(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const m = minutes % 60
  const parts = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (m || !hours) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  return parts.join(' ')
}

const GREETINGS = [
  [5, 'Good morning'],
  [12, 'Good afternoon'],
  [17, 'Good evening'],
  [22, 'Late one'],
] as const

export function greeting(hour: number): string {
  let text = 'Late one'
  for (const [from, words] of GREETINGS) if (hour >= from) text = words
  return hour < 5 ? 'Late one' : text
}

const CALM = [
  'No rush. Settle in, take a breath, and pick the one thing you want to move forward.',
  "You don't have to do it all today. Just the next good thing.",
  "Breathe out. Your people are here when you need them, and quiet when you don't.",
  'Small steps still ship. Pick one and start there.',
]

// The same line all day, a different one tomorrow.
export function calmLine(date: Date): string {
  const day = Math.floor(date.getTime() / 86_400_000)
  return CALM[day % CALM.length]
}
