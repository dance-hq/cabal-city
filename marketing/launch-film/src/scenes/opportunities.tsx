import { Check, Forward, Plus, Radar } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Split } from '../components/split'
import { IconButton, PaneHeader, Panel, Toast, Zoom } from '../components/ui'
import { Words } from '../components/words'
import { out, p, useFormat } from '../motion'
import { C, MONO } from '../theme'
import { CUE, SCENES } from '../timeline'

const LEN = SCENES.opps[1] - SCENES.opps[0]
const c = CUE.opps

// Rows as opportunities.tsx draws them. Illustrative demo listings.
const ROWS = [
  {
    kicker: ['Funding & accelerators', 'Chicago'],
    soon: 'Closes in 6 days',
    title: 'Pre-seed founder residency',
    summary: 'Twelve weeks, a desk in the Loop, and a demo day with local investors.',
    fit: 'For founders',
  },
  {
    kicker: ['Credits & software', 'Online'],
    title: 'Cloud credits for early teams',
    summary: 'Credits and support for teams that haven’t raised a seed round yet.',
    fit: 'For founders and builders',
  },
  {
    kicker: ['Hackathons & competitions', 'Chicago', 'Nov 8'],
    title: 'Civic data hackathon',
    summary: 'A weekend building with open city data. Teams of up to four.',
    fit: 'For builders',
  },
]

export function Opportunities() {
  const frame = useCurrentFrame()
  const fmt = useFormat()
  const S = fmt.portrait ? 1.85 : 1.66
  const W = 520
  const picked = p(frame, c.pick, 8)
  const press = p(frame, c.pick + 4, 4) * (1 - p(frame, c.pick + 9, 8))
  const toast = p(frame, c.toast, 14, out)
  const size = fmt.portrait ? 92 : 88

  const card = (
    <div style={{ position: 'relative' }}>
      <Zoom scale={S}>
        <Panel width={W} style={{ background: C.surface }}>
          <PaneHeader icon={<Radar size={16} />} title="Opportunities" right={<IconButton><Plus size={16} /></IconButton>} />
          <div style={{ padding: '4px 20px 6px' }}>
            {ROWS.map((r, i) => {
              const t = p(frame, c.rows[i], 16)
              const hi = i === 0 ? picked : 0
              return (
                <div
                  key={r.title}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '14px 10px',
                    margin: '0 -10px',
                    borderRadius: 8,
                    borderTop: i ? `1px solid ${C.line}` : undefined,
                    background: `rgba(255,255,255,${0.04 * hi})`,
                    opacity: t,
                    transform: `translateY(${(1 - t) * 14}px)`,
                  }}
                >
                  <p style={{ margin: 0, display: 'flex', gap: 8, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>
                    {r.kicker.map((k, ki) => (
                      <span key={k}>
                        {ki > 0 && <span style={{ marginRight: 8 }}>·</span>}
                        {k}
                      </span>
                    ))}
                    {r.soon && (
                      <span style={{ color: C.star }}>
                        <span style={{ marginRight: 8, color: C.muted }}>·</span>
                        {r.soon}
                      </span>
                    )}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{r.title}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.55, color: `${C.text}e6` }}>{r.summary}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: `${C.text}cc` }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: C.flag }} />
                      {r.fit}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                      <IconButton active={i === 0 ? press + picked * 0.4 : 0}>
                        <Forward size={16} />
                      </IconButton>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </Zoom>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -30 * S,
          transform: `translate(-50%, ${(1 - toast) * 20}px)`,
          opacity: toast,
        }}
      >
        <Zoom scale={S}>
          <Toast icon={<Check size={15} color={C.flag} />}>Shared with Dev Patel</Toast>
        </Zoom>
      </div>
    </div>
  )

  const words = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: fmt.portrait ? 'center' : 'flex-start' }}>
      <Words
        text={'Find your\nnext break.'}
        frame={frame}
        at={c.headline}
        size={fmt.portrait ? 116 : 104}
        align={fmt.portrait ? 'center' : 'left'}
      />
      <Words
        text={'Residencies, credits and hackathons,\npicked for Chicago builders.'}
        frame={frame}
        at={c.sub}
        size={fmt.portrait ? 44 : 40}
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

  return <Split frame={frame} length={LEN} side="left" words={words} card={card} cardWidth={W * S} />
}
