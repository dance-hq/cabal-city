import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { Zoom } from '../components/ui'
import { Words } from '../components/words'
import { inOut, p, useFormat } from '../motion'
import { C, MONO } from '../theme'
import { CUE, SCENES } from '../timeline'

const LEN = SCENES.open[1] - SCENES.open[0]
const c = CUE.open
const COMMAND = 'git clone https://github.com/dance-hq/cabal-city'

export function OpenSource() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const typed = COMMAND.slice(0, Math.max(0, Math.floor((frame - c.typeFrom) * 1.6)))
  const done = typed.length === COMMAND.length
  const card = p(frame, c.typeFrom - 8, 16)
  const license = p(frame, c.license, 12)
  const exit = p(frame, LEN - 16, 16, inOut)
  const S = fmt.portrait ? 1.55 : 1.75

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - exit, transform: `translateY(${-exit * 30}px)` }}>
      <Words text="Open source." frame={frame} at={c.headline} size={fmt.portrait ? 120 : 124} align="center" />
      <div style={{ marginTop: 56, opacity: card, transform: `translateY(${(1 - card) * 16}px)` }}>
        <Zoom scale={S}>
          <div
            style={{
              width: fmt.portrait ? 600 : 560,
              padding: '16px 18px',
              borderRadius: 12,
              background: C.card,
              border: `1px solid ${C.line}`,
              fontFamily: MONO,
              fontSize: fmt.portrait ? 12 : 13,
              lineHeight: 1.8,
              color: C.text,
              whiteSpace: 'nowrap',
            }}
          >
            <div>
              <span style={{ color: C.dim }}>$ </span>
              {typed}
              {!done && <span style={{ display: 'inline-block', width: 7, height: 15, marginLeft: 1, background: C.text, verticalAlign: -3 }} />}
            </div>
            <div style={{ opacity: license, color: C.muted }}>MIT License · Copyright (c) 2026 Cabal contributors</div>
          </div>
        </Zoom>
      </div>
      <Words
        text={'Made in Chicago.\nBuilt in the open.'}
        frame={frame}
        at={c.sub}
        size={fmt.portrait ? 48 : 44}
        weight={500}
        color={C.muted}
        stagger={2}
        tracking={-0.02}
        lineHeight={1.25}
        align="center"
        style={{ marginTop: 48 }}
      />
    </AbsoluteFill>
  )
}
