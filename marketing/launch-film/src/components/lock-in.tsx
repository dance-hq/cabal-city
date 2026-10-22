import { ChartNoAxesColumn, Pause, Target } from 'lucide-react'
import { mix } from '../motion'
import { C, MONO, SANS } from '../theme'
import { BreathingLight } from './ui'

// The header Lock in control (components/cabal/session-bar.tsx) in its two
// shapes: the flag-blue split button, and the running timer pill.
// morph 0 → button, 1 → running. Drawn at app size; scale with Zoom.
export function LockInControl({ morph, press, seconds, breath }: { morph: number; press: number; seconds: number; breath: number }) {
  const width = mix(112, 150, morph)
  const minutes = Math.floor(seconds / 60)
  const timer = `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  return (
    <div
      style={{
        position: 'relative',
        width,
        height: 28,
        transform: `scale(${1 - 0.05 * press})`,
        fontFamily: SANS,
      }}
    >
      {/* Running pill */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 10,
          paddingRight: 2,
          borderRadius: 6,
          background: `${C.flag}26`,
          boxShadow: `inset 0 0 0 1px ${C.flag}66`,
          opacity: morph,
          fontSize: 12,
          color: C.text,
          whiteSpace: 'nowrap',
        }}
      >
        <BreathingLight breath={breath} />
        <span>Locked in</span>
        <span style={{ fontFamily: MONO, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{timer}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', color: C.muted }}>
          <Pause size={14} />
        </span>
      </div>
      {/* Split button */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          opacity: 1 - morph,
          color: C.flagInk,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: '6px 0 0 6px',
            background: C.flag,
          }}
        >
          <Target size={14} strokeWidth={2.2} />
          Lock in
        </span>
        <span
          style={{
            width: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '0 6px 6px 0',
            borderLeft: `1px solid ${C.flagInk}26`,
            background: C.flag,
          }}
        >
          <ChartNoAxesColumn size={14} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  )
}

// The focus field from the Lock in panel (lock-in-panel.tsx FocusField).
export function FocusField({ text, caret }: { text: string; caret: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 34,
        padding: '0 10px',
        borderRadius: 6,
        border: `1px solid ${C.line}`,
        background: C.surface,
        fontFamily: SANS,
        fontSize: 13,
      }}
    >
      <Target size={14} color={C.muted} />
      <span style={{ color: text ? C.text : C.muted, whiteSpace: 'nowrap' }}>
        {text || 'What are you working on? (optional)'}
        {caret && <span style={{ display: 'inline-block', width: 1, height: 15, marginLeft: 1, background: C.text, verticalAlign: -2 }} />}
      </span>
    </div>
  )
}
