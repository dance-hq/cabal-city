// End-to-end encryption for direct messages, using only the Web Crypto API
// built into browsers, Electron and Node. No third-party code touches keys.
//
//   Your key pair    P-256 ECDH, made on your device. The private half stays
//                    on your devices; the public half is published.
//   A conversation   ECDH between your private key and their public key gives
//                    both of you the same shared key, and nobody else.
//   Each message     Its own AES-GCM key (HKDF of the shared key and the
//                    message id), so reporting one message reveals only that
//                    one. The text is padded so its length doesn't show, and
//                    bound to its conversation, message id, author and keys.
//
// See supabase/migrations/0017_dm_encryption.sql for what the server checks.

const subtle = () => globalThis.crypto.subtle
const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder('utf-8', { fatal: true })

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

type Bytes = Uint8Array<ArrayBuffer>

const encode = (s: string): Bytes => new Uint8Array(utf8.encode(s))

export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(s: string): Bytes {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function randomBytes(n: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

export function e2eeSupported(): boolean {
  return typeof globalThis.crypto?.subtle?.deriveBits === 'function' && typeof indexedDB !== 'undefined'
}

// --- Key pairs ---------------------------------------------------------------

export async function newKeyPair(): Promise<CryptoKeyPair> {
  return (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64(await subtle().exportKey('raw', key))
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromBase64(b64), ECDH, true, [])
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return toBase64(await subtle().exportKey('pkcs8', key))
}

export async function importPrivateKey(b64: string): Promise<CryptoKey> {
  return subtle().importKey('pkcs8', fromBase64(b64), ECDH, true, ['deriveBits'])
}

export async function publicKeyOf(privateKey: CryptoKey): Promise<string> {
  const { kty, crv, x, y } = await subtle().exportKey('jwk', privateKey)
  const pub = await subtle().importKey('jwk', { kty, crv, x, y, ext: true }, ECDH, true, [])
  return exportPublicKey(pub)
}

async function sharedKey(mine: CryptoKey, theirs: CryptoKey): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: theirs }, mine, 256)
  return subtle().importKey('raw', bits, 'HKDF', false, ['deriveBits'])
}

async function hkdf(base: CryptoKey, salt: string, info: string): Promise<Bytes> {
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(salt), info: utf8.encode(info) },
    base,
    256,
  )
  return new Uint8Array(bits)
}

function aesKey(raw: Bytes, usage: KeyUsage[]) {
  return subtle().importKey('raw', raw, 'AES-GCM', false, usage)
}

async function encrypt(raw: Bytes, plain: Bytes, aad: Bytes) {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await aesKey(raw, ['encrypt']), plain)
  return { iv: toBase64(iv), ct: toBase64(ct) }
}

async function decrypt(raw: Bytes, iv: string, ct: string, aad: Bytes): Promise<Bytes> {
  const key = await aesKey(raw, ['decrypt'])
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: aad }, key, fromBase64(ct)))
}

// --- Messages -----------------------------------------------------------------

export type Envelope = { v: 1; sk: string; rk: string; iv: string; ct: string }

export type MessageContext = {
  channelId: string
  messageId: string
  authorId: string
  /** The sender's key id. */
  sk: string
  /** The recipient's key id. */
  rk: string
}

export const MAX_SEALED_CHARS = 4000

/** The key two people share in one conversation. Each derives it from their own private key and the other's public key. */
export function conversationKey(mine: CryptoKey, theirs: CryptoKey): Promise<CryptoKey> {
  return sharedKey(mine, theirs)
}

export function messageKey(conversation: CryptoKey, ctx: MessageContext): Promise<Bytes> {
  return hkdf(conversation, `cabal-dm-v1:${ctx.channelId}`, `message:${ctx.messageId}`)
}

function messageAad(ctx: MessageContext) {
  return encode(['cabal-dm-v1', ctx.channelId, ctx.messageId, ctx.authorId, ctx.sk, ctx.rk].join('|'))
}

