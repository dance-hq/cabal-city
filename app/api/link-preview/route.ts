import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePreview, type LinkPreviewData } from '@/lib/link-preview'
import { allowedUrl, fetchPage } from '@/lib/safe-fetch'

export const runtime = 'nodejs'

const FRESH_MS = 6 * 60 * 60_000
const MISS_MS = 30 * 60_000
const CACHE_SIZE = 500
const WINDOW_MS = 10 * 60_000
const PER_WINDOW = 120

// Per server instance: good enough to avoid refetching a link every time
// someone scrolls past it.
const cache = new Map<string, { at: number; preview: LinkPreviewData | null }>()
const recent = new Map<string, number[]>()

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const raw = request.nextUrl.searchParams.get('url') ?? ''
  const url = raw.length <= 2048 ? allowedUrl(raw) : null
  if (!url) return reply(null)
  const key = url.toString()

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < (hit.preview ? FRESH_MS : MISS_MS)) return reply(hit.preview)

  const now = Date.now()
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS)
  if (mine.length >= PER_WINDOW) return NextResponse.json({ error: 'Too many previews.' }, { status: 429 })
  mine.push(now)
  recent.set(user.id, mine)

  const page = await fetchPage(key).catch(() => null)
  const preview = page ? parsePreview(page.html, page.url) : null
  cache.delete(key)
  cache.set(key, { at: now, preview })
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
  return reply(preview)
}

function reply(preview: LinkPreviewData | null) {
  return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
}
