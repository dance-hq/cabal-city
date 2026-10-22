// Writes public/audio/score.wav. Everything is synthesized here, so the film
// carries no licensed audio. Run: node scripts/score.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { BAR, BEAT, CUE, FPS, PRESS, SCENES, TOTAL, noiseTimes } from '../src/timeline.ts'

const RATE = 44100
const LEN = Math.ceil((TOTAL / FPS) * RATE) + RATE
const L = new Float32Array(LEN)
const R = new Float32Array(LEN)
const sendL = new Float32Array(LEN)
const sendR = new Float32Array(LEN)

const sec = (frame: number) => frame / FPS
const at = (s: number) => Math.round(s * RATE)
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

let seed = 7
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

function put(i: number, v: number, pan: number, send: number) {
  if (i < 0 || i >= LEN) return
  const l = Math.cos(((pan + 1) * Math.PI) / 4)
  const r = Math.sin(((pan + 1) * Math.PI) / 4)
  L[i] += v * l
  R[i] += v * r
  sendL[i] += v * l * send
  sendR[i] += v * r * send
}

type Voice = { start: number; dur: number; gain: number; pan?: number; send?: number }

// A plain enveloped tone; `shape` picks the waveform.
function tone(freq: number, v: Voice & { attack?: number; release?: number; shape?: 'sine' | 'tri' | 'saw'; detune?: number }) {
  const a = v.attack ?? 0.005
  const rel = v.release ?? 0.3
  const n = at(v.dur + rel)
  const s0 = at(v.start)
  const voices = v.detune ? [-v.detune, 0, v.detune] : [0]
  let lp = 0
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    const env = t < a ? t / a : t < v.dur ? 1 : Math.max(0, 1 - (t - v.dur) / rel)
    let x = 0
    for (const d of voices) {
      const ph = (t * freq * Math.pow(2, d / 1200)) % 1
      if (v.shape === 'saw') x += 2 * ph - 1
      else if (v.shape === 'tri') x += 1 - 4 * Math.abs(ph - 0.5)
      else x += Math.sin(2 * Math.PI * ph)
    }
    x /= voices.length
    if (v.shape === 'saw') {
      lp += (x - lp) * 0.06
      x = lp
    }
    put(s0 + k, x * env * env * v.gain, v.pan ?? 0, v.send ?? 0.3)
  }
}

function pluck(freq: number, start: number, gain: number, pan = 0) {
  const n = at(1.2)
  const s0 = at(start)
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    const env = Math.exp(-t * 5.5) * Math.min(1, t / 0.003)
    const x = Math.sin(2 * Math.PI * freq * t) * 0.7 + Math.sin(4 * Math.PI * freq * t) * 0.3 * Math.exp(-t * 9)
    put(s0 + k, x * env * gain, pan, 0.45)
  }
}

function kick(start: number, gain: number) {
  const n = at(0.4)
  const s0 = at(start)
  let ph = 0
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    ph += (48 + 90 * Math.exp(-t * 30)) / RATE
    put(s0 + k, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * gain, 0, 0.02)
  }
}

function noiseHit(start: number, dur: number, gain: number, { hp = 0.6, pan = 0, send = 0.2, decay = 30 } = {}) {
  const n = at(dur)
  const s0 = at(start)
  let prev = 0
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    const w = rand()
    const x = w - prev * hp
    prev = w
    put(s0 + k, x * Math.exp(-t * decay) * gain, pan, send)
  }
}

// Short UI tick (keys, rows landing, a button).
const tick = (start: number, gain: number, pan = 0) => noiseHit(start, 0.03, gain, { hp: 0.95, pan, send: 0.05, decay: 180 })

