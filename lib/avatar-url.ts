// Profile photos load straight into every viewer's browser, so they may only come from this
// deployment's own Supabase "avatars" bucket. The database accepts any *.supabase.co project, which
// would let a member host their photo elsewhere and log who looks at them.
export function isOwnAvatarUrl(url: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  // A picture just picked on this device, shown before it uploads.
  if (url.startsWith('blob:')) return true
  const root = (supabaseUrl ?? '').trim().replace(/\/+$/, '')
  return root !== '' && url.startsWith(`${root}/storage/v1/object/public/avatars/`)
}
