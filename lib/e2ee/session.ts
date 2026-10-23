import type { SupabaseClient } from '@supabase/supabase-js'
import type { Message } from '@/lib/types'
import { packPreview, unpackPreview } from '@/lib/long-text'
import {
  commitmentOf,
  contextOf,
  conversationKey,
  deviceCode,
  e2eeSupported,
  exportPublicKey,
  importPublicKey,
  isEnvelope,
  lockWithPhrase,
  lockWithRecoveryKey,
  messageKey,
  newDeviceOffer,
  newKeyPair,
  newRecoveryKey,
  openFile,
  openFileMeta,
  openFromDevice,
  openLongText,
  openMessage,
  openWithPhrase,
  openWithRecoveryKey,
  packKeyring,
  parseRecoveryKey,
  phraseProblem,
  sealFile,
  sealForDevice,
  sealLongText,
  sealMessage,
  toBase64,
  unpackKeyring,
  type DeviceExchange,
  type DeviceOffer,
  type Envelope,
  type FileMeta,
  type KeyringEntry,
} from './crypto'
import { loadPeer, loadVault, removeVault, savePeer, saveVault, type Vault } from './vault'

// One per signed-in person. Holds this device's keys and does all the sealing
// and opening, outside React, so data fetchers can use it too.
//
//   loading      checking this device and the server
//   ready        this device has your current key
//   locked       you have a key, but not on this device yet: unlock it from
//                another device, your unlock phrase or your recovery key
//   unsupported  this browser can't do the cryptography
//   error        couldn't reach the server to check

export type E2eeStatus = 'loading' | 'ready' | 'locked' | 'unsupported' | 'error'

export class E2eeError extends Error {}

export type PublicKeyInfo = { id: string; userId: string; publicKey: string; key: CryptoKey }
export type PeerState = { key: PublicKeyInfo | null; changed: boolean; verified: boolean }

export type RequestRow = {
  id: string
  label: string
  request_key: string
  commitment: string
  approver_key: string | null
  approver_nonce: string | null
  reveal_nonce: string | null
  sealed_iv: string | null
  sealed_keyring: string | null
  status: 'waiting' | 'comparing' | 'revealed' | 'approved' | 'declined'
  created_at: string
}

export type OutgoingRequest = { id: string; offer: DeviceOffer }
export type Claim = { id: string; offer: DeviceOffer; requestKey: string; commitment: string }
export type RequestProgress =
  | { state: 'waiting' }
  | { state: 'compare'; code: string }
  | { state: 'done' }
  | { state: 'declined' }
  | { state: 'expired' }

export const REQUEST_TTL_MS = 10 * 60_000
const REQUEST_COLUMNS =
  'id, label, request_key, commitment, approver_key, approver_nonce, reveal_nonce, sealed_iv, sealed_keyring, status, created_at'

const expired = (row: { created_at: string }) => Date.now() - new Date(row.created_at).getTime() > REQUEST_TTL_MS

export class E2eeSession {
  status: E2eeStatus = 'loading'
  /** Bumps whenever this device's keys change, so anything decrypted can be redone. */
  version = 0
  private vault: Vault = { keys: [], activeId: null }
  private listeners = new Set<() => void>()
  private keysById = new Map<string, Promise<PublicKeyInfo | null>>()
  private peers = new Map<string, Promise<PublicKeyInfo | null>>()
  private conversations = new Map<string, Promise<CryptoKey>>()
  /** A recovery key was made in this visit (first setup or a reset), so it should be shown now. */
  private madeRecovery = false
  private snap = {
    status: this.status,
    version: 0,
    recovery: null as string | null,
    madeRecovery: false,
    activeKey: null as string | null,
    activeKeyId: null as string | null,
  }

  constructor(
    private readonly db: SupabaseClient,
    readonly userId: string,
  ) {}

  // --- state ---------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snap

