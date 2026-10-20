import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SIGNED_IN_ONLY = ['/app', '/onboarding']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  if (!user && SIGNED_IN_ONLY.some((p) => path === p || path.startsWith(p + '/'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  return supabaseResponse
}
