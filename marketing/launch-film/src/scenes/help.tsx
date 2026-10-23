import { Hash } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Split } from '../components/split'
import { PaneHeader, Panel, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { p, useFormat } from '../motion'
import { C, MONO, NICK } from '../theme'
import { CUE, SCENES } from '../timeline'

const LEN = SCENES.help[1] - SCENES.help[0]

// #launches in IRC style (message-list.tsx irc mode): time, name, words. The
// room topic is the real default one (0024_default_rooms.sql); the messages
// are illustrative demo content.
const TOPIC = 'Shipping something? Share it with the Cabal. Get feedback, support, and a little extra momentum.'

type Line = { time: string; name: string; nick: number; text: string; at: number }

const c = CUE.help
const LINES: Line[] = [
  { time: '9:02', name: 'Ana', nick: 3, text: 'We’re live on Product Hunt today. Scheduling for clinics. Honest feedback welcome.', at: c.launch },
  { time: '9:04', name: 'Marcus', nick: 1, text: 'Upvoted. Left you a note on the signup flow.', at: c.reply1 },
  { time: '9:05', name: 'Lena', nick: 5, text: 'Sent it to two clinic owners I know.', at: c.reply2 },
  { time: '9:07', name: 'Dev', nick: 2, text: 'Putting it in my newsletter tomorrow.', at: c.reply3 },
]

export function Help() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const S = fmt.portrait ? 2 : 1.72
  const W = 500
  const size = fmt.portrait ? 116 : 112

  const card = (
    <Zoom scale={S}>
      <Panel width={W} style={{ background: C.surface }}>
        <PaneHeader icon={<Hash size={16} />} title="launches" note={TOPIC} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, height: 236, padding: '14px 16px' }}>
          {LINES.map((l) => {
            const t = p(frame, l.at, 14)
            return (
              <div
                key={l.time}
                style={{
                  display: 'flex',
                  gap: 12,
                  // Each message opens its own space so the thread glides up (.message-enter).
                  maxHeight: 72 * t,
                  overflow: 'hidden',
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
        </div>
        <div style={{ margin: '0 12px 12px', height: 40, borderRadius: 8, border: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: C.dim }}>
          Message #launches
        </div>
      </Panel>
    </Zoom>
  )

  const words = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: fmt.portrait ? 'center' : 'flex-start' }}>
      <Words text="Launch." frame={frame} at={c.launch} size={size} dim={p(frame, c.reply1, 12)} />
      <Words text="Get feedback." frame={frame} at={c.reply1} size={size} dim={p(frame, c.reply2 + 8, 12)} />
      <Words text="Get traction." frame={frame} at={c.reply2 + 8} size={size} />
      <Words
        text={'Chicago builders show up\nfor each other’s launches.'}
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