  private emit() {
    const active = this.vault.keys.find((k) => k.id === this.vault.activeId)
    this.snap = {
      status: this.status,
      version: this.version,
      recovery: this.vault.recovery ?? null,
      madeRecovery: this.madeRecovery && !!this.vault.recovery,
      activeKey: active?.publicKey ?? null,
      activeKeyId: active?.id ?? null,
    }
    for (const fn of this.listeners) fn()
  }

  private async save(vault: Vault) {
    await saveVault(this.userId, vault)
    this.vault = vault
  }

  private keysChanged() {
    this.conversations.clear()
    this.version++
  }

  async start() {
    if (!e2eeSupported()) {
      this.status = 'unsupported'
      this.emit()
      return
    }
    this.status = 'loading'
    this.emit()
    try {
      this.vault = (await loadVault(this.userId)) ?? { keys: [], activeId: null }
      const server = await this.serverKey()
      if (!server) {
        await this.publish(false)
      } else if (this.vault.keys.some((k) => k.id === server.id && k.publicKey === server.public_key)) {
        if (this.vault.activeId !== server.id) await this.save({ ...this.vault, activeId: server.id })
        this.status = 'ready'
      } else {
        this.status = 'locked'
      }
    } catch (err) {
      console.error('[cabal] e2ee start', err)
      this.status = 'error'
    }
    this.emit()
  }

  private async serverKey() {
    const { data, error } = await this.db
      .from('e2ee_keys')
      .select('id, public_key')
      .eq('user_id', this.userId)
      .is('retired_at', null)
      .maybeSingle()
    if (error) throw error
    return data as { id: string; public_key: string } | null
  }

  /** Makes a new key pair and recovery key, backs them up, and publishes the public key. */
  private async publish(replace: boolean): Promise<string> {
    const pair = await newKeyPair()
    const entry: KeyringEntry = { id: crypto.randomUUID(), privateKey: pair.privateKey, publicKey: await exportPublicKey(pair.publicKey) }
    const recovery = newRecoveryKey()
    const keys = [...this.vault.keys, entry]
    const backup = await lockWithRecoveryKey(await packKeyring(keys), recovery, this.userId)
    // Saved before publishing, so a closed tab can't leave the server with a key this device lost.
    await this.save({ keys, activeId: this.vault.activeId, recovery: this.vault.recovery })
    const { error } = await this.db.rpc('e2ee_publish_key', {
      p_id: entry.id,
      p_public_key: entry.publicKey,
      p_backup_iv: backup.iv,
      p_backup: backup.keyring,
      p_replace: replace,
    })
    if (error) {
      if (error.code === 'P0409') {
        this.status = 'locked'
        return ''
      }
      throw error
    }
    await this.save({ keys, activeId: entry.id, recovery })
    this.keysChanged()
    this.madeRecovery = true
    this.status = 'ready'
    return recovery
  }

  // --- recovery keys ----------------------------------------------------------------

  async unlockWithRecoveryKey(input: string) {
    if (!parseRecoveryKey(input)) throw new E2eeError('That isn’t a recovery key. It’s 24 letters and numbers.')
    const { data, error } = await this.db.from('e2ee_backups').select('iv, keyring').eq('user_id', this.userId).maybeSingle()
    if (error) throw error
    if (!data) throw new E2eeError('There’s no backup to unlock yet.')
    let keys: KeyringEntry[]
    try {
      keys = await unpackKeyring(await openWithRecoveryKey(data, input, this.userId))
    } catch {
      throw new E2eeError('That recovery key doesn’t match. Check it and try again.')
    }
    await this.adopt(keys)
  }

  /** Takes keys from a backup or another device, after checking they match your account. */
  private async adopt(keys: KeyringEntry[]) {
    const server = await this.serverKey()
    const active = keys.find((k) => k.id === server?.id)
    if (!server || !active || active.publicKey !== server.public_key) {
      throw new E2eeError('Those keys are out of date. If you reset on another device, unlock from that one.')
    }
    const merged = [...this.vault.keys.filter((k) => !keys.some((n) => n.id === k.id)), ...keys]
    await this.save({ keys: merged, activeId: server.id })
    this.keysChanged()
    this.status = 'ready'
    this.emit()
  }

