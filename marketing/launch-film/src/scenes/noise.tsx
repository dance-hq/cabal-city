import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Words } from '../components/words'
import { out, p, rng, useFormat } from '../motion'
import { C, SANS } from '../theme'
import { noiseTimes } from '../timeline'

// Cold open: the always-on internet. Generic, unbranded pings that pile up
// faster and faster until a hard cut to silence.
const LINES = [
  'Are you around?',
  'Got a sec?',
  '12 unread',
  'You were mentioned',
  'Quick call?',
  'typing…',
  'Did you see this?',
  'Reminder: standup in 5',
  '3 new threads',
  'Still there?',
  '@here',
  'Following up',
  'New message',
  'Can you look at this?',
  '47 unread',
  'Just checking in',
  'Seen 2:14 PM',
  'Huddle started',
  '9 new replies',
  'Re: re: timeline',
  '@channel',
  'ping',
  '+1',
  '99+',
]

type Ping = { x: number; y: number; at: number; text: string; badge: string | null; tilt: number }

function pings(portrait: boolean): Ping[] {
  const random = rng(11)
  return noiseTimes().map((at, i) => {
    let x = 0
    let y = 0
    // Keep the first few clear of the headline so it reads before the pile-up.
    for (let tries = 0; tries < 20; tries++) {
      x = 0.04 + random() * 0.84
      y = 0.05 + random() * 0.88
      const band = portrait ? y > 0.4 && y < 0.6 : y > 0.36 && y < 0.62 && x > 0.12 && x < 0.7
      if (!band || i > 30) break
    }
    const n = random()
    return {
      x,
      y,
      at,
      text: LINES[i % LINES.length],
      badge: n > 0.7 ? String(1 + Math.floor(random() * 30)) : null,
      tilt: (random() - 0.5) * 2,
    }
  })
}

export function Noise() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const list = pings(fmt.portrait)
  const size = fmt.portrait ? 88 : 92
  const shake = p(frame, 118, 30)
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      {list.map((n, i) => {
        const t = p(frame, n.at, 10, out)
        if (t <= 0) return null
        const jitter = Math.sin(frame * 1.7 + i) * 3 * shake
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: n.x * fmt.w,
              top: n.y * fmt.h,
              transform: `translate(${jitter}px, ${(1 - t) * 18 - (frame - n.at) * 0.25}px) scale(${0.86 + 0.14 * t}) rotate(${n.tilt}deg)`,
              opacity: t * 0.92,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              borderRadius: 16,
              background: '#1A1B1F',
              border: '1px solid #2A2B30',
              boxShadow: '0 20px 40px -16px rgba(0,0,0,0.8)',
              fontFamily: SANS,
              fontSize: 24 * fmt.u,
              color: '#C9CBD0',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 30 * fmt.u, height: 30 * fmt.u, borderRadius: 999, background: '#2E3035', flexShrink: 0 }} />
            {n.text}
            {n.badge && (
              <span
                style={{
                  minWidth: 30 * fmt.u,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: '#E6E7EA',
                  color: C.ink,
                  fontSize: 18 * fmt.u,
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                {n.badge}
              </span>
            )}
          </div>
        )
      })}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(ellipse ${fmt.portrait ? '85% 26%' : '48% 30%'} at 50% 50%, ${C.ink}f2 30%, ${C.ink}00 100%)`,
        }}
      >
        <Words text={fmt.portrait ? 'Most apps want\nyou online.' : 'Most apps want you online.'} frame={frame} at={16} size={size} align="center" />
        <Words text="All the time." frame={frame} at={74} size={size} align="center" color={C.dim} style={{ marginTop: 8 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
