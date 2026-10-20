import { describe, expect, it } from 'vitest'
import { normalizeAppUrl, normalizeGithubRepo } from '@/lib/config'

describe('deployment settings', () => {
  it('accepts a bare domain or a full address', () => {
    expect(normalizeAppUrl('cabal.city')).toBe('https://cabal.city')
    expect(normalizeAppUrl(' https://cabal.city/ ')).toBe('https://cabal.city')
    expect(normalizeAppUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeAppUrl('')).toBe('')
  })

  it('accepts owner/repo or a GitHub link', () => {
    expect(normalizeGithubRepo('https://github.com/dance-hq/cabal-city')).toBe('dance-hq/cabal-city')
    expect(normalizeGithubRepo('github.com/dance-hq/cabal-city.git')).toBe('dance-hq/cabal-city')
    expect(normalizeGithubRepo('dance-hq/cabal-city')).toBe('dance-hq/cabal-city')
    expect(normalizeGithubRepo('not a repo')).toBe('')
  })
})
