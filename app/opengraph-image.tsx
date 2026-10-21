import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { LOCKUP } from '@/components/brand/wordmark-paths'
import { BRAND, starPoints } from '@/lib/brand'
import { SHARE_ALT } from '@/lib/site'

export const alt = SHARE_ALT
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PAD = 64
const LOGO_WIDTH = 300
const LOGO_HEIGHT = Math.round((LOGO_WIDTH * LOCKUP.height) / LOCKUP.width)
const STAR = 84
const STAR_BOX = `-4 -4 ${STAR + 8} ${STAR + 8}`
const STAR_SHAPE = starPoints(STAR / 2, STAR / 2, STAR / 2)

// The homepage, condensed: logo, the headline, and the Chicago flag with its
// four stars and an empty fifth for what gets built here.
export default async function OpengraphImage() {
  const [semibold, mono] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/Geist-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/GeistMono-Medium.ttf')),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: BRAND.paper,
          color: BRAND.ink,
          fontFamily: 'Geist',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, padding: `${PAD - 8}px ${PAD}px 0` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <svg width={LOGO_WIDTH} height={LOGO_HEIGHT} viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}>
              <polygon points={LOCKUP.star} fill={BRAND.star} />
              <path d={LOCKUP.cabal} fill={BRAND.ink} />
              <path d={LOCKUP.city} fill={BRAND.cityOnPaper} />
            </svg>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Geist Mono',
                fontSize: 24,
                letterSpacing: 0.5,
                color: BRAND.cityOnPaper,
              }}
            >
              Open-source messenger
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 112,
              lineHeight: 1,
              letterSpacing: -4.5,
            }}
          >
            <span>Chicago builders,</span>
            <span>it’s time to lock in.</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 30, background: BRAND.flag }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `22px ${PAD + 36}px`,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <svg key={i} width={STAR} height={STAR} viewBox={STAR_BOX}>
                <polygon points={STAR_SHAPE} fill={BRAND.star} />
              </svg>
            ))}
            <svg width={STAR} height={STAR} viewBox={STAR_BOX}>
              <polygon
                points={STAR_SHAPE}
                fill="none"
                stroke={BRAND.flag}
                strokeWidth={4.5}
                strokeDasharray="9 7"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ display: 'flex', height: 30, background: BRAND.flag }} />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
        { name: 'Geist Mono', data: mono, weight: 500, style: 'normal' },
      ],
    },
  )
}
