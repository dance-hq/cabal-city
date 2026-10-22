import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isPublicAddress } from '@/lib/safe-fetch'
import { isCrossSite } from '@/lib/same-origin'

vi.mock('server-only', () => ({}))

const headers = (h: Record<string, string>) => new Headers(h)

describe('cross-site request check', () => {
  it('lets same-site requests through, including behind a proxy', () => {
    expect(isCrossSite(headers({ origin: 'https://www.cabal.city', host: 'www.cabal.city' }))).toBe(false)
    expect(isCrossSite(headers({ origin: 'https://www.cabal.city', host: 'internal:3000', 'x-forwarded-host': 'www.cabal.city' }))).toBe(false)
    expect(isCrossSite(headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }))).toBe(false)
  })

  it('lets requests without an Origin through (no browser, so no ambient cookies)', () => {
    expect(isCrossSite(headers({ host: 'www.cabal.city' }))).toBe(false)
  })

  it('refuses another site, a lookalike host, and opaque origins', () => {
    expect(isCrossSite(headers({ origin: 'https://evil.example', host: 'www.cabal.city' }))).toBe(true)
    expect(isCrossSite(headers({ origin: 'https://www.cabal.city.evil.example', host: 'www.cabal.city' }))).toBe(true)
    expect(isCrossSite(headers({ origin: 'https://cabal.city', host: 'www.cabal.city' }))).toBe(true)
    expect(isCrossSite(headers({ origin: 'null', host: 'www.cabal.city' }))).toBe(true)
  })

  it('guards every route that changes state with cookies', () => {
    for (const route of ['auth/code', 'session/bootstrap', 'account/delete', 'feedback', 'reports/sealed']) {
      const src = readFileSync(join(process.cwd(), 'app/api', route, 'route.ts'), 'utf8')
      expect(src, route).toMatch(/if \(isCrossSite\(request\.headers\)\) return crossSiteResponse\(\)/)
    }
  })
})

describe('link previews never reach private networks', () => {
  it.each([
    '::',
    '::1',
    '::127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b:1::1',
    '2001:0:4136:e378::1',
    '2002:c0a8:0101::1',
    'fec0::1',
    'fd00::1',
    'fe80::1',
    '192.88.99.1',
    '169.254.169.254',
    '100.64.0.1',
    '10.0.0.1',
    '127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(['93.184.215.14', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001::200e'])('allows %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })
})

describe('sign-in code hashing', () => {
  it('never falls back to a guessable key', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/auth/code/route.ts'), 'utf8')
    expect(src).not.toMatch(/\?\? 'cabal'/)
    expect(src).toMatch(/throw new Error\('SUPABASE_JWT_SECRET is not set'\)/)
  })
})
