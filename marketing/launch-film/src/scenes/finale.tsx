import { AbsoluteFill, useCurrentFrame } from 'remotion'
import wordmark from '../brand/wordmark.json'
import { finaleStar } from '../components/city'
import { Words } from '../components/words'
import { inOut, mix, out, p, useFormat } from '../motion'
import { C, MONO, pointsAttr, starPolygon } from '../theme'
import { CUE } from '../timeline'

const c = CUE.finale
// The logo file's geometry (public/brand/cabal-city-*.svg): 650×175, the
// star's centre at (24 + 55.1, 24 + 63.6), radius 63.6.
const VIEW_W = 650
const VIEW_H = 175
const STAR_X = 24 + 55.1
const STAR_Y = 24 + 63.6
const STAR_R = 63.6

export function Finale() {
  const f = useCurrentFrame()
  const fmt = useFormat()
  const big = finaleStar(fmt)

  const LW = fmt.portrait ? fmt.w * 0.8 : 860
  const k = LW / VIEW_W
  const LH = VIEW_H * k
  const logoCy = fmt.portrait ? fmt.h * 0.42 : fmt.h * 0.4
  const left = fmt.w / 2 - LW / 2
  const top = logoCy - LH / 2
  const small = { cx: left + STAR_X * k, cy: top + STAR_Y * k, r: STAR_R * k }

  const solid = p(f, c.solid, 8)
  const shrink = p(f, c.shrink, 26, inOut)
  const cx = mix(big.cx, small.cx, shrink)
  const cy = mix(big.cy, small.cy, shrink)
  const r = mix(big.r, small.r, shrink)
  const turn = mix(0, 0, shrink)

  const word = p(f, c.word, 30, out)
  const flash = p(f, c.hit, 2) * (1 - p(f, c.hit + 2, 26))
  const stripe = p(f, c.stripes, 40, inOut)
  const place = p(f, c.place, 18)
  const note = p(f, c.place + 20, 18)

  const taglineY = top + LH + (fmt.portrait ? 70 : 54)
  const tagSize = fmt.portrait ? 76 : 64
  const placeY = taglineY + tagSize * 1.1 + 34
  const stripeH = fmt.portrait ? 12 : 10
  const stripeTop = top - (fmt.portrait ? 150 : 96)
  const stripeBottom = placeY + (fmt.portrait ? 130 : 84)

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% ${(big.cy / fmt.h) * 100}%, ${C.star}40, transparent 60%)`, opacity: flash }} />

      {[stripeTop, stripeBottom].map((y, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: fmt.w / 2 - (fmt.w / 2) * stripe,
            width: fmt.w * stripe,
            top: y,
            height: stripeH,
            background: C.flag,
            opacity: 0.9,
          }}
        />
      ))}

      <svg width={fmt.w} height={fmt.h} style={{ position: 'absolute', inset: 0 }}>
        <polygon points={pointsAttr(starPolygon(cx, cy, r))} fill={C.star} opacity={solid} transform={`rotate(${turn} ${cx} ${cy})`} />
        <g transform={`translate(${left + 24 * k} ${top + 24 * k}) scale(${k})`} opacity={word}>
          <defs>
            <clipPath id="reveal">
              <rect x={110} y={-20} width={(VIEW_W - 110) * word} height={VIEW_H} />
            </clipPath>
          </defs>
          <g clipPath="url(#reveal)" transform={`translate(${(1 - word) * -24} 0)`}>
            {wordmark.map((path, i) => (
              <path key={i} d={path.d} fill={path.fill} transform="translate(-24 -24)" />
            ))}
          </g>
        </g>
      </svg>

      <div style={{ position: 'absolute', left: 0, right: 0, top: taglineY, display: 'flex', justifyContent: 'center' }}>
        <Words text="Lock in. Build together." frame={f} at={c.tagline} size={tagSize} stagger={4} align="center" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: placeY,
          textAlign: 'center',
          fontFamily: MONO,
          fontSize: fmt.portrait ? 26 : 22,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: C.muted,
          opacity: place,
          transform: `translateY(${(1 - place) * 10}px)`,
        }}
      >
        Chicago is the first community
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: fmt.portrait ? 80 : 40,
          textAlign: 'center',
          fontFamily: MONO,
          fontSize: 15,
          letterSpacing: '0.04em',
          color: C.dim,
          opacity: note * 0.8,
        }}
      >
        Product shown with illustrative demo content.
      </div>
    </AbsoluteFill>
  )
}
