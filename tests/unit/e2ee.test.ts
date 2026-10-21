import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  commitmentOf,
  conversationKey,
  deviceCode,
  exportPublicKey,
  formatRecoveryKey,
  lockWithRecoveryKey,
  messageKey,
  newDeviceOffer,
  newKeyPair,
  newRecoveryKey,
  openFromDevice,
  openMessage,
  openWithMessageKey,
  openWithRecoveryKey,
  packKeyring,
  parseRecoveryKey,
  publicKeyOf,
  sealForDevice,
  sealMessage,
  securityCode,
  unpackKeyring,
  type MessageContext,
} from '@/lib/e2ee/crypto'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CHANNEL = '33333333-3333-4333-8333-333333333333'

async function person() {
  const pair = await newKeyPair()
  return { pair, publicKey: await exportPublicKey(pair.publicKey) }
}

const ctx = (over: Partial<MessageContext> = {}): MessageContext => ({
  channelId: CHANNEL,
  messageId: '44444444-4444-4444-8444-444444444444',
  authorId: ALICE,
  sk: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  rk: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ...over,
})

describe('Direct message encryption', () => {
  it('lets the two people read it, from either side', async () => {
    const [alice, bob] = await Promise.all([person(), person()])
    const fromAlice = await conversationKey(alice.pair.privateKey, bob.pair.publicKey)
    const toBob = await conversationKey(bob.pair.privateKey, alice.pair.publicKey)
    const env = await sealMessage(fromAlice, ctx(), 'see you at six 👋')
    expect(env.ct).not.toContain('six')
    expect(await openMessage(toBob, ctx(), env)).toBe('see you at six 👋')
    expect(await openMessage(fromAlice, ctx(), env)).toBe('see you at six 👋')
  })

  it("can't be read by a third person", async () => {
    const [alice, bob, eve] = await Promise.all([person(), person(), person()])
    const env = await sealMessage(await conversationKey(alice.pair.privateKey, bob.pair.publicKey), ctx(), 'hi')
    const eveGuess = await conversationKey(eve.pair.privateKey, alice.pair.publicKey)
    await expect(openMessage(eveGuess, ctx(), env)).rejects.toThrow()
  })

  it("fails if it's moved to another message, author or conversation", async () => {
    const [alice, bob] = await Promise.all([person(), person()])
    const key = await conversationKey(alice.pair.privateKey, bob.pair.publicKey)
    const env = await sealMessage(key, ctx(), 'hi')
    for (const moved of [
      { messageId: '55555555-5555-4555-8555-555555555555' },
      { authorId: BOB },
      { channelId: '66666666-6666-4666-8666-666666666666' },
    ]) {
      await expect(openMessage(key, ctx(moved), env)).rejects.toThrow()
    }
  })

  it('hides how long a message is', async () => {
    const [alice, bob] = await Promise.all([person(), person()])
    const key = await conversationKey(alice.pair.privateKey, bob.pair.publicKey)
    const short = await sealMessage(key, ctx(), 'ok')
    const longer = await sealMessage(key, ctx(), 'see you at the usual place at six')
    expect(short.ct.length).toBe(longer.ct.length)
  })

  it('reports reveal only the one message', async () => {
    const [alice, bob] = await Promise.all([person(), person()])
    const key = await conversationKey(alice.pair.privateKey, bob.pair.publicKey)
    const first = ctx()
    const second = ctx({ messageId: '77777777-7777-4777-8777-777777777777' })
    const env1 = await sealMessage(key, first, 'reported')
    const env2 = await sealMessage(key, second, 'private')
    const shared = await messageKey(key, first)
    expect(await openWithMessageKey(shared, first, env1)).toBe('reported')
    await expect(openWithMessageKey(shared, second, env2)).rejects.toThrow()
  })
})

