import type { CSSProperties } from 'react'
import { p, out } from '../motion'
import { C, SANS } from '../theme'

type Props = {
  text: string
  frame: number
  at: number
  size: number
  weight?: number
  color?: string
  stagger?: number
  dur?: number
  tracking?: number
  lineHeight?: number
  align?: 'left' | 'center' | 'right'
  // 0..1: fades the whole block back (an earlier line making room for the next).
  dim?: number
  style?: CSSProperties
  font?: string
}

// Words arrive one after another: a short rise out of a soft blur. Lines
// break on "\n" only, so composition is decided here, never by the browser.
export function Words({
  text,
  frame,
  at,
  size,
  weight = 600,
  color = C.text,
  stagger = 3,
  dur = 20,
  tracking = -0.038,
  lineHeight = 1.04,
  align = 'left',
  dim = 0,
  style,
  font = SANS,
}: Props) {
  let index = 0
  const lines = text.split('\n')
  return (
    <div
      style={{
        fontFamily: font,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: `${tracking}em`,
        lineHeight,
        color,
        textAlign: align,
        opacity: 1 - dim * 0.7,
        fontFeatureSettings: '"ss01", "cv11"',
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: 'nowrap' }}>
          {line.split(' ').map((word, wi) => {
            const t = p(frame, at + index++ * stagger, dur, out)
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  opacity: t,
                  transform: `translateY(${(1 - t) * 0.32}em)`,
                  filter: t < 1 ? `blur(${(1 - t) * 0.12 * size}px)` : undefined,
                  marginRight: wi < line.split(' ').length - 1 ? '0.26em' : 0,
                }}
              >
                {word}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
