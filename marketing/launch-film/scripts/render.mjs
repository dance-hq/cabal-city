// Renders the film into out/. The score is regenerated first so picture and
// sound always come from the same timeline: node scripts/render.mjs
import { execFileSync } from 'node:child_process'
import { availableParallelism } from 'node:os'

const CUTS = {
  launch: 'cabal-launch-chicago-9x16.mp4',
}

const wanted = process.argv.slice(2)
const names = wanted.length ? wanted : Object.keys(CUTS)
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

run('node', ['scripts/score.ts'])
for (const name of names) {
  if (!CUTS[name]) throw new Error(`Unknown cut "${name}". Choose from: ${Object.keys(CUTS).join(', ')}`)
  run('npx', [
    'remotion', 'render', 'src/index.ts', name, `out/${CUTS[name]}`,
    '--codec=h264', '--crf=18', '--pixel-format=yuv420p', '--audio-codec=aac', '--audio-bitrate=256k',
    `--concurrency=${Math.max(1, availableParallelism())}`, '--log=error',
  ])
}
