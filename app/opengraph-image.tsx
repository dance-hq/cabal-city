import { ImageResponse } from 'next/og'
import { LOCKUP } from '@/components/brand/wordmark-paths'
import { BRAND } from '@/lib/brand'

export const alt = 'cabal.city: Build your own cabal.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const LOGO_WIDTH = 860
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * LOCKUP.height) / LOCKUP.width)

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 44,
          background: BRAND.ink,
        }}
      >
        <svg width={LOGO_WIDTH} height={LOGO_HEIGHT} viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}>
          <polygon points={LOCKUP.star} fill={BRAND.star} />
          <path d={LOCKUP.cabal} fill={BRAND.paper} />
          <path d={LOCKUP.city} fill={BRAND.cityOnInk} />
        </svg>
        <div
          style={{
            display: 'flex',
            fontSize: 38,
            fontFamily: 'monospace',
            letterSpacing: 8,
            color: BRAND.paper,
            opacity: 0.82,
            paddingLeft: 120,
          }}
        >
          {BRAND.tagline}
        </div>
      </div>
    ),
    size,
  )
}
