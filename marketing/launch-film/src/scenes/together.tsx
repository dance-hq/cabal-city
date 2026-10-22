import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Avatar, Label, Panel, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { inOut, mix, p, useFormat } from '../motion'
import { C, MONO } from '../theme'
import { CUE, FOCUS_TEXT, SCENES } from '../timeline'

const LEN = SCENES.together[1] - SCENES.together[0]

// "Locked in now", sorted by who started first (lock-in-panel.tsx).
// Illustrative demo members.
export const LOCKED_IN = [
  { name: 'Lena Kowalski', on: 'Launch prep for Tuesday', time: '2h 05m' },
  { name: 'Maya Okafor', on: 'Pitch deck for Thursday', time: '1h 12m' },
  { name: 'Dev Patel', on: 'Shipping the iOS build', time: '48m' },
  { name: 'Marcus Reed', on: 'Customer interviews, round 3', time: '35m' },
  { name: 'Ana Ruiz', on: 'Onboarding flow for clinics', time: '22m' },
  { name: 'Jordan Lee', on: 'Product Hunt assets', time: '9m' },
  { name: 'Sam Rivera', on: FOCUS_TEXT, time: '0m', you: true },
]

const ROW_H = 48

export function Together() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const c = CUE.together
  const S = fmt.portrait ? 2.5 : 1.95

  // Rows appear above yours, one per beat: the people already heads down.
  const others = LOCKED_IN.length - 1
  const reveal = LOCKED_IN.map((_, i) => (i === others ? 1 : p(frame, c.rowEvery * (others - i), 12)))
  const count = 1 + reveal.slice(0, others).filter((r) => r > 0.5).length

  const pull = p(frame, c.pull, c.pullLen, inOut)
  const cardScale = mix(1, 0.035, pull)
  const cardOpacity = 1 - p(frame, c.pull + 22, 20)
  const enter = p(frame, 0, 14)
  const exit = p(frame, LEN - 16, 16, inOut)

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: cardOpacity }}>
        <div style={{ transform: `scale(${cardScale * mix(0.97, 1, enter)})` }}>
          <Zoom scale={S}>
            <Panel width={330} style={{ padding: '14px 16px 10px' }}>
              <Label>Locked in now · {count}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {LOCKED_IN.map((r, i) => (
                  <div
                    key={r.name}
                    style={{
                      height: ROW_H * reveal[i],
                      opacity: reveal[i],
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: ROW_H, transform: `translateY(${(1 - reveal[i]) * -8}px)` }}>
                      <Avatar name={r.name} lockedIn glow={0.5 + 0.5 * Math.sin((frame + i * 20) / 40)} />
                      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                          {r.name}
                          {r.you && <span style={{ fontWeight: 400, color: C.muted }}> (you)</span>}
                        </span>
                        <span style={{ fontSize: 13, lineHeight: 1.4, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.on}
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11, color: C.muted }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: C.flag }} />
                        {r.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </Zoom>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 1 - exit,
          background: `radial-gradient(ellipse ${fmt.portrait ? '90% 24%' : '55% 32%'} at 50% 50%, ${C.ink}d9 25%, ${C.ink}00 100%)`,
        }}
      >
        <Words
          text={fmt.portrait ? 'All over Chicago,\npeople are shipping.' : 'All over Chicago, people are shipping.'}
          frame={frame}
          at={c.captionA}
          size={fmt.portrait ? 84 : 80}
          align="center"
          dim={p(frame, c.captionB, 14)}
        />
        <Words
          text="It’s contagious."
          frame={frame}
          at={c.captionB}
          size={fmt.portrait ? 96 : 88}
          align="center"
          color={C.gold}
          style={{ marginTop: 18 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
