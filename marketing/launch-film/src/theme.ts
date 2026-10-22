// Cabal's own dark theme (app/globals.css .dark + lib/brand.ts), as hex.
export const C = {
  ink: '#0D0E10',
  surface: '#141518',
  card: '#191A1D',
  popover: '#1C1D20',
  accent: '#25262A',
  line: '#2B2C30',
  text: '#ECEDEF',
  muted: '#A2A5AC',
  dim: '#6B6E75',
  city: '#8B8D93',
  paper: '#FCFAF6',
  // The locked-in ring.
  gold: '#DDA53B',
  goldLight: '#F2C66B',
  flag: '#36B3E2',
  flagInk: '#0D0E10',
  star: '#F22A33',
} as const

// Other people's names in the dark theme (--nick-1..6).
export const NICK = ['#E3C88F', '#AAD3A6', '#9FD2CA', '#C9BEEA', '#E8B7D0', '#EDBD9B'] as const

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
