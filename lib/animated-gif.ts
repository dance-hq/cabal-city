import { decompressFrames, parseGIF } from 'gifuct-js'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'

// Plain JS (no canvas) so it runs the same in the browser and in tests.

export type GifFrame = { rgba: Uint8ClampedArray; delay: number }
export type GifPicture = { width: number; height: number; frames: GifFrame[] }
export type GifCrop = { x: number; y: number; width: number; height: number }

// Beyond this the browser would stall while preparing it.
export const MAX_GIF_FRAMES = 400

// Every frame as the full picture it shows on screen (GIF frames are often
// only the changed patch, drawn over what was there before).
export function decodeGif(bytes: ArrayBuffer): GifPicture {
  const gif = parseGIF(bytes)
  const width = gif.lsd.width
  const height = gif.lsd.height
  const raw = decompressFrames(gif, true)
  if (!width || !height || raw.length === 0) throw new Error('empty gif')
  if (raw.length > MAX_GIF_FRAMES) throw new Error('too many frames')
  const screen = new Uint8ClampedArray(width * height * 4)
  const frames: GifFrame[] = []
  let restore: Uint8ClampedArray | null = null
  let previous: (typeof raw)[number] | null = null
  for (const frame of raw) {
    if (previous?.disposalType === 2) clearRect(screen, width, height, previous.dims)
    else if (previous?.disposalType === 3 && restore) screen.set(restore)
    restore = frame.disposalType === 3 ? screen.slice() : null
    drawPatch(screen, width, height, frame.patch, frame.dims)
    frames.push({ rgba: screen.slice(), delay: frame.delay })
    previous = frame
  }
  return { width, height, frames }
}

type Dims = { top: number; left: number; width: number; height: number }

function clearRect(screen: Uint8ClampedArray, width: number, height: number, d: Dims) {
  for (let y = Math.max(0, d.top); y < Math.min(height, d.top + d.height); y++) {
    screen.fill(0, (y * width + Math.max(0, d.left)) * 4, (y * width + Math.min(width, d.left + d.width)) * 4)
  }
}

function drawPatch(screen: Uint8ClampedArray, width: number, height: number, patch: Uint8ClampedArray, d: Dims) {
  for (let py = 0; py < d.height; py++) {
    const y = d.top + py
    if (y < 0 || y >= height) continue
    for (let px = 0; px < d.width; px++) {
      const x = d.left + px
      if (x < 0 || x >= width) continue
      const s = (py * d.width + px) * 4
      if (patch[s + 3] === 0) continue
      const t = (y * width + x) * 4
      screen[t] = patch[s]
      screen[t + 1] = patch[s + 1]
      screen[t + 2] = patch[s + 2]
      screen[t + 3] = 255
    }
  }
}

// Cuts the chosen part out of one frame and shrinks it by averaging, so the
// result stays smooth instead of jagged.
export function cropFrame(
  rgba: Uint8ClampedArray,
  width: number,
  crop: GifCrop,
  outWidth: number,
  outHeight: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outWidth * outHeight * 4)
  const sx = crop.width / outWidth
  const sy = crop.height / outHeight
  for (let oy = 0; oy < outHeight; oy++) {
    const y0 = crop.y + Math.floor(oy * sy)
    const y1 = Math.max(y0 + 1, crop.y + Math.floor((oy + 1) * sy))
    for (let ox = 0; ox < outWidth; ox++) {
      const x0 = crop.x + Math.floor(ox * sx)
      const x1 = Math.max(x0 + 1, crop.x + Math.floor((ox + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          const alpha = rgba[i + 3]
          r += rgba[i] * alpha
          g += rgba[i + 1] * alpha
          b += rgba[i + 2] * alpha
          a += alpha
          n++
        }
      }
      const o = (oy * outWidth + ox) * 4
      // GIF pixels are either shown or not, so half-covered edges round.
      if (a / n < 128) continue
      out[o] = r / a
      out[o + 1] = g / a
      out[o + 2] = b / a
      out[o + 3] = 255
    }
  }
  return out
}

export async function encodeGif(
  picture: GifPicture,
  crop: GifCrop,
  outWidth: number,
  outHeight: number,
  onYield: () => Promise<void> = () => Promise.resolve(),
): Promise<Uint8Array> {
  const encoder = GIFEncoder()
  for (let i = 0; i < picture.frames.length; i++) {
    const frame = picture.frames[i]
    const rgba = cropFrame(frame.rgba, picture.width, crop, outWidth, outHeight)
    const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true })
    const index = applyPalette(rgba, palette, 'rgba4444')
    const clear = palette.findIndex((c) => c[3] === 0)
    encoder.writeFrame(index, outWidth, outHeight, {
      palette,
      delay: frame.delay,
      repeat: 0,
      transparent: clear >= 0,
      transparentIndex: Math.max(0, clear),
      // Each frame is a whole picture, so clear before the next one is drawn.
      dispose: clear >= 0 ? 2 : 1,
    })
    if (i % 8 === 7) await onYield()
  }
  encoder.finish()
  return encoder.bytes()
}
