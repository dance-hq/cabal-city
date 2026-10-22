import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion'
import { City } from './components/city'
import { Calendar } from './scenes/calendar'
import { Finale } from './scenes/finale'
import { Help } from './scenes/help'
import { Intent } from './scenes/intent'
import { Noise } from './scenes/noise'
import { OpenSource } from './scenes/open-source'
import { Opportunities } from './scenes/opportunities'
import { Together } from './scenes/together'
import { C } from './theme'
import { SCENES, TEASER_CUTS, type SceneName } from './timeline'

export { TEASER_LENGTH } from './timeline'

const PARTS: Record<SceneName, () => React.JSX.Element> = {
  noise: Noise,
  intent: Intent,
  together: Together,
  help: Help,
  opps: Opportunities,
  cal: Calendar,
  open: OpenSource,
  finale: Finale,
}

// The whole film on one global clock. The city lives under every scene from
// the moment it is revealed, so the lights carry through the product scenes.
export function FilmPicture() {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <City />
      {(Object.keys(SCENES) as SceneName[]).map((name) => {
        const [from, to] = SCENES[name]
        const Part = PARTS[name]
        return (
          <Sequence key={name} from={from} durationInFrames={to - from} name={name}>
            <Part />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

export function Film({ audio }: { audio: string | null }) {
  return (
    <>
      <FilmPicture />
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </>
  )
}

export function Teaser({ audio }: { audio: string | null }) {
  let at = 0
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      {TEASER_CUTS.map(([a, b]) => {
        const from = at
        at += b - a
        return (
          <Sequence key={a} from={from} durationInFrames={b - a}>
            <Sequence from={-a}>
              <FilmPicture />
            </Sequence>
          </Sequence>
        )
      })}
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  )
}
