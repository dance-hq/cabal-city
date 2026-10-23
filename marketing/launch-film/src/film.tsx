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
import { SCENES, type SceneName } from './timeline'

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
