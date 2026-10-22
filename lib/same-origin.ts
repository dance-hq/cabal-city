// Defense in depth against cross-site requests to routes that change things.
// Session cookies are already SameSite=Lax, so a browser won't attach them to a
// cross-site POST; this also refuses any POST whose Origin names another site.
// Browsers always send Origin on POST. Requests without one (curl, server to
// server) carry no ambient cookies, so they aren't a CSRF risk and pass.
export function isCrossSite(headers: Headers): boolean {
  const origin = headers.get('origin')
  if (!origin) return false
  let from: string
  try {
    from = new URL(origin).host.toLowerCase()
  } catch {
    return true
  }
  // Behind a proxy the public host is x-forwarded-host; accept either.
  const hosts = [headers.get('x-forwarded-host'), headers.get('host')]
    .flatMap((h) => (h ? h.split(',') : []))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return !hosts.includes(from)
}

export function crossSiteResponse() {
  return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 })
}
