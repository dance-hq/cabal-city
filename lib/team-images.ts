import { createClient } from '@/lib/supabase/client'

export type TeamImageKind = 'logo' | 'banner'

const BUCKET = 'team-images'
const INPUT_MAX_BYTES = 20 * 1024 * 1024
const OUTPUT_MAX_BYTES = 3 * 1024 * 1024
// One shape per kind, used for saving, cropping and every place it's shown, so
// what an owner picks in the cropper is exactly what members see.
export const TEAM_IMAGE_ASPECT: Record<TeamImageKind, number> = { logo: 1, banner: 6 }
const SIZE: Record<TeamImageKind, { width: number; height: number }> = {
  logo: { width: 512, height: 512 },
  banner: { width: 2400, height: 400 },
}

// What Team settings recommends uploading: the size we save at.
export function recommendedSize(kind: TeamImageKind): string {
  return `${SIZE[kind].width} × ${SIZE[kind].height} px`
}
// Below this many source pixels across, the picture is stretched on a big screen.
export const SHARP_WIDTH: Record<TeamImageKind, number> = { logo: 200, banner: 1200 }

// The part of the (orientation-corrected) image to keep, in its own pixels.
export type CropArea = { x: number; y: number; width: number; height: number }

export class TeamImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Keeps the chosen part at exactly the kind's shape and inside the picture.
export function fitCrop(crop: CropArea | null | undefined, imageWidth: number, imageHeight: number, ratio: number): CropArea {
  let width = crop ? crop.width : imageWidth
  let height = crop ? crop.height : imageHeight
  width = Math.max(1, Math.min(width, imageWidth))
  height = Math.max(1, Math.min(height, imageHeight))
  if (width / height > ratio) width = height * ratio
  else height = width / ratio
  const cx = crop ? crop.x + crop.width / 2 : imageWidth / 2
  const cy = crop ? crop.y + crop.height / 2 : imageHeight / 2
  const x = Math.min(Math.max(0, cx - width / 2), imageWidth - width)
  const y = Math.min(Math.max(0, cy - height / 2), imageHeight - height)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

// Redrawn on this device: cut to the chosen part (the middle if none), shrunk,
// and left without the camera/location data a photo carries.
export async function prepareTeamImage(file: File, kind: TeamImageKind, crop?: CropArea | null): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new TeamImageError('Pick an image file.')
  if (file.size > INPUT_MAX_BYTES) throw new TeamImageError('Pick an image under 20 MB.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new TeamImageError('Couldn’t read that image. Try a PNG or JPG.')
  }
  try {
    const target = SIZE[kind]
    const { x: sx, y: sy, width: sw, height: sh } = fitCrop(crop, bitmap.width, bitmap.height, TEAM_IMAGE_ASPECT[kind])
    const scale = Math.min(1, target.width / sw)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new TeamImageError('This browser can’t prepare images.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    // WebP keeps a logo's transparent background; PNG/JPG are the fallbacks for older browsers.
    const tries: [string, number | undefined][] = [
      ['image/webp', 0.9],
      [kind === 'logo' ? 'image/png' : 'image/jpeg', kind === 'logo' ? undefined : 0.86],
      ['image/jpeg', 0.75],
    ]
    for (const [type, quality] of tries) {
      const blob = await toBlob(canvas, type, quality)
      if (blob && blob.type === type && blob.size <= OUTPUT_MAX_BYTES) return blob
    }
    throw new TeamImageError('That image is too big. Try a smaller one.')
  } finally {
    bitmap.close()
  }
}

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

export async function uploadTeamImage(teamId: string, kind: TeamImageKind, blob: Blob): Promise<string> {
  const supabase = createClient()
  const path = `${teamId}/${kind}-${Date.now()}.${EXT[blob.type] ?? 'webp'}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new TeamImageError('Couldn’t upload that image.')
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Best effort: the old file is no longer shown anywhere once the team points elsewhere.
export function removeTeamImage(url: string | null | undefined) {
  const path = url && teamImagePath(url)
  if (path) void createClient().storage.from(BUCKET).remove([path])
}

function teamImagePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const at = url.indexOf(marker)
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length))
}

// Team pictures load in every member's browser, so only this deployment's own bucket is trusted.
export function isOwnTeamImageUrl(url: string | null | undefined, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!url) return false
  if (url.startsWith('blob:')) return true
  try {
    const own = new URL((supabaseUrl ?? '').trim())
    const pic = new URL(url)
    return pic.origin === own.origin && pic.pathname.startsWith(`${own.pathname.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/`)
  } catch {
    return false
  }
}
