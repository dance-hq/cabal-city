import type { ReactNode } from 'react'
import { AbsoluteFill } from 'remotion'
import { inOut, mix, p, useFormat } from '../motion'

// Product scenes: words on one side, the real interface on the other
// (stacked on portrait). Both arrive from a soft blur and leave upward.
export function Split({
  frame,
  length,
  side,
  words,
  card,
  cardWidth,
}: {
  frame: number
  length: number
  side: 'left' | 'right'
  words: ReactNode
  card: ReactNode
  cardWidth: number
}) {
  const fmt = useFormat()
  const enter = p(frame, 0, 18)
  const cardIn = p(frame, 4, 22)
  const exit = p(frame, length - 16, 16, inOut)
  const dir = side === 'right' ? 1 : -1

  const cardStyle = {
    opacity: cardIn * (1 - exit),
    transform: fmt.portrait
      ? `translateY(${(1 - cardIn) * 60 - exit * 40}px)`
      : `translateX(${(1 - cardIn) * 80 * dir}px) translateY(${-exit * 40}px)`,
    filter: cardIn < 1 || exit > 0 ? `blur(${(1 - cardIn) * 12 + exit * 10}px)` : undefined,
  }
  const wordsStyle = { opacity: enter * (1 - exit), transform: `translateY(${-exit * 30}px)` }

  if (fmt.portrait) {
    return (
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: fmt.h * 0.1 }}>
        <div style={{ width: fmt.w * 0.86, ...wordsStyle }}>{words}</div>
        <div style={{ marginTop: 64, ...cardStyle }}>{card}</div>
      </AbsoluteFill>
    )
  }

  const pad = fmt.w * 0.075
  const gap = mix(96, 96, 0)
  return (
    <AbsoluteFill
      style={{
        flexDirection: side === 'right' ? 'row' : 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${pad}px`,
        gap,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, ...wordsStyle }}>{words}</div>
      <div style={{ width: cardWidth, flexShrink: 0, ...cardStyle }}>{card}</div>
    </AbsoluteFill>
  )
}
