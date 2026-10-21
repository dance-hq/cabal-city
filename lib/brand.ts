// One source for the cabal.city identity: the web logo, the share image and
// every generated icon (scripts/brand-assets.ts) draw from these values.

export const BRAND = {
  star: '#F22A33',
  ink: '#0D0E10',
  paper: '#FCFAF6',
  cityOnInk: '#8B8D93',
  cityOnPaper: '#6B6E75',
  tagline: 'Build your own cabal.',
} as const

// Chicago's six-pointed star, tip up, in a 100×100 box: twelve points
// alternating between the tips (r = 50) and the notches.
const STAR_INNER = 22.5

export function starPoints(cx = 50, cy = 50, r = 50): string {
  return Array.from({ length: 12 }, (_, i) => {
    const radius = i % 2 === 0 ? r : (r * STAR_INNER) / 50
    const a = ((-90 + i * 30) * Math.PI) / 180
    return `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

export const STAR_POINTS = starPoints()
