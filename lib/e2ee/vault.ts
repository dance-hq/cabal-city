import type { KeyringEntry } from './crypto'

// This device's keys, kept in IndexedDB. They only ever leave the device
// sealed: in your backup (locked with your recovery key) or handed to a
// device you approve. Clearing site data removes them.

export type Vault = {
  keys: KeyringEntry[]
  activeId: string | null
  /** A recovery key made on this device that you haven't confirmed saving yet. */
  recovery?: string
}

export type PeerRecord = { seen: string; verified?: string }

const DB_NAME = 'cabal-e2ee'
const STORE = 'kv'
let opening: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      opening = null
      reject(req.error)
    }
  })
  return opening
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE)
  return new Promise((resolve, reject) => {
    const req = fn(store)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export const loadVault = (userId: string) => run<Vault | undefined>('readonly', (s) => s.get(`vault:${userId}`))
export const saveVault = (userId: string, v: Vault) => run<void>('readwrite', (s) => s.put(v, `vault:${userId}`))
export const removeVault = (userId: string) => run<void>('readwrite', (s) => s.delete(`vault:${userId}`))

export const loadPeer = (userId: string, peerId: string) =>
  run<PeerRecord | undefined>('readonly', (s) => s.get(`peer:${userId}:${peerId}`))
export const savePeer = (userId: string, peerId: string, r: PeerRecord) =>
  run<void>('readwrite', (s) => s.put(r, `peer:${userId}:${peerId}`))
