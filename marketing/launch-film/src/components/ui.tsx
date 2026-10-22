import type { CSSProperties, ReactNode } from 'react'
import { C, MONO, SANS } from '../theme'

// Reconstructions of Cabal's real components (components/cabal/*), drawn at
// app size and enlarged with CSS zoom so text stays crisp at any scale.

export function Zoom({ scale, children, style }: { scale: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ zoom: scale, ...style }}>{children}</div>
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// The initials avatar with the steady gold "locked in" ring (.locked-in).
export function Avatar({ name, size = 32, lockedIn = false, glow = 0.5 }: { name: string; size?: number; lockedIn?: boolean; glow?: number }) {
  const ring = size >= 32 ? 2 : 1.5
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <span
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          background: '#232428',
          color: C.text,
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: Math.max(10, Math.round(size * 0.38)),
        }}
      >
        {initials(name)}
      </span>
      {lockedIn && (
        <>
          <span
            style={{
              position: 'absolute',
              inset: -ring - 1.5,
              borderRadius: 999,
              boxShadow: `inset 0 0 0 ${ring}px ${C.gold}`,
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: -ring - 1.5,
              borderRadius: 999,
              boxShadow: `0 0 6px 0 ${C.gold}8c`,
              opacity: 0.35 + 0.35 * glow,
            }}
          />
        </>
      )}
    </span>
  )
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: C.muted,
        ...style,
      }}
    >
      {children}
    </p>
  )
}

// Popover / pane surface.
export function Panel({ children, width, style }: { children: ReactNode; width: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width,
        background: C.popover,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.65), 0 2px 0 rgba(255,255,255,0.02) inset',
        overflow: 'hidden',
        fontFamily: SANS,
        color: C.text,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// A pane's header row (components/cabal/page-header.tsx).
export function PaneHeader({ icon, title, note, right }: { icon: ReactNode; title: ReactNode; note?: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 48,
        padding: '0 16px',
        borderBottom: `1px solid ${C.line}`,
        background: C.surface,
      }}
    >
      <span style={{ display: 'flex', color: C.muted }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
      {note && (
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: C.muted }}>
          {note}
        </span>
      )}
      {right && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}>{right}</span>}
    </div>
  )
}

// The flag-blue light beside "Locked in", breathing.
export function BreathingLight({ size = 7, breath }: { size?: number; breath: number }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.flag }} />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: C.flag,
          transform: `scale(${1 + breath * 1.6})`,
          opacity: 0.45 * (1 - breath),
        }}
      />
    </span>
  )
}

// Sonner-style toast.
export function Toast({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 10,
        background: '#202124',
        border: `1px solid ${C.line}`,
        boxShadow: '0 16px 40px -12px rgba(0,0,0,0.7)',
        fontFamily: SANS,
        fontSize: 13,
        color: C.text,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </div>
  )
}

export function IconButton({ children, active = 0 }: { children: ReactNode; active?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        color: active > 0.5 ? C.text : C.muted,
        background: `rgba(255,255,255,${0.08 * active})`,
        transform: `scale(${1 - 0.08 * Math.sin(Math.min(1, active) * Math.PI)})`,
      }}
    >
      {children}
    </span>
  )
}
