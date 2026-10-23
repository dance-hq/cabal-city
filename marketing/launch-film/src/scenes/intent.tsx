import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { FocusField, LockInControl } from '../components/lock-in'
import { Panel, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { inOut, mix, out, p, useFormat } from '../motion'
import { C } from '../theme'
import { CUE, FOCUS_TEXT, SCENES } from '../timeline'

const LEN = SCENES.intent[1] - SCENES.intent[0]

// Silence, two words, one button. The press starts the music.
export function Intent() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const c = CUE.intent
  const S = fmt.portrait ? 3.6 : 3.4

  const lift = p(frame, c.buttonIn - 6, 26, inOut)
  const lineY = mix(0, -fmt.h * (fmt.portrait ? 0.14 : 0.17), lift)
  const lineScale = mix(1, 0.72, lift)

  const btn = p(frame, c.buttonIn, 22)
  const press = p(frame, c.press - 3, 3, out) * (1 - p(frame, c.press, 12, out))
  const morph = p(frame, c.morph, 12, inOut)
  const seconds = Math.max(0, (frame - c.press) / 30)
  const breath = ((frame - c.press) % 90) / 90

  const ripple = p(frame, c.press, 34, out)
  const panel = p(frame, c.focusIn, 16)
  const typed = FOCUS_TEXT.slice(0, Math.max(0, Math.floor((frame - c.typeFrom) / 1.05)))
  const caret = frame >= c.focusIn && Math.floor(frame / 15) % 2 === 0
  const exit = p(frame, LEN - 14, 14, inOut)

  return (
    <AbsoluteFill style={{ background: C.ink, opacity: 1 - exit, transform: `scale(${1 - 0.04 * exit})` }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translateY(${lineY}px) scale(${lineScale})` }}>
          {/* Reads into the button below it: "Open Cabal. Lock in." */}
          <Words text="Open Cabal." frame={frame} at={c.line} stagger={6} size={fmt.portrait ? 128 : 112} align="center" />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 28,
            transform: `translateY(${fmt.h * 0.06 + (1 - btn) * 40}px)`,
            opacity: btn,
            filter: btn < 1 ? `blur(${(1 - btn) * 10}px)` : undefined,
          }}
        >
          {ripple > 0 && ripple < 1 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 14 * S,
                width: 520,
                height: 520,
                marginLeft: -260,
                marginTop: -260,
                borderRadius: '50%',
                border: `2px solid ${C.flag}`,
                transform: `scale(${0.2 + ripple * 1.4})`,
                opacity: (1 - ripple) * 0.5,
              }}
            />
          )}
          <Zoom scale={S}>
            <LockInControl morph={morph} press={press} seconds={seconds} breath={breath} />
          </Zoom>
          <div style={{ opacity: panel, transform: `translateY(${(1 - panel) * -16}px)` }}>
            <Zoom scale={S * 0.72}>
              <Panel width={328} style={{ padding: 12 }}>
                <FocusField text={typed} caret={caret} />
              </Panel>
            </Zoom>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
