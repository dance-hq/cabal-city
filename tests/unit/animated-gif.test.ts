import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { describe, expect, it } from 'vitest'
import { decodeGif, encodeGif } from '@/lib/animated-gif'

// A w×h GIF whose frame i is solid colors[i], with a transparent left half.
function makeGif(w: number, h: number, colors: [number, number, number][]) {
  const enc = GIFEncoder()
  for (const [r, g, b] of colors) {
    const rgba = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (x < w / 2) continue
        rgba.set([r, g, b, 255], i)
      }
    const palette = quantize(rgba, 16, { format: 'rgba4444', oneBitAlpha: true })
    const clear = palette.findIndex((c) => c[3] === 0)
    enc.writeFrame(applyPalette(rgba, palette, 'rgba4444'), w, h, {
      palette,
      delay: 100,
      transparent: clear >= 0,
      transparentIndex: Math.max(0, clear),
      dispose: 2,
    })
  }
  enc.finish()
  const bytes = enc.bytes()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const toBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('animated GIF logos', () => {
  it('keeps every frame, its timing and transparency after cropping and shrinking', async () => {
    const source = decodeGif(makeGif(200, 100, [[255, 0, 0], [0, 0, 255], [0, 255, 0]]))
    expect(source.frames).toHaveLength(3)

    // Square from the middle, shrunk to 50×50.
    const out = decodeGif(toBuffer(await encodeGif(source, { x: 50, y: 0, width: 100, height: 100 }, 50, 50)))
    expect(out.width).toBe(50)
    expect(out.height).toBe(50)
    expect(out.frames).toHaveLength(3)
    expect(out.frames.map((f) => f.delay)).toEqual([100, 100, 100])

    const px = (frame: number, x: number, y: number) => Array.from(out.frames[frame].rgba.slice((y * 50 + x) * 4, (y * 50 + x) * 4 + 4))
    expect(px(0, 5, 25)[3]).toBe(0) // left half stays see-through
    expect(px(0, 40, 25)).toEqual([255, 0, 0, 255])
    expect(px(1, 40, 25)).toEqual([0, 0, 255, 255])
    expect(px(2, 40, 25)).toEqual([0, 255, 0, 255])
    expect(px(2, 5, 25)[3]).toBe(0) // earlier frames don't show through
  })
})
