import { Composition } from 'remotion'
import { Film, TEASER_LENGTH, Teaser } from './film'
import { loadFonts } from './fonts'
import { FPS, TOTAL } from './timeline'

loadFonts()

export const Root = () => (
  <>
    <Composition id="launch" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ audio: 'audio/score.wav' as string | null }} />
    <Composition id="launch-vertical" component={Film} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={{ audio: 'audio/score.wav' as string | null }} />
    <Composition id="teaser" component={Teaser} durationInFrames={TEASER_LENGTH} fps={FPS} width={1920} height={1080} defaultProps={{ audio: 'audio/teaser.wav' as string | null }} />
    <Composition id="teaser-vertical" component={Teaser} durationInFrames={TEASER_LENGTH} fps={FPS} width={1080} height={1920} defaultProps={{ audio: 'audio/teaser.wav' as string | null }} />
  </>
)
