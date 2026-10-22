import { config } from '@/lib/config'

export const SITE_URL =
  config.appUrl ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')

// What search results and link previews say about the homepage. The title
// says what Cabal is (the share image carries the headline).
export const SITE_TITLE = 'Cabal · Open source messenger for Chicago builders'
export const SITE_DESCRIPTION =
  'Cabal is an open source home for Chicago’s builders and supporters. Find people working on interesting things, see who’s around, and build alongside them.'
export const SHARE_ALT =
  "cabal.city: Chicago builders, it’s time to lock in. The Chicago flag's four red stars, with an empty fifth."
