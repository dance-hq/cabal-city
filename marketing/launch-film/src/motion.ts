import { Easing, interpolate, useVideoConfig } from 'remotion'

// Long, confident deceleration for things arriving; symmetric for moves.
export const out = Easing.bezier(0.16, 1, 0.3, 1)
export const inOut = Easing.bezier(0.65, 0, 0.35, 1)
export const accel = Easing.bezier(0.55, 0, 0.85, 0.3)

export function p(frame: number, start: number, dur: number, easing: (t: number) => number = out): number {
  if (dur <= 0) return frame >= start ? 1 : 0
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  })
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t

// Deterministic randomness so every render (and the score) agrees.
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Arrive and leave inside a scene of `length` frames.
export function presence(frame: number, length: number, inLen = 14, outLen = 14) {
  const enter = p(frame, 0, inLen)
  const leave = p(frame, length - outLen, outLen, inOut)
  return { enter, leave, opacity: enter * (1 - leave) }
}

export type Format = { w: number; h: number; portrait: boolean; u: number }

// u = one "design pixel" for type and spacing, from the short side.
export function useFormat(): Format {
  const { width, height } = useVideoConfig()
  return { w: width, h: height, portrait: height > width, u: Math.min(width, height) / 1080 }
}
