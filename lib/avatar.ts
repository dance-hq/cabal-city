import { createClient } from '@/lib/supabase/client'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export function avatarProblem(file: File): string | null {
  if (!TYPES[file.type]) return 'Use a PNG, JPG, WebP or GIF image.'
  if (file.size > AVATAR_MAX_BYTES) return 'Pick an image under 2 MB.'
  return null
}

// Uploads into the signed-in user's own folder and returns the public URL.
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const problem = avatarProblem(file)
  if (problem) throw new Error(problem)
  const supabase = createClient()
  const path = `${userId}/avatar-${Date.now()}.${TYPES[file.type]}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error("Couldn't upload that image.")
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