  async replaceRecoveryKey(): Promise<string> {
    if (this.status !== 'ready' || !this.vault.activeId) throw new E2eeError('Unlock this device first.')
    const recovery = newRecoveryKey()
    const backup = await lockWithRecoveryKey(await packKeyring(this.vault.keys), recovery, this.userId)
    const { error } = await this.db.rpc('e2ee_save_backup', {
      p_key: this.vault.activeId,
      p_iv: backup.iv,
      p_backup: backup.keyring,
    })
    if (error) throw error
    await this.save({ ...this.vault, recovery })
    this.emit()
    return recovery
  }

  async confirmRecoverySaved() {
    const { recovery: _, ...rest } = this.vault
    await this.save(rest)
    this.emit()
  }

  // --- unlock phrases -----------------------------------------------------------------

  /** Whether you've set an unlock phrase. A reset drops it, since it would hold old keys. */
  async hasPhrase(): Promise<boolean> {
    const { data, error } = await this.db.from('e2ee_phrase_backups').select('key_id').eq('user_id', this.userId).maybeSingle()
    if (error) throw error
    return !!data
  }

  async unlockWithPhrase(input: string) {
    const { data, error } = await this.db
      .from('e2ee_phrase_backups')
      .select('salt, iterations, iv, keyring')
      .eq('user_id', this.userId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new E2eeError('There’s no unlock phrase yet. Approve from another device or use your recovery key.')
    let keys: KeyringEntry[]
    try {
      keys = await unpackKeyring(await openWithPhrase(data, input, this.userId))
    } catch {
      throw new E2eeError('That phrase doesn’t match. Check it and try again.')
    }
    await this.adopt(keys)
  }

  async setPhrase(phrase: string) {
    if (this.status !== 'ready' || !this.vault.activeId) throw new E2eeError('Unlock this device first.')
    const problem = phraseProblem(phrase)
    if (problem) throw new E2eeError(problem)
    const backup = await lockWithPhrase(await packKeyring(this.vault.keys), phrase, this.userId)
    const { error } = await this.db.rpc('e2ee_save_phrase', {
      p_key: this.vault.activeId,
      p_salt: backup.salt,
      p_iterations: backup.iterations,
      p_iv: backup.iv,
      p_backup: backup.keyring,
    })
    if (error) throw error
  }

  async removePhrase() {
    const { error } = await this.db.rpc('e2ee_remove_phrase')
    if (error) throw error
  }

  /** Starting over: a new key pair. Anything only the old keys could open stays locked. */
  async reset(): Promise<string> {
    const recovery = await this.publish(true)
    this.emit()
    return recovery
  }

  async forgetThisDevice() {
    await removeVault(this.userId)
    this.vault = { keys: [], activeId: null }
    this.keysChanged()
    this.status = 'locked'
    this.emit()
  }

  // --- public keys ------------------------------------------------------------------

  private keyById(id: string): Promise<PublicKeyInfo | null> {
    let p = this.keysById.get(id)
    if (!p) {
      p = (async () => {
        const { data, error } = await this.db.from('e2ee_keys').select('id, user_id, public_key').eq('id', id).maybeSingle()
        if (error) throw error
        if (!data) return null
        return { id: data.id, userId: data.user_id, publicKey: data.public_key, key: await importPublicKey(data.public_key) }
      })()
      p.catch(() => this.keysById.delete(id))
      this.keysById.set(id, p)
    }
    return p
  }

  /** Their current key, or null if they haven't opened Cabal since encryption arrived. */
  peerKey(peerId: string, fresh = false): Promise<PublicKeyInfo | null> {
    let p = fresh ? undefined : this.peers.get(peerId)
    if (!p) {
      p = (async () => {
        const { data, error } = await this.db
          .from('e2ee_keys')
          .select('id')
          .eq('user_id', peerId)
          .is('retired_at', null)
          .maybeSingle()
        if (error) throw error
        return data ? this.keyById(data.id) : null
      })()
      p.catch(() => this.peers.delete(peerId))
      this.peers.set(peerId, p)
    }
    return p
  }

  async peerState(peerId: string): Promise<PeerState> {
    const key = await this.peerKey(peerId, true)
    if (!key) return { key: null, changed: false, verified: false }
    const seen = await loadPeer(this.userId, peerId)
    if (!seen) {
      await savePeer(this.userId, peerId, { seen: key.id })
      return { key, changed: false, verified: false }
    }
    return { key, changed: seen.seen !== key.id, verified: seen.verified === key.id }
  }

  acknowledgePeer(peerId: string, keyId: string) {
    return savePeer(this.userId, peerId, { seen: keyId })
  }

  markVerified(peerId: string, keyId: string) {
    return savePeer(this.userId, peerId, { seen: keyId, verified: keyId })
  }

  // --- messages ---------------------------------------------------------------------

  private conversation(mine: KeyringEntry, theirs: PublicKeyInfo) {
    const id = `${mine.id}:${theirs.id}`
    let p = this.conversations.get(id)
    if (!p) {
      p = conversationKey(mine.privateKey, theirs.key)
      this.conversations.set(id, p)
    }
    return p
  }

  private async sendingKeys(channelId: string, messageId: string, peerId: string) {
    const me = this.vault.keys.find((k) => k.id === this.vault.activeId)
    if (this.status !== 'ready' || !me) throw new E2eeError('Unlock direct messages on this device to send this.')
    const peer = await this.peerKey(peerId)
    if (!peer) throw new E2eeError('They need to open Cabal once before you can message them.')
    const ctx = { channelId, messageId, authorId: this.userId, sk: me.id, rk: peer.id }
    return { ctx, conversation: await this.conversation(me, peer) }
  }

  async seal(channelId: string, messageId: string, peerId: string, text: string): Promise<Envelope> {
    const { ctx, conversation } = await this.sendingKeys(channelId, messageId, peerId)
    return sealMessage(conversation, ctx, text)
  }

  /** A long message: its preview (with the length inside) and its full text, both under this message's key. */
  async sealLong(channelId: string, messageId: string, peerId: string, text: string) {
    const { ctx, conversation } = await this.sendingKeys(channelId, messageId, peerId)
    const [preview, full] = await Promise.all([
      sealMessage(conversation, ctx, packPreview(text)),
      sealLongText(conversation, ctx, text),
    ])
    return { preview, full }
  }

  /** A message with photos or videos: its text, and each file encrypted for upload with its sealed description. */
  async sealWithFiles(
    channelId: string,
    messageId: string,
    peerId: string,
    text: string,
    files: { id: string; bytes: Uint8Array; meta: Omit<FileMeta, 'iv'> }[],
  ) {
    const { ctx, conversation } = await this.sendingKeys(channelId, messageId, peerId)
    const [message, ...sealed] = await Promise.all([
      sealMessage(conversation, ctx, text),
      ...files.map((f) => sealFile(conversation, ctx, f.id, f.bytes, f.meta)),
    ])
    return { message: message as Envelope, files: sealed as { sealed: Envelope; cipher: Uint8Array }[] }
  }

  /** The description of one sealed file. Throws if it can't be opened here. */
  async openFileMeta(m: Message, fileId: string, sealed: unknown): Promise<FileMeta> {
    const env = m.sealed
    if (!env || !isEnvelope(env) || !isEnvelope(sealed)) throw new E2eeError('This file can’t be opened on this device.')
    const keys = await this.keysFor(m, env)
    if (!keys) throw new E2eeError('This file can’t be opened on this device.')
    return openFileMeta(await this.conversation(keys.own, keys.theirs), contextOf(m, env), fileId, sealed)
  }

  /** The bytes of one sealed file. Throws if it can't be opened here or was changed. */
  async openFile(m: Message, fileId: string, meta: FileMeta, cipher: Uint8Array): Promise<Uint8Array> {
    const env = m.sealed
    if (!env || !isEnvelope(env)) throw new E2eeError('This file can’t be opened on this device.')
    const keys = await this.keysFor(m, env)
    if (!keys) throw new E2eeError('This file can’t be opened on this device.')
    return openFile(await this.conversation(keys.own, keys.theirs), contextOf(m, env), fileId, meta, cipher)
  }

  /** Opens the full text of a sealed long message. Throws if it can't be opened here. */
  async openLong(m: Message, full: unknown): Promise<string> {
    const env = m.sealed
    if (!env || !isEnvelope(env) || !isEnvelope(full)) throw new E2eeError('This message can’t be opened on this device.')
    const keys = await this.keysFor(m, env)
    if (!keys) throw new E2eeError('This message can’t be opened on this device.')
    return openLongText(await this.conversation(keys.own, keys.theirs), contextOf(m, env), full)
  }

  forgetPeer(peerId: string) {
    this.peers.delete(peerId)
  }

  // Your key and theirs, for a sealed message: checks the other key belongs
  // to who it should (the author, or for your own messages, not you).
  private async keysFor(m: Message, env: Envelope) {
    const mine = m.author_id === this.userId
    const own = this.vault.keys.find((k) => k.id === (mine ? env.sk : env.rk))
    if (!own) return null
    const theirs = await this.keyById(mine ? env.rk : env.sk)
    if (!theirs || (mine ? theirs.userId === this.userId : theirs.userId !== m.author_id)) return null
    return { own, theirs }
  }

  async open(m: Message): Promise<Message> {
    if (!m.sealed || m.deleted_at) return m
    const env = m.sealed
    if (!isEnvelope(env)) return { ...m, body: '', e2ee: 'unreadable' }
    try {
      const keys = await this.keysFor(m, env)
      if (!keys) return { ...m, body: '', e2ee: this.status === 'ready' ? 'unreadable' : 'locked' }
      const body = await openMessage(await this.conversation(keys.own, keys.theirs), contextOf(m, env), env)
      if (m.long_text) {
        const p = unpackPreview(body)
        return p ? { ...m, body: p.preview, long_chars: p.chars, e2ee: 'ok' } : { ...m, body: '', e2ee: 'unreadable' }
      }
      return { ...m, body, e2ee: 'ok' }
    } catch {
      return { ...m, body: '', e2ee: 'unreadable' }
    }
  }

  openAll(ms: Message[]): Promise<Message[]> {
    return Promise.all(ms.map((m) => this.open(m)))
  }

  /** The key for just this one message, for a report. */
  async reportKey(m: Message): Promise<string> {
    const env = m.sealed
    const keys = env && isEnvelope(env) ? await this.keysFor(m, env) : null
    if (!env || !keys) throw new E2eeError('This message can’t be opened on this device.')
    return toBase64(await messageKey(await this.conversation(keys.own, keys.theirs), contextOf(m, env)))
  }

  // --- unlocking a new device: the new device's side --------------------------------

  async requestUnlock(label: string): Promise<OutgoingRequest> {
    const offer = await newDeviceOffer()
    const { data, error } = await this.db.rpc('e2ee_request_device', {
      p_label: label,
      p_key: offer.publicKey,
      p_commitment: await commitmentOf(offer.nonce),
    })
    if (error) throw error
    return { id: data as string, offer }
  }

  async checkUnlock(req: OutgoingRequest): Promise<RequestProgress> {
    const row = await this.request(req.id)
    if (!row) return { state: 'expired' }
    if (row.status === 'declined') {
      await this.db.from('e2ee_device_requests').delete().eq('id', req.id)
      return { state: 'declined' }
    }
    if (row.status === 'waiting') return expired(row) ? { state: 'expired' } : { state: 'waiting' }
    const x: DeviceExchange = {
      requestKey: req.offer.publicKey,
      requestNonce: req.offer.nonce,
      approverKey: row.approver_key!,
      approverNonce: row.approver_nonce!,
    }
    if (row.status === 'comparing') {
      // A second check racing the first sees this fail; the next one finds it revealed.
      const { error } = await this.db.rpc('e2ee_reveal_device', { p_request: req.id, p_nonce: req.offer.nonce })
      if (error) return expired(row) ? { state: 'expired' } : { state: 'waiting' }
    }
    if (row.status === 'approved' && row.sealed_iv && row.sealed_keyring) {
      const packed = await openFromDevice({ iv: row.sealed_iv, keyring: row.sealed_keyring }, req.offer.privateKey, x)
      await this.adopt(await unpackKeyring(packed))
      await this.db.from('e2ee_device_requests').delete().eq('id', req.id)
      return { state: 'done' }
    }
    if (expired(row)) return { state: 'expired' }
    return { state: 'compare', code: await deviceCode(x) }
  }

  cancelUnlock(req: OutgoingRequest) {
    return this.db.from('e2ee_device_requests').delete().eq('id', req.id)
  }

  // --- unlocking a new device: the side that already has your keys ------------------

  private async request(id: string) {
    const { data, error } = await this.db.from('e2ee_device_requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return data as RequestRow | null
  }

  async waitingRequests(): Promise<RequestRow[]> {
    if (this.status !== 'ready') return []
    const { data, error } = await this.db
      .from('e2ee_device_requests')
      .select(REQUEST_COLUMNS)
      .eq('user_id', this.userId)
      .eq('status', 'waiting')
      .gt('created_at', new Date(Date.now() - REQUEST_TTL_MS).toISOString())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data as RequestRow[]
  }

  async claim(row: RequestRow): Promise<Claim> {
    const offer = await newDeviceOffer()
    const { error } = await this.db.rpc('e2ee_claim_device', { p_request: row.id, p_key: offer.publicKey, p_nonce: offer.nonce })
    if (error) throw error
    return { id: row.id, offer, requestKey: row.request_key, commitment: row.commitment }
  }

  private exchange(claim: Claim, row: RequestRow): DeviceExchange {
    return {
      requestKey: claim.requestKey,
      requestNonce: row.reveal_nonce!,
      approverKey: claim.offer.publicKey,
      approverNonce: claim.offer.nonce,
    }
  }

  async checkClaim(claim: Claim): Promise<RequestProgress> {
    const row = await this.request(claim.id)
    if (!row || expired(row)) return { state: 'expired' }
    if (row.status === 'declined') return { state: 'declined' }
    if (row.status !== 'revealed' || !row.reveal_nonce) return { state: 'waiting' }
    // The server checks this too; a device only trusts its own check.
    if ((await commitmentOf(row.reveal_nonce)) !== claim.commitment) return { state: 'expired' }
    return { state: 'compare', code: await deviceCode(this.exchange(claim, row)) }
  }

  async approve(claim: Claim) {
    const row = await this.request(claim.id)
    if (!row || row.status !== 'revealed' || !row.reveal_nonce) throw new E2eeError('That request expired. Start again on the new device.')
    if ((await commitmentOf(row.reveal_nonce)) !== claim.commitment) throw new E2eeError('That request isn’t safe to approve.')
    const sealed = await sealForDevice(await packKeyring(this.vault.keys), claim.offer.privateKey, this.exchange(claim, row))
    const { error } = await this.db.rpc('e2ee_approve_device', { p_request: claim.id, p_iv: sealed.iv, p_keyring: sealed.keyring })
    if (error) throw error
  }

  async decline(id: string) {
    const { error } = await this.db.rpc('e2ee_decline_device', { p_request: id })
    if (error) throw error
  }
}
