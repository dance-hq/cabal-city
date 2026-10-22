import { Hash } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Split } from '../components/split'
import { PaneHeader, Panel, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { inOut, p, useFormat } from '../motion'
import { C, MONO, NICK } from '../theme'
import { CUE, SCENES } from '../timeline'

const LEN = SCENES.help[1] - SCENES.help[0]

// Rooms in IRC style (message-list.tsx irc mode): time, name, words.
// The room topics are the real default ones (0024_default_rooms.sql).
const ROOMS = {
  asks: 'Need something? Ask the Cabal. Feedback, introductions, collaborators, or a helping hand.',
  launches: 'Shipping something? Share it with the Cabal. Get feedback, support, and a little extra momentum.',
}

type Line = { time: string; name: string; nick: number; text: string; at: number }

const c = CUE.help
const ASKS: Line[] = [
  { time: '10:42', name: 'Maya', nick: 0, text: 'Anyone know a lawyer who does SAFEs? Raising our first round.', at: c.ask },
  { time: '10:44', name: 'Dev', nick: 2, text: 'Yes. Introducing you to mine over DM.', at: c.intro },
]
const LAUNCHES: Line[] = [
  { time: '11:05', name: 'Ana', nick: 3, text: 'Our scheduling app for clinics is live today. Honest feedback welcome.', at: c.launch },
  { time: '11:06', name: 'Marcus', nick: 1, text: 'Trying it now.', at: c.reply1 },
  { time: '11:07', name: 'Lena', nick: 5, text: 'Sent it to two clinics I know.', at: c.reply2 },
]

function Lines({ lines, frame }: { lines: Line[]; frame: number }) {
  return (
    <>
      {lines.map((l) => {
        const t = p(frame, l.at, 14)
        return (
          <div
            key={l.time + l.name}
            style={{
              display: 'flex',
              gap: 12,
              opacity: t,
              transform: `translateY(${(1 - t) * 10}px)`,
              fontSize: 14,
              lineHeight: '24px',
            }}
          >
            <span style={{ width: 44, flexShrink: 0, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {l.time}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ marginRight: 8, fontSize: 13, fontWeight: 600, color: NICK[l.nick] }}>{l.name}</span>
              <span style={{ color: `${C.text}e6` }}>{l.text}</span>
            </span>
          </div>
        )
      })}
    </>
  )
}

export function Help() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const S = fmt.portrait ? 1.85 : 1.72
  const W = 500
  const swap = p(frame, c.switchRoom, 14, inOut)
  const room = swap < 0.5 ? 'asks' : 'launches'
  const size = fmt.portrait ? 120 : 116

  const card = (
    <Zoom scale={S}>
      <Panel width={W} style={{ background: C.surface }}>
        <div style={{ opacity: swap < 0.5 ? 1 - swap * 2 : (swap - 0.5) * 2 }}>
          <PaneHeader icon={<Hash size={16} />} title={room} note={ROOMS[room]} />
        </div>
        <div style={{ position: 'relative', height: 236, padding: '14px 16px', overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              inset: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 4,
              opacity: 1 - swap,
              transform: `translateY(${-swap * 40}px)`,
            }}
          >
            <Lines lines={ASKS} frame={frame} />
          </div>
          <div
            style={{
              position: 'absolute',
              inset: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 4,
              opacity: swap,
            }}
          >
            <Lines lines={LAUNCHES} frame={frame} />
          </div>
        </div>
        <div style={{ margin: '0 12px 12px', height: 40, borderRadius: 8, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: C.dim }}>
          Message #{room}
        </div>
      </Panel>
    </Zoom>
  )

  const words = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: fmt.portrait ? 'center' : 'flex-start' }}>
      <Words text="Ask." frame={frame} at={c.ask} size={size} dim={p(frame, c.intro, 12)} />
      <Words text="Introduce." frame={frame} at={c.intro} size={size} dim={p(frame, c.launch, 12)} />
      <Words text="Launch." frame={frame} at={c.launch} size={size} />
      <Words
        text={fmt.portrait ? 'A room full of people\nwho want you to win.' : 'A room full of people\nwho want you to win.'}
        frame={frame}
        at={c.sub}
        size={fmt.portrait ? 44 : 40}
        weight={500}
        color={C.muted}
        stagger={2}
        tracking={-0.02}
        lineHeight={1.25}
        align={fmt.portrait ? 'center' : 'left'}
        style={{ marginTop: 28 }}
      />
    </div>
  )

  return <Split frame={frame} length={LEN} side="right" words={words} card={card} cardWidth={W * S} />
}
