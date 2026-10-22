import { loadFont } from '@remotion/fonts'
import { staticFile } from 'remotion'

// Geist and Geist Mono, the app's two families (from the `geist` package, OFL).
const FACES: [family: string, file: string, weight: string][] = [
  ['Geist', 'Geist-Regular.woff2', '400'],
  ['Geist', 'Geist-Medium.woff2', '500'],
  ['Geist', 'Geist-SemiBold.woff2', '600'],
  ['Geist Mono', 'GeistMono-Regular.woff2', '400'],
  ['Geist Mono', 'GeistMono-Medium.woff2', '500'],
]

export function loadFonts() {
  return Promise.all(FACES.map(([family, file, weight]) => loadFont({ family, url: staticFile(`fonts/${file}`), weight })))
}
