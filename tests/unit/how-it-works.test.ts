import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { allSources } from '@/lib/how-it-works'

// /how-it-works makes public claims about the code. If the code changes, this
// fails until the page (lib/how-it-works.ts) is updated to match.
describe('How Cabal works page', () => {
  const sources = allSources()

  it('only links to files and folders that exist', () => {
    const missing = sources.filter((s) => {
      const path = s.path.replace(/\/$/, '')
      if (!existsSync(path)) return true
      return s.path.endsWith('/') !== statSync(path).isDirectory()
    })
    expect(missing.map((s) => s.path)).toEqual([])
  })

  it('still matches the code it describes', () => {
    const stale = sources.flatMap((s) =>
      (s.proves ?? [])
        .filter((text) => !readFileSync(s.path, 'utf8').includes(text))
        .map((text) => `${s.path} no longer contains: ${text}`),
    )
    expect(stale).toEqual([])
  })
})