// ── Before the press: notifications pile up over a rising, sour drone ─────────
const noiseEnd = sec(SCENES.noise[1])
noiseTimes().forEach((f, i) => {
  const s = sec(SCENES.noise[0] + f)
  const lift = 0.25 + 0.75 * (i / noiseTimes().length)
  const pitch = [88, 91, 84, 93, 86, 90][i % 6]
  const pan = Math.sin(i * 2.3) * 0.8
  tone(hz(pitch), { start: s, dur: 0.05, gain: 0.07 * lift, pan, release: 0.12, send: 0.15 })
  tone(hz(pitch + 7), { start: s + 0.06, dur: 0.04, gain: 0.05 * lift, pan, release: 0.1, send: 0.15 })
})
for (const m of [38, 39, 45, 46]) {
  const n = at(noiseEnd)
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    const env = Math.pow(t / noiseEnd, 2.2)
    put(k, Math.sin(2 * Math.PI * hz(m) * t + Math.sin(t * 3) * 0.4) * env * 0.05, m % 2 ? 0.3 : -0.3, 0.1)
  }
}
{
  // Riser that stops dead on the cut to silence.
  const n = at(noiseEnd)
  let lp = 0
  for (let k = 0; k < n; k++) {
    const t = k / RATE
    lp += (rand() - lp) * (0.02 + 0.3 * (t / noiseEnd))
    put(k, lp * Math.pow(t / noiseEnd, 3) * 0.12, 0, 0.05)
  }
}

// ── Intent: near silence, one sentence, then the button ───────────────────────
const intent0 = SCENES.intent[0]
tone(hz(81), { start: sec(intent0 + CUE.intent.buttonIn), dur: 0.02, gain: 0.03, release: 0.4, send: 0.6 })
tick(sec(PRESS) - 0.02, 0.35)
kick(sec(PRESS), 0.35)
for (let i = 0; i < 25; i++) tick(sec(intent0 + CUE.intent.typeFrom + i * 1.05) + rand() * 0.004, 0.09 + 0.03 * Math.abs(rand()), 0.1)

// ── Music from the press: 120 bpm, four warm chords ──────────────────────────
// Fmaj9, Am7, Dm9, B♭maj9 (#11), one bar each.
const CHORDS = [
  { root: 41, notes: [53, 57, 60, 64, 67] },
  { root: 45, notes: [52, 57, 60, 64, 67] },
  { root: 38, notes: [53, 57, 60, 62, 64] },
  { root: 46, notes: [53, 57, 62, 64, 65] },
]
const hit = SCENES.finale[0] + CUE.finale.hit
const beatSec = sec(BEAT)
const barSec = sec(BAR)
const bars = Math.floor((hit - PRESS) / BAR)
const after = (scene: keyof typeof SCENES, f = 0) => sec(SCENES[scene][0] + f)

for (let b = 0; b < bars; b++) {
  const s = sec(PRESS) + b * barSec
  const ch = CHORDS[b % 4]
  const swell = Math.min(1, 0.45 + b * 0.12)
  for (const n of ch.notes) tone(hz(n), { start: s, dur: barSec, gain: 0.022 * swell, attack: b === 0 ? 0.9 : 0.25, release: 0.6, shape: 'saw', detune: 9, pan: ((n % 5) - 2) * 0.2, send: 0.5 })
  tone(hz(ch.root), { start: s, dur: beatSec * 2.6, gain: 0.16 * swell, attack: 0.01, release: 0.2, send: 0.05 })
  tone(hz(ch.root + 12), { start: s + beatSec * 2.5, dur: beatSec * 1.2, gain: 0.07 * swell, attack: 0.01, release: 0.15, send: 0.05 })

  for (let q = 0; q < 4; q++) {
    const t = s + q * beatSec
    if (t >= after('together')) kick(t, 0.28)
    if (t >= after('together', CUE.together.pull)) noiseHit(t + beatSec / 2, 0.06, 0.05, { hp: 0.97, pan: 0.25, decay: 70 })
    if (t >= after('help') && (q === 1 || q === 3)) noiseHit(t, 0.12, 0.06, { hp: 0.5, send: 0.35, decay: 26 })
  }
  if (s >= after('help')) {
    const arp = [...ch.notes, ch.notes[2] + 12].map((n) => n + 12)
    for (let e = 0; e < 8; e++) pluck(hz(arp[(e * 3) % arp.length]), s + e * (beatSec / 2), 0.05, e % 2 ? 0.35 : -0.35)
  }
}