describe('Recovery keys', () => {
  it('reads back despite dashes, spaces, lowercase and look-alike letters', () => {
    const key = newRecoveryKey()
    expect(key).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/)
    const bytes = parseRecoveryKey(key)!
    expect(formatRecoveryKey(bytes)).toBe(key)
    expect(parseRecoveryKey(` ${key.toLowerCase().replace(/-/g, ' ')} `)).toEqual(bytes)
    expect(parseRecoveryKey(key.replace(/0/g, 'O').replace(/1/g, 'l'))).toEqual(bytes)
    expect(parseRecoveryKey('not a key')).toBeNull()
  })

  it('opens the backup with the right key for the right person only', async () => {
    const pair = await newKeyPair()
    const ring = [{ id: 'k1', privateKey: pair.privateKey, publicKey: await exportPublicKey(pair.publicKey) }]
    const recovery = newRecoveryKey()
    const backup = await lockWithRecoveryKey(await packKeyring(ring), recovery, ALICE)
    const back = await unpackKeyring(await openWithRecoveryKey(backup, recovery, ALICE))
    expect(back.map((k) => [k.id, k.publicKey])).toEqual([['k1', ring[0].publicKey]])
    await expect(openWithRecoveryKey(backup, newRecoveryKey(), ALICE)).rejects.toThrow()
    await expect(openWithRecoveryKey(backup, recovery, BOB)).rejects.toThrow()
  })
})

describe('Unlocking a new device', () => {
  it('shows the same code on both screens and hands over the keys', async () => {
    const request = await newDeviceOffer()
    const approver = await newDeviceOffer()
    const x = {
      requestKey: request.publicKey,
      requestNonce: request.nonce,
      approverKey: approver.publicKey,
      approverNonce: approver.nonce,
    }
    expect(await deviceCode(x)).toMatch(/^\d{6}$/)
    expect(await deviceCode({ ...x })).toBe(await deviceCode(x))

    const pair = await newKeyPair()
    const packed = await packKeyring([{ id: 'k1', privateKey: pair.privateKey, publicKey: await publicKeyOf(pair.privateKey) }])
    const sealed = await sealForDevice(packed, approver.privateKey, x)
    expect(await openFromDevice(sealed, request.privateKey, x)).toEqual(packed)
  })

  it('gives a different code when someone swaps a key in the middle', async () => {
    const [request, approver, mallory] = await Promise.all([newDeviceOffer(), newDeviceOffer(), newDeviceOffer()])
    const real = { requestKey: request.publicKey, requestNonce: request.nonce, approverKey: approver.publicKey, approverNonce: approver.nonce }
    const swapped = { ...real, requestKey: mallory.publicKey }
    expect(await deviceCode(swapped)).not.toBe(await deviceCode(real))
  })
})

describe('Security codes', () => {
  it('match on both sides and change when a key changes', async () => {
    const [alice, bob, bobAgain] = await Promise.all([person(), person(), person()])
    const a = { userId: ALICE, publicKey: alice.publicKey }
    const b = { userId: BOB, publicKey: bob.publicKey }
    const code = await securityCode(a, b)
    expect(code).toHaveLength(12)
    expect(code.every((g) => /^\d{5}$/.test(g))).toBe(true)
    expect(await securityCode(b, a)).toEqual(code)
    expect(await securityCode(a, { userId: BOB, publicKey: bobAgain.publicKey })).not.toEqual(code)
  })
})

// The database checks the shape of everything the app sends. Keep the two in step.
describe('What the database accepts', () => {
  const sql = readFileSync('supabase/migrations/0017_dm_encryption.sql', 'utf8')
  const pattern = (column: string) => {
    const m = sql.match(new RegExp(`${column} text[^\\n]*?~ '([^']+)'`))
    if (!m) throw new Error(`No pattern for ${column}`)
    return new RegExp(m[1])
  }

  it('matches the keys, nonces and commitments the app makes', async () => {
    const offer = await newDeviceOffer()
    const pair = await newKeyPair()
    expect(await exportPublicKey(pair.publicKey)).toMatch(pattern('public_key'))
    expect(offer.publicKey).toMatch(pattern('request_key'))
    expect(offer.nonce).toMatch(pattern('approver_nonce'))
    expect(await commitmentOf(offer.nonce)).toMatch(pattern('commitment'))
  })

  it('matches the sealed messages the app sends', async () => {
    const [alice, bob] = await Promise.all([person(), person()])
    const env = await sealMessage(await conversationKey(alice.pair.privateKey, bob.pair.publicKey), ctx(), 'x'.repeat(4000))
    expect(Object.keys(env).sort()).toEqual(['ct', 'iv', 'rk', 'sk', 'v'])
    expect(env.iv).toMatch(/^[A-Za-z0-9+/]{16}$/)
    expect(env.ct).toMatch(/^[A-Za-z0-9+/]{24,}={0,2}$/)
    expect(new TextEncoder().encode(JSON.stringify(env)).length).toBeLessThan(24000)
  })
})
