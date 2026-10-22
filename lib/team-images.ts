import { createClient } from '@/lib/supabase/client'

export type TeamImageKind = 'logo' | 'banner'

const BUCKET = 'team-images'
const INPUT_MAX_BYTES = 20 * 1024 * 1024
const OUTPUT_MAX_BYTES = 3 * 1024 * 1024
// Logos are square; banners are cut to 4:1 so every team's header lines up.
const SIZE: Record<TeamImageKind, { width: number; height: number }> = {
  logo: { width: 512, height: 512 },
  banner: { width: 1600, height: 400 },
}

export class TeamImageError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Redrawn on this device: cropped to shape from the middle, shrunk, and left
// without the camera/location data a photo carries.
export async function prepareTeamImage(file: File, kind: TeamImageKind): Promise<Blob> {
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
    const ratio = target.width / target.height
    let sw = bitmap.width
    let sh = bitmap.height
    if (sw / sh > ratio) sw = Math.round(sh * ratio)
    else sh = Math.round(sw / ratio)
    const sx = Math.round((bitmap.width - sw) / 2)
    const sy = Math.round((bitmap.height - sh) / 2)
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
