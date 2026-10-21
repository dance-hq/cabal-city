export const dynamic = 'force-dynamic'

// The build that's live right now. Open windows compare it with the build they loaded.
export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_CABAL_BUILD ?? '' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
