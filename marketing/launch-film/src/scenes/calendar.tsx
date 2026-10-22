import { CalendarDays, CalendarPlus, Forward, Plus } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Split } from '../components/split'
import { IconButton, PaneHeader, Panel, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { p, useFormat } from '../motion'
import { C, MONO } from '../theme'
import { CUE, SCENES } from '../timeline'

const LEN = SCENES.cal[1] - SCENES.cal[0]
const c = CUE.cal

// Day groups and event rows as calendar.tsx draws them. Illustrative events.
const DAYS = [
  {
    lead: 'Thursday',
    date: 'Oct 30',
    time: '8 AM – 9:30 AM',
    title: 'Builders’ breakfast',
    host: 'Maya Okafor',
    where: 'West Loop',
    summary: 'Coffee and quick demos. No slides.',
  },
  {
    lead: 'Saturday',
    date: 'Nov 1',
    time: '6 PM – 9 PM',
    title: 'Launch night',
    host: 'Chicago AI Cabal',
    where: 'Fulton Market',
    summary: 'Five teams show what they shipped this month.',
  },
]

export function Calendar() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const S = fmt.portrait ? 1.95 : 1.66
  const W = 520
  const add = p(frame, c.add, 4) * (1 - p(frame, c.add + 6, 10))
  const added = p(frame, c.add + 2, 6)

  const card = (
    <Zoom scale={S}>
      <Panel width={W} style={{ background: C.surface }}>
        <PaneHeader icon={<CalendarDays size={16} />} title="Calendar" right={<IconButton><Plus size={16} /></IconButton>} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '18px 20px 10px' }}>
          {DAYS.map((d, i) => {
            const t = p(frame, c.rows[i], 16)
            return (
              <div key={d.title} style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
                <p
                  style={{
                    margin: 0,
                    display: 'flex',
                    gap: 8,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${C.line}`,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: C.muted,
                  }}
                >
                  <span style={{ color: C.text }}>{d.lead}</span>
                  <span>{d.date}</span>
                </p>
                <div style={{ display: 'flex', gap: 20, padding: '14px 0 4px' }}>
                  <span style={{ width: 116, flexShrink: 0, fontFamily: MONO, fontSize: 12, lineHeight: '24px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
                    {d.time}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{d.title}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.5, color: C.muted }}>
                      Hosted by <span style={{ color: C.text, fontWeight: 500 }}>{d.host}</span> · {d.where}
                    </span>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: `${C.text}e6` }}>{d.summary}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                      <IconButton active={i === 0 ? add + added * 0.5 : 0}>
                        <CalendarPlus size={16} color={i === 0 && added > 0.5 ? C.flag : undefined} />
                      </IconButton>
                      <IconButton>
                        <Forward size={16} />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </Zoom>
  )

  const words = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: fmt.portrait ? 'center' : 'flex-start' }}>
      <Words text={'Then meet up\nin Chicago.'} frame={frame} at={c.headline} size={104} align={fmt.portrait ? 'center' : 'left'} />
      <Words
        text={'Breakfasts, demo nights and launches,\non one shared calendar.'}
        frame={frame}
        at={c.sub}
        size={fmt.portrait ? 40 : 38}
        weight={500}
        color={C.muted}
        stagger={2}
        tracking={-0.02}
        lineHeight={1.25}
        align={fmt.portrait ? 'center' : 'left'}
        style={{ marginTop: 32 }}
      />
    </div>
  )

  return <Split frame={frame} length={LEN} side="right" words={words} card={card} cardWidth={W * S} />
}