// [4-byte length][text][zeros] in 64-byte steps, so "ok" and "see you at six" look the same.
function pad(text: string, step = 64): Bytes {
  const body = utf8.encode(text)
  const out = new Uint8Array(Math.ceil((body.length + 4) / step) * step)
  new DataView(out.buffer).setUint32(0, body.length)
  out.set(body, 4)
  return out
}

function unpad(bytes: Bytes): string {
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0)
  if (n > bytes.length - 4) throw new Error('Bad padding')
  return fromUtf8.decode(bytes.subarray(4, 4 + n))
}

export async function sealWithMessageKey(raw: Bytes, ctx: MessageContext, text: string): Promise<Envelope> {
  const { iv, ct } = await encrypt(raw, pad(text), messageAad(ctx))
  return { v: 1, sk: ctx.sk, rk: ctx.rk, iv, ct }
}

export async function sealMessage(conversation: CryptoKey, ctx: MessageContext, text: string): Promise<Envelope> {
  return sealWithMessageKey(await messageKey(conversation, ctx), ctx, text)
}

/** Throws if the key is wrong or anything about the message was changed. */
export async function openWithMessageKey(raw: Bytes, ctx: MessageContext, env: Envelope): Promise<string> {
  if (env.v !== 1 || env.sk !== ctx.sk || env.rk !== ctx.rk) throw new Error('Envelope mismatch')
  return unpad(await decrypt(raw, env.iv, env.ct, messageAad(ctx)))
}

export async function openMessage(conversation: CryptoKey, ctx: MessageContext, env: Envelope): Promise<string> {
  return openWithMessageKey(await messageKey(conversation, ctx), ctx, env)
}

// The full text of a long message: same per-message key, its own label, so a
// preview and a full text can't be swapped for each other. Padded in 4 KB steps.
function longTextAad(ctx: MessageContext) {
  return encode(['cabal-dm-long-v1', ctx.channelId, ctx.messageId, ctx.authorId, ctx.sk, ctx.rk].join('|'))
}

export async function sealLongText(conversation: CryptoKey, ctx: MessageContext, text: string): Promise<Envelope> {
  const { iv, ct } = await encrypt(await messageKey(conversation, ctx), pad(text, 4096), longTextAad(ctx))
  return { v: 1, sk: ctx.sk, rk: ctx.rk, iv, ct }
}

/** Throws if the key is wrong or anything about the text was changed. */
export async function openLongText(conversation: CryptoKey, ctx: MessageContext, env: Envelope): Promise<string> {
  if (env.v !== 1 || env.sk !== ctx.sk || env.rk !== ctx.rk) throw new Error('Envelope mismatch')
  return unpad(await decrypt(await messageKey(conversation, ctx), env.iv, env.ct, longTextAad(ctx)))
}

// Photos and videos: each file gets its own key from the conversation (so a
// report, which hands over one message's key, never opens its files). The
// bytes are uploaded encrypted; their description (name, type, size and the
// bytes' iv) is sealed separately. Both are bound to the file's id.

export type FileMeta = { name: string; mime: string; kind: 'image' | 'video'; width: number | null; height: number | null; iv: string }

function fileKey(conversation: CryptoKey, ctx: MessageContext, fileId: string) {
  return hkdf(conversation, `cabal-dm-v1:${ctx.channelId}`, `file:${ctx.messageId}:${fileId}`)
}

function fileAad(label: string, ctx: MessageContext, fileId: string) {
  return encode([label, ctx.channelId, ctx.messageId, fileId, ctx.authorId, ctx.sk, ctx.rk].join('|'))
}

