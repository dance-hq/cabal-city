import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { allSources, allText } from '@/lib/docs'

// /docs makes public claims about the code. If the code changes, this fails
// until the page (lib/docs.ts) is updated to match.
describe('Docs page', () => {
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

  // The page is public: it explains how Cabal works without giving anyone a
  // map for abusing it. Exact limits, privileged keys and unfixed weaknesses
  // belong in SECURITY.md reports, not here.
  it('stays safe to publish', () => {
    const text = allText().join('\n').toLowerCase()
    const banned = ['master key', 'service role', 'service_role', 'secret', 'admin key', 'api key', 'bypass']
    expect(banned.filter((word) => text.includes(word))).toEqual([])

    const signIn = readFileSync('app/api/auth/code/route.ts', 'utf8')
    const limits = [...signIn.matchAll(/count:\s*(\d+),\s*minutes:\s*(\d+)/g)]
    expect(limits.length).toBeGreaterThan(0)
    const leaked = limits.flatMap(([, count, minutes]) =>
      [`${count} per`, `${count} codes`, `every ${minutes} minutes`].filter((phrase) => text.includes(phrase)),
    )
    expect(leaked).toEqual([])

    const proofs = sources.flatMap((s) => s.proves ?? []).join('\n')
    expect(proofs).not.toMatch(/PER_EMAIL|PER_IP|recent >=|interval '20 seconds'/)
  })
})
