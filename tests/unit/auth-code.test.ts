import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/code/route'

// The sign-in route against a stand-in for Supabase's admin API. Like Supabase Auth, the stand-in
// keeps one account per email and remembers whether it was ever confirmed.

type Account = { id: string; confirmed: boolean }

const auth = vi.hoisted(() => ({
  accounts: new Map<string, Account>(),
  joinPolicy: 'open' as 'open' | 'invite',
  failDelete: false,
  // Someone signs up directly with Supabase again right after an account is removed.
  signUpAgainAfterDelete: false,
  deleted: [] as string[],
  sent: [] as string[],
  ids: 0,
}))

vi.mock('@/lib/email', () => ({
  sendSignInCode: async (email: string) => {
    auth.sent.push(email)
    return 'sent'
  },
}))

vi.mock('@/lib/supabase/admin', () => {
  // Every query builder call returns the builder; awaiting it gives `result`.
  const query = (result: unknown): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === 'then' ? (resolve: (value: unknown) => void) => resolve(result) : () => query(result),
      },
    )
  const user = (email: string, a: Account) => ({
    id: a.id,
    email,
    email_confirmed_at: a.confirmed ? '2026-10-20T00:00:00Z' : null,
  })
  const admin = {
    from: (table: string) =>
      query(
        table === 'communities'
          ? { data: { join_policy: auth.joinPolicy, invite_code: 'the-invite' }, error: null }
          : { count: 0, data: null, error: null },
      ),
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          if (auth.accounts.has(email)) {
            return { data: { user: null }, error: { code: 'email_exists', message: 'already registered' } }
          }
          const a = { id: `cabal-${++auth.ids}`, confirmed: true }
          auth.accounts.set(email, a)
          return { data: { user: user(email, a) }, error: null }
        },
        generateLink: async ({ email }: { email: string }) => {
          const a = auth.accounts.get(email)
          if (!a) return { data: { properties: null, user: null }, error: { message: 'User not found' } }
          return { data: { properties: { email_otp: '123456' }, user: user(email, a) }, error: null }
        },
        deleteUser: async (id: string) => {
          if (auth.failDelete) return { data: null, error: { message: 'delete failed' } }
          for (const [email, a] of auth.accounts) {
            if (a.id !== id) continue
            auth.accounts.delete(email)
            if (auth.signUpAgainAfterDelete) auth.accounts.set(email, { id: `outside-${++auth.ids}`, confirmed: false })
          }
          auth.deleted.push(id)
          return { data: {}, error: null }
        },
      },
    },
  }
  return { createAdminClient: () => admin }
})

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  auth.accounts.clear()
  auth.joinPolicy = 'open'
  auth.failDelete = false
  auth.signUpAgainAfterDelete = false
  auth.deleted.length = 0
  auth.sent.length = 0
})

describe('POST /api/auth/code', () => {
  it('replaces an account Cabal never confirmed before sending a code', async () => {
    // A direct Supabase sign-up leaves an unconfirmed account that may hold someone else's password.
    auth.accounts.set('pat@example.com', { id: 'outside', confirmed: false })
    const res = await POST(request({ email: 'pat@example.com' }))
    expect(res.status).toBe(200)
    expect(auth.deleted).toEqual(['outside'])
    expect(auth.accounts.get('pat@example.com')).toMatchObject({ confirmed: true })
    expect(auth.accounts.get('pat@example.com')?.id).not.toBe('outside')
    expect(auth.sent).toEqual(['pat@example.com'])
  })

  it('keeps an account Cabal made', async () => {
    auth.accounts.set('sam@example.com', { id: 'cabal-sam', confirmed: true })
    const res = await POST(request({ email: 'sam@example.com' }))
    expect(res.status).toBe(200)
    expect(auth.deleted).toEqual([])
    expect(auth.accounts.get('sam@example.com')?.id).toBe('cabal-sam')
    expect(auth.sent).toEqual(['sam@example.com'])
  })

  it('makes a confirmed account for a new email', async () => {
    const res = await POST(request({ email: 'new@example.com' }))
    expect(res.status).toBe(200)
    expect(auth.accounts.get('new@example.com')).toMatchObject({ confirmed: true })
    expect(auth.sent).toEqual(['new@example.com'])
  })

  it('sends no code when the unconfirmed account cannot be removed', async () => {
    auth.accounts.set('pat@example.com', { id: 'outside', confirmed: false })
    auth.failDelete = true
    const res = await POST(request({ email: 'pat@example.com' }))
    expect(res.status).toBe(500)
    expect(auth.sent).toEqual([])
  })

  it('sends no code if another direct sign-up lands right after the removal', async () => {
    auth.accounts.set('pat@example.com', { id: 'outside', confirmed: false })
    auth.signUpAgainAfterDelete = true
    const res = await POST(request({ email: 'pat@example.com' }))
    expect(res.status).toBe(500)
    expect(auth.sent).toEqual([])
  })

  it('treats a replaced account as new on an invite-only community', async () => {
    auth.joinPolicy = 'invite'
    auth.accounts.set('pat@example.com', { id: 'outside', confirmed: false })
    const res = await POST(request({ email: 'pat@example.com' }))
    expect(res.status).toBe(403)
    expect(auth.accounts.has('pat@example.com')).toBe(false)
    expect(auth.sent).toEqual([])
  })
})