export async function sealFile(
  conversation: CryptoKey,
  ctx: MessageContext,
  fileId: string,
  bytes: Uint8Array,
  meta: Omit<FileMeta, 'iv'>,
): Promise<{ sealed: Envelope; cipher: Bytes }> {
  const raw = await fileKey(conversation, ctx, fileId)
  const iv = randomBytes(12)
  const cipher = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: fileAad('cabal-dm-file-v1', ctx, fileId) },
      await aesKey(raw, ['encrypt']),
      new Uint8Array(bytes),
    ),
  )
  const full: FileMeta = { ...meta, iv: toBase64(iv) }
  const sealedMeta = await encrypt(raw, pad(JSON.stringify(full)), fileAad('cabal-dm-file-meta-v1', ctx, fileId))
  return { sealed: { v: 1, sk: ctx.sk, rk: ctx.rk, ...sealedMeta }, cipher }
}

/** Throws if the key is wrong or anything about the description was changed. */
export async function openFileMeta(conversation: CryptoKey, ctx: MessageContext, fileId: string, env: Envelope): Promise<FileMeta> {
  if (env.v !== 1 || env.sk !== ctx.sk || env.rk !== ctx.rk) throw new Error('Envelope mismatch')
  const raw = await fileKey(conversation, ctx, fileId)
  const meta = JSON.parse(unpad(await decrypt(raw, env.iv, env.ct, fileAad('cabal-dm-file-meta-v1', ctx, fileId)))) as FileMeta
  if (typeof meta.name !== 'string' || typeof meta.mime !== 'string' || typeof meta.iv !== 'string') throw new Error('Bad description')
  if (meta.kind !== 'image' && meta.kind !== 'video') throw new Error('Bad description')
  return meta
}

/** Throws if the key is wrong or the bytes were changed. */
export async function openFile(conversation: CryptoKey, ctx: MessageContext, fileId: string, meta: FileMeta, cipher: Uint8Array): Promise<Bytes> {
  const raw = await fileKey(conversation, ctx, fileId)
  return new Uint8Array(
    await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(meta.iv), additionalData: fileAad('cabal-dm-file-v1', ctx, fileId) },
      await aesKey(raw, ['decrypt']),
      new Uint8Array(cipher),
    ),
  )
}

export function contextOf(m: { id: string; channel_id: string; author_id: string | null }, env: Envelope): MessageContext {
  return { channelId: m.channel_id, messageId: m.id, authorId: m.author_id ?? '', sk: env.sk, rk: env.rk }
}

export function isEnvelope(v: unknown): v is Envelope {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return e.v === 1 && [e.sk, e.rk, e.iv, e.ct].every((x) => typeof x === 'string')
}

// --- Keyrings: every key you've had, packed for a backup or another device ----

export type KeyringEntry = { id: string; privateKey: CryptoKey; publicKey: string }

export async function packKeyring(keys: KeyringEntry[]): Promise<Bytes> {
  const packed = await Promise.all(keys.map(async (k) => ({ id: k.id, key: await exportPrivateKey(k.privateKey) })))
  return encode(JSON.stringify({ v: 1, keys: packed }))
}

export async function unpackKeyring(bytes: Bytes): Promise<KeyringEntry[]> {
  const data = JSON.parse(fromUtf8.decode(bytes)) as { v: number; keys: { id: string; key: string }[] }
  if (data.v !== 1 || !Array.isArray(data.keys)) throw new Error('Unknown keyring')
  return Promise.all(
    data.keys.map(async ({ id, key }) => {
      const privateKey = await importPrivateKey(key)
      return { id, privateKey, publicKey: await publicKeyOf(privateKey) }
    }),
  )
}

// --- Recovery keys --------------------------------------------------------------

// Crockford base32: no I, L, O or U, so it's hard to misread.
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_BYTES = 15 // 120 bits, 24 characters

export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out.match(/.{1,4}/g)!.join('-')
}