// ── Scene accents ─────────────────────────────────────────────────────────────
for (let i = 0; i < 7; i++) tick(after('together', CUE.together.rowsFrom + i * CUE.together.rowEvery), 0.12, 0.2)
// #launches: each message lands with a soft note that climbs as support builds.
for (const [i, f] of [CUE.help.launch, CUE.help.reply1, CUE.help.reply2, CUE.help.reply3].entries()) {
  tick(after('help', f), 0.12, 0.15)
  pluck(hz([79, 81, 84, 88][i]), after('help', f) + 0.02, 0.045, i % 2 ? 0.3 : -0.3)
}
tick(after('opps', CUE.opps.pick), 0.2)
pluck(hz(84), after('opps', CUE.opps.toast), 0.07)
pluck(hz(91), after('opps', CUE.opps.toast) + 0.08, 0.05)
tick(after('cal', CUE.cal.add), 0.2)
pluck(hz(88), after('cal', CUE.cal.add) + 0.05, 0.07)
for (let i = 0; i < 28; i++) tick(after('open', CUE.open.typeFrom + i), 0.07, -0.1)

// ── Finale: build into the hit, then let it ring ─────────────────────────────
{
  const from = after('finale', CUE.finale.gather)
  const to = sec(hit)
  const n = at(to - from)
  let lp = 0
  for (let k = 0; k < n; k++) {
    const t = k / n
    lp += (rand() - lp) * (0.02 + 0.4 * t)
    put(at(from) + k, lp * t * t * 0.18, 0, 0.3)
  }
}
const h = sec(hit)
kick(h, 0.6)
noiseHit(h, 2.4, 0.16, { hp: 0.3, send: 0.8, decay: 1.6 })
tone(hz(29), { start: h, dur: 1.2, gain: 0.35, attack: 0.005, release: 2.5, send: 0.1 })
const ringFor = sec(TOTAL) - h - 0.6
for (const n of [41, 53, 57, 60, 64, 67, 72]) tone(hz(n), { start: h, dur: ringFor, gain: 0.03, attack: 0.01, release: 0.8, shape: 'saw', detune: 7, pan: ((n % 5) - 2) * 0.25, send: 0.7 })
for (const [i, n] of [72, 76, 79, 84].entries()) pluck(hz(n), after('finale', CUE.finale.tagline) + i * beatSec * 0.5, 0.05, i % 2 ? 0.3 : -0.3)

// ── Room: a small comb/allpass reverb on the send ────────────────────────────
function reverb(src: Float32Array, out: Float32Array, spread: number) {
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(d + spread), i: 0, lp: 0 }))
  const aps = [556, 441].map((d) => ({ buf: new Float32Array(d + spread), i: 0 }))
  for (let k = 0; k < LEN; k++) {
    let y = 0
    for (const c of combs) {
      const o = c.buf[c.i]
      c.lp = o * 0.7 + c.lp * 0.3
      c.buf[c.i] = src[k] + c.lp * 0.84
      c.i = (c.i + 1) % c.buf.length
      y += o
    }
    for (const a of aps) {
      const o = a.buf[a.i]
      a.buf[a.i] = y + o * 0.5
      a.i = (a.i + 1) % a.buf.length
      y = o - y * 0.5
    }
    out[k] += y * 0.09
  }
}
reverb(sendL, L, 0)
reverb(sendR, R, 23)

// ── Master: fade the tail, soft clip, normalize ──────────────────────────────
const end = at(sec(TOTAL))
const fade = at(1.4)
for (let k = 0; k < LEN; k++) {
  const g = k >= end ? 0 : k > end - fade ? (end - k) / fade : 1
  L[k] = Math.tanh(L[k] * 1.2 * g)
  R[k] = Math.tanh(R[k] * 1.2 * g)
}
let peak = 0
for (let k = 0; k < end; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]))
const norm = 0.89 / peak

function wav(left: Float32Array, right: Float32Array, frames: number) {
  const buf = Buffer.alloc(44 + frames * 4)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + frames * 4, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22)
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(frames * 4, 40)
  for (let k = 0; k < frames; k++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[k] * norm)) * 32767), 44 + k * 4)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[k] * norm)) * 32767), 46 + k * 4)
  }
  return buf
}

mkdirSync(new URL('../public/audio/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/audio/score.wav', import.meta.url), wav(L, R, end))
console.log(`score ${(end / RATE).toFixed(2)}s, peak ${peak.toFixed(3)}`)
