// Cabal's dark theme, converted exactly from the oklch tokens in
// app/globals.css (.dark) plus the logo colors in lib/brand.ts. Change a
// token there, convert it, and paste it here: no film-only colors.
export const C = {
  ink: '#0F1113', // --background
  surface: '#0F1113', // panes sit on the background
  card: '#16171A', // --card
  popover: '#181A1C', // --popover
  accent: '#212326', // --accent
  line: '#27292C', // --border
  text: '#E9EBEE', // --foreground
  muted: '#989CA2', // --muted-foreground
  dim: '#6B6E75', // BRAND.cityOnPaper
  city: '#8B8D93', // BRAND.cityOnInk
  paper: '#FCFAF6',
  // The locked-in ring (--gold).
  gold: '#EBBD57',
  flag: '#4EC0ED', // --flag
  flagInk: '#0D0E10', // --flag-foreground
  star: '#F22A33', // --brand-star
  online: '#58CD78', // --online
} as const

// Other people's names in the dark theme (--nick-1..6).
export const NICK = ['#E3BE80', '#9ECC9E', '#89CDC3', '#BEB1E9', '#E5A3C8', '#EBAF86'] as const

export const SANS = 'Geist, system-ui, sans-serif'
export const MONO = '"Geist Mono", ui-monospace, monospace'

// Chicago's six-pointed star, tip up (lib/brand.ts starPoints).
export function starPolygon(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 12 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45
    const a = ((-90 + i * 30) * Math.PI) / 180
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]
  })
}

export function pointsAttr(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

export function insidePolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
