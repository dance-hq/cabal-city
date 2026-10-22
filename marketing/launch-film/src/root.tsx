import { Composition } from 'remotion'
import { Film } from './film'
import { loadFonts } from './fonts'
import { FPS, TOTAL } from './timeline'

loadFonts()

// One cut: the 9:16 Chicago launch film for social.
export const Root = () => (
  <Composition id="launch" component={Film} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={{ audio: 'audio/score.wav' as string | null }} />
)
