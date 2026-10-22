// One clock for picture and sound. scripts/score.ts imports this file, so a
// cue moved here moves in both.
export const FPS = 30
// 120 bpm: one beat is exactly 15 frames, one bar 60.
export const BEAT = 15
export const BAR = 60
// The Lock in press. Music starts here; everything after sits on the bar grid.
export const PRESS = 240

export const SCENES = {
  noise: [0, 150],
  intent: [150, 300],
  together: [300, 540],
  help: [540, 720],
  opps: [720, 900],
  cal: [900, 1020],
  open: [1020, 1140],
  finale: [1140, 1440],
} as const satisfies Record<string, readonly [number, number]>

export type SceneName = keyof typeof SCENES
export const TOTAL = SCENES.finale[1]

// Scene-local cue frames (add the scene's start for global time).
export const CUE = {
  intent: { line: 14, buttonIn: 60, press: PRESS - SCENES.intent[0], morph: 96, focusIn: 110, typeFrom: 118 },
  together: { rowsFrom: 0, rowEvery: BEAT, pull: 108, pullLen: 52, captionA: 150, captionB: 186 },
  help: { header: 6, ask: 18, intro: 45, switchRoom: 92, launch: 104, reply1: 126, reply2: 146, sub: 150 },
  opps: { header: 6, rows: [16, 30, 44], pick: 82, toast: 92, headline: 14, sub: 108 },
  cal: { header: 6, rows: [16, 34], add: 66, headline: 12, sub: 50 },
  open: { headline: 8, typeFrom: 24, license: 66, sub: 76 },
  // Finale: star windows light from the middle out, the hit turns them red.
  finale: { gather: 18, hit: 120, solid: 128, shrink: 140, word: 164, tagline: 194, stripes: 218, place: 232 },
} as const

export const FOCUS_TEXT = 'Pricing page for the beta'

// The teaser is a cut of the master: [source start, source end] pairs played
// back to back. Picture and sound both read this list.
export const TEASER_CUTS: [number, number][] = [
  [84, 150],
  [196, 300],
  // 465 keeps the music on the beat across the next join (540 → 1260 is 48 beats).
  [465, 540],
  [1260, 1440],
]
export const TEASER_LENGTH = TEASER_CUTS.reduce((n, [a, b]) => n + b - a, 0)

// Noise: when each notification lands (scene-local), denser toward the cut.
export const NOISE_COUNT = 46
export function noiseTimes(): number[] {
  return Array.from({ length: NOISE_COUNT }, (_, i) => Math.round(10 + 132 * Math.pow(i / (NOISE_COUNT - 1), 0.62)))
}