export function parseRecoveryKey(input: string): Bytes | null {
  const clean = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (clean.length !== 24) return null
  const out = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let i = 0
  for (const ch of clean) {
    const v = BASE32.indexOf(ch)
    if (v < 0) return null
    value = ((value << 5) | v) & 0xffff
    bits += 5
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return out
}

export function newRecoveryKey(): string {
  return formatRecoveryKey(randomBytes(RECOVERY_BYTES))
}

async function recoveryLock(recoveryKey: string, userId: string): Promise<Bytes> {
  const bytes = parseRecoveryKey(recoveryKey)
  if (!bytes) throw new Error('Not a recovery key')
  const base = await subtle().importKey('raw', bytes, 'HKDF', false, ['deriveBits'])
  return hkdf(base, 'cabal-recovery-v1', userId)
}

const backupAad = (userId: string) => encode(`cabal-backup-v1|${userId}`)

export async function lockWithRecoveryKey(keyring: Bytes, recoveryKey: string, userId: string) {
  const { iv, ct } = await encrypt(await recoveryLock(recoveryKey, userId), keyring, backupAad(userId))
  return { iv, keyring: ct }
}

/** Throws when the recovery key is wrong. */
export async function openWithRecoveryKey(backup: { iv: string; keyring: string }, recoveryKey: string, userId: string) {
  return decrypt(await recoveryLock(recoveryKey, userId), backup.iv, backup.keyring, backupAad(userId))
}

// --- Unlocking another device -----------------------------------------------------

export type DeviceOffer = { privateKey: CryptoKey; publicKey: string; nonce: string }

export async function newDeviceOffer(): Promise<DeviceOffer> {
  const pair = await newKeyPair()
  return { privateKey: pair.privateKey, publicKey: await exportPublicKey(pair.publicKey), nonce: toBase64(randomBytes(16)) }
}

export async function commitmentOf(nonce: string): Promise<string> {
  return toBase64(await subtle().digest('SHA-256', fromBase64(nonce)))
}

export type DeviceExchange = { requestKey: string; requestNonce: string; approverKey: string; approverNonce: string }

/** Six digits both screens show. Matching codes mean nobody swapped a key in between. */
export async function deviceCode(x: DeviceExchange): Promise<string> {
  const data = utf8.encode(['cabal-device-v1', x.requestKey, x.approverKey, x.requestNonce, x.approverNonce].join('|'))
  const hash = new DataView(await subtle().digest('SHA-256', data))
  return String(hash.getUint32(0) % 1_000_000).padStart(6, '0')
}

async function transferKey(mine: CryptoKey, theirs: string, x: DeviceExchange) {
  const shared = await sharedKey(mine, await importPublicKey(theirs))
  return hkdf(shared, 'cabal-device-v1', [x.requestKey, x.approverKey, x.requestNonce, x.approverNonce].join('|'))
}

const deviceAad = encode('cabal-device-v1')

export async function sealForDevice(keyring: Bytes, approverKey: CryptoKey, x: DeviceExchange) {
  const { iv, ct } = await encrypt(await transferKey(approverKey, x.requestKey, x), keyring, deviceAad)
  return { iv, keyring: ct }
}

export async function openFromDevice(sealed: { iv: string; keyring: string }, requestKey: CryptoKey, x: DeviceExchange) {
  return decrypt(await transferKey(requestKey, x.approverKey, x), sealed.iv, sealed.keyring, deviceAad)
}

// --- Security codes ---------------------------------------------------------------

/**
 * Twelve groups of five digits, the same on both phones. If they match when
 * you compare them in person, nobody is reading in the middle.
 */
export async function securityCode(
  a: { userId: string; publicKey: string },
  b: { userId: string; publicKey: string },
): Promise<string[]> {
  const [first, second] = a.userId < b.userId ? [a, b] : [b, a]
  const data = utf8.encode(['cabal-safety-v1', first.userId, first.publicKey, second.userId, second.publicKey].join('|'))
  const hash = new Uint8Array(await subtle().digest('SHA-512', data))
  const groups: string[] = []
  for (let g = 0; g < 12; g++) {
    let n = 0
    for (let i = 0; i < 5; i++) n = n * 256 + hash[g * 5 + i]
    groups.push(String(n % 100_000).padStart(5, '0'))
  }
  return groups
}
