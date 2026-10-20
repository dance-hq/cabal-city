import { ImageResponse } from 'next/og'

export const alt = "Cabal: Chicago's builders, one buddy list away"
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const STAR = Array.from({ length: 12 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 23
  const a = ((-90 + i * 30) * Math.PI) / 180
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
}).join(' ')

const INK = '#16171a'
const PAPER = '#f2f3f5'
const BLUE = '#41b6e6'
const RED = '#e4002b'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: INK, color: PAPER }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '64px 72px 40px', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 30, fontFamily: 'monospace', opacity: 0.75 }}>cabal · Chicago</div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, maxWidth: 980 }}>
            Chicago&apos;s builders, one buddy list away.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div style={{ height: 36, background: BLUE }} />
          <div style={{ display: 'flex', justifyContent: 'space-around', padding: '28px 120px' }}>
            {[0, 1, 2, 3].map((i) => (
              <svg key={i} width="110" height="110" viewBox="0 0 100 100">
                <polygon points={STAR} fill={RED} />
              </svg>
            ))}
          </div>
          <div style={{ height: 36, background: BLUE }} />
          <div style={{ height: 24 }} />
        </div>
      </div>
    ),
    size,
  )
}
