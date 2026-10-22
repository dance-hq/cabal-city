import { useMemo } from 'react'
import { useCurrentFrame } from 'remotion'
import { inOut, mix, out, p, rng, useFormat, type Format } from '../motion'
import { C, insidePolygon, starPolygon } from '../theme'
import { CUE, SCENES } from '../timeline'

// The film's signature: the city as one enormous facade at night. Every lit
// window is someone who has locked in. At the end, the lights gather into
// Chicago's six-pointed star.

const PITCH_X = 27
const PITCH_Y = 33
const WIN_W = 15
const WIN_H = 20
const GROUP = 5
const GROUP_GAP = 12
const FLOOR = 7
const FLOOR_GAP = 10

type Win = {
  x: number
  y: number
  cx: number
  cy: number
  chance: number
  when: number
  tone: number
  star: boolean
  dist: number
  core: number
}

export function finaleStar(f: Format) {
  const cx = f.w / 2
  const cy = f.portrait ? f.h * 0.47 : f.h * 0.5
  const r = f.portrait ? f.w * 0.43 : f.h * 0.41
  return { cx, cy, r, pts: starPolygon(cx, cy, r) }
}

// Lit windows: the locked-in gold, then warm and plain window light, so the
// city reads as night rather than as a gold brand color.
const TONES = [C.gold, '#F3E6C8', C.text]
const UNLIT = C.card

function layout(f: Format): Win[] {
  const star = finaleStar(f)
  const random = rng(7)
  const spanX = f.w * 1.12
  const spanY = f.h * 1.12
  const cols = Math.ceil(spanX / PITCH_X)
  const rows = Math.ceil(spanY / PITCH_Y)
  const groupW = (GROUP * PITCH_X + GROUP_GAP) / GROUP
  const floorH = (FLOOR * PITCH_Y + FLOOR_GAP) / FLOOR
  const totalW = cols * groupW
  const totalH = rows * floorH
  const ox = (f.w - totalW) / 2
  const oy = (f.h - totalH) / 2
  const wins: Win[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * PITCH_X + Math.floor(c / GROUP) * GROUP_GAP
      const y = oy + r * PITCH_Y + Math.floor(r / FLOOR) * FLOOR_GAP
      const cx = x + WIN_W / 2
      const cy = y + WIN_H / 2
      wins.push({
        x,
        y,
        cx,
        cy,
        chance: random(),
        when: random(),
        tone: Math.floor(random() * 3),
        star: insidePolygon(cx, cy, star.pts),
        dist: Math.hypot(cx - star.cx, cy - star.cy) / star.r,
        core: Math.hypot(cx - f.w / 2, cy - f.h / 2),
      })
    }
  }
  // The seven people in the "Locked in now" list are the first lights.
  const nearest = [...wins].sort((a, b) => a.core - b.core).slice(0, 7)
  nearest.forEach((w, i) => {
    w.chance = -1 - i
  })
  return wins
}

const T = SCENES.together[0]
const FIN = SCENES.finale[0]

// How lit a window is at global frame g (0..1), and whether it has turned red.
function light(w: Win, g: number): number {
  let on = 0
  if (w.chance < 0) {
    const k = -w.chance - 1
    on = p(g, T + CUE.together.pull + 6 + k * 3, 6)
  } else if (w.chance < 0.22) {
    on = p(g, T + 122 + w.when * 120, 5)
  } else if (w.chance < 0.4) {
    on = p(g, 560 + ((w.chance - 0.22) / 0.18) * 560, 6)
  }
  // A few sessions end along the way.
  if (w.tone === 2 && w.when > 0.86) on *= 1 - p(g, 640 + w.chance * 400, 10)
  const f = g - FIN
  if (f >= 0) {
    if (w.star) on = Math.max(on, p(f, CUE.finale.gather + w.dist * 74 + w.when * 10, 7))
    else on *= 1 - p(f, 28 + w.when * 56, 14, inOut)
  }
  return on
}

export function City() {
  const g = useCurrentFrame()
  const fmt = useFormat()
  const wins = useMemo(() => layout(fmt), [fmt.w, fmt.h])

  const start = T + CUE.together.pull
  if (g < start) return null
  const f = g - FIN

  // Camera: from inside the Lock in list (very close) out to the whole
  // facade; a closer, drifting city behind the product scenes; full facade
  // again for the finale.
  const pull = p(g, start, CUE.together.pullLen + 10, inOut)
  const intoMiddle = p(g, SCENES.help[0] - 16, 30, inOut)
  const intoFinale = p(f, 0, 30, inOut)
  const middleZoom = 1.28
  let zoom = mix(3.6, 1, pull)
  zoom = mix(zoom, middleZoom, intoMiddle)
  zoom = mix(zoom, 1, intoFinale)
  const drift = (g - SCENES.help[0]) * 0.22 * intoMiddle * (1 - intoFinale)

  const reveal = p(g, start, 18)
  const middleOpacity = mix(1, 0.24, intoMiddle)
  const opacity = reveal * mix(middleOpacity, 1, intoFinale) * (1 - p(f, CUE.finale.solid + 2, 14, inOut))

  const hit = p(f, CUE.finale.hit, 5, out)
  const grow = p(f, CUE.finale.hit, 9, out)
  const star = finaleStar(fmt)
  const glow = p(f, CUE.finale.gather + 10, 100, inOut) * (1 - p(f, CUE.finale.solid, 16))

  return (
    <div style={{ position: 'absolute', inset: 0, opacity, transform: `translateX(${-drift}px) scale(${zoom})`, transformOrigin: '50% 50%' }}>
      <div
        style={{
          position: 'absolute',
          left: star.cx - star.r * 1.4,
          top: star.cy - star.r * 1.4,
          width: star.r * 2.8,
          height: star.r * 2.8,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, ${C.gold}33, transparent)`,
          opacity: glow,
        }}
      />
      <svg width={fmt.w} height={fmt.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {wins.map((w, i) => {
          const b = light(w, g)
          const red = w.star ? hit : 0
          const dx = w.star ? (PITCH_X - WIN_W + 1) * grow : 0
          const dy = w.star ? (PITCH_Y - WIN_H + 1) * grow : 0
          const fill = b > 0 ? (red > 0 ? (red > 0.5 ? C.star : TONES[w.tone]) : TONES[w.tone]) : UNLIT
          const hidden = f >= CUE.finale.hit && !w.star
          if (hidden) return null
          return (
            <g key={i}>
              {b > 0.02 && (
                <rect
                  x={w.x - 4 - dx / 2}
                  y={w.y - 4 - dy / 2}
                  width={WIN_W + 8 + dx}
                  height={WIN_H + 8 + dy}
                  rx={5}
                  fill={fill}
                  opacity={0.16 * b}
                />
              )}
              <rect
                x={w.x - dx / 2}
                y={w.y - dy / 2}
                width={WIN_W + dx}
                height={WIN_H + dy}
                rx={1.5}
                fill={b > 0.02 ? fill : UNLIT}
                opacity={b > 0.02 ? 0.25 + 0.75 * b : 1}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
