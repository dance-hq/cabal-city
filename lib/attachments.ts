import { createClient } from '@/lib/supabase/client'
import type { E2eeSession } from '@/lib/e2ee/session'
import type { FileMeta } from '@/lib/e2ee/crypto'
import type { FileKind, LocalFile, Message, MessageFileRow } from '@/lib/types'

// Photos and videos in conversations. Limits are mirrored in
// supabase/migrations/0021_message_files.sql (a test holds them equal).

export const BUCKET = 'attachments'
export const MAX_FILES = 6
/** A stored photo, after it's been redrawn on this device. */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
/** A photo you pick can be bigger: it's shrunk before sending. */
export const PICKED_IMAGE_MAX_BYTES = 60 * 1024 * 1024
export const IMAGE_MAX_EDGE = 2560

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const
export const ACCEPT = ['image/*', ...VIDEO_TYPES].join(',')

export class AttachmentError extends Error {}

export function kindOf(mime: string): FileKind | null {
  if (mime.startsWith('image/')) return 'image'
  if ((VIDEO_TYPES as readonly string[]).includes(mime)) return 'video'
  return null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

/** "Shared a photo" style line for previews and notifications, when a message has no text. */
export function filesLabel(n: number): string {
  return n === 1 ? 'Shared a photo or video' : `Shared ${n} photos or videos`
}

export function cleanName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim() ?? ''
  return (base || fallback).slice(0, 200)
}

function withExtension(name: string, mime: string): string {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime]
  if (!ext) return name
  const stem = name.replace(/\.[^.]+$/, '') || 'photo'
  return `${stem.slice(0, 190)}.${ext}`
}

/** The size a picture is drawn at in a conversation, so it never moves the lines around it as it loads. */
export function displayBox(width: number | null, height: number | null, maxW = 360, maxH = 320) {
  if (!width || !height) return { width: maxW, height: Math.round((maxW * 9) / 16) }
  const scale = Math.min(1, maxW / width, maxH / height)
  return { width: Math.max(48, Math.round(width * scale)), height: Math.max(48, Math.round(height * scale)) }
}

/** Columns for a message's grid of several files. */
export function gridColumns(n: number): number {
  return n === 2 || n === 4 ? 2 : 3
}

// --- Picking ---------------------------------------------------------------------

function videoSize(url: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const done = (w: number | null, h: number | null) => {
      clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
      resolve({ width: w, height: h })
    }
    const timer = setTimeout(() => done(null, null), 4000)
    v.preload = 'metadata'
    v.muted = true
    v.onloadedmetadata = () => done(v.videoWidth || null, v.videoHeight || null)
    v.onerror = () => done(null, null)
    v.src = url
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Photos are redrawn, which leaves behind where and with what they were taken
// (EXIF/GPS) and shrinks huge ones. GIFs are kept as they are so they still move.
async function redraw(file: File): Promise<{ blob: Blob; mime: string; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new AttachmentError(`Couldn’t read ${file.name || 'that photo'}. Try a JPG or PNG.`)
  }
  try {
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AttachmentError('This browser can’t prepare photos.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    // Keep transparency where the source could have it; everything else becomes a JPG.
    const tries: [string, number | undefined][] =
      file.type === 'image/png' || file.type === 'image/webp'
        ? [[file.type, 0.9], ['image/png', undefined], ['image/jpeg', 0.86]]
        : [['image/jpeg', 0.86], ['image/jpeg', 0.72]]
    for (const [type, quality] of tries) {
      const blob = await toBlob(canvas, type, quality)
      if (blob && blob.type === type && blob.size <= IMAGE_MAX_BYTES) return { blob, mime: type, width, height }
    }
    throw new AttachmentError(`${file.name || 'That photo'} is too big to send.`)
  } finally {
    bitmap.close()
  }
}

export async function prepareFile(file: File): Promise<LocalFile> {
  const key = crypto.randomUUID()
  const type = file.type
  if ((VIDEO_TYPES as readonly string[]).includes(type)) {
    if (file.size > VIDEO_MAX_BYTES) throw new AttachmentError(`${file.name || 'That video'} is over ${formatBytes(VIDEO_MAX_BYTES)}.`)
    const url = URL.createObjectURL(file)
    const { width, height } = await videoSize(url)
    return { key, blob: file, url, kind: 'video', mime: type, name: cleanName(file.name, 'video'), width, height }
  }
  if (type.startsWith('video/')) throw new AttachmentError('Cabal can share MP4, WebM and MOV videos.')
  if (!type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new AttachmentError('You can attach photos and videos.')
  }
  if (type === 'image/gif') {
    if (file.size > IMAGE_MAX_BYTES) throw new AttachmentError(`${file.name || 'That GIF'} is over ${formatBytes(IMAGE_MAX_BYTES)}.`)
    let width: number | null = null
    let height: number | null = null
    try {
      const bitmap = await createImageBitmap(file)
      width = bitmap.width
      height = bitmap.height
      bitmap.close()
    } catch {
      throw new AttachmentError(`Couldn’t read ${file.name || 'that GIF'}.`)
    }
    return { key, blob: file, url: URL.createObjectURL(file), kind: 'image', mime: type, name: cleanName(file.name, 'image.gif'), width, height }
  }
  if (file.size > PICKED_IMAGE_MAX_BYTES) throw new AttachmentError(`${file.name || 'That photo'} is too big to send.`)
  const { blob, mime, width, height } = await redraw(file)
  return {
    key,
    blob,
    url: URL.createObjectURL(blob),
    kind: 'image',
    mime,
    name: withExtension(cleanName(file.name, 'photo'), mime),
    width,
    height,
  }
}

export function releaseLocal(files: LocalFile[] | undefined) {
  for (const f of files ?? []) URL.revokeObjectURL(f.url)
}

// --- Sending ---------------------------------------------------------------------

export function attachmentPath(channelId: string, messageId: string, fileId: string) {
  return `${channelId}/${messageId}/${fileId}`
}

export async function upload(path: string, body: Blob, contentType: string) {
  const { error } = await createClient().storage.from(BUCKET).upload(path, body, { contentType, upsert: false, cacheControl: '31536000' })
  if (error) throw new AttachmentError('A file didn’t upload. Check your connection and try again.')
}

/** Best effort: a file nobody's message claims can't be read anyway. */
export function removeUploads(paths: string[]) {
  if (paths.length) void createClient().storage.from(BUCKET).remove(paths).catch(() => {})
}

// --- Showing ---------------------------------------------------------------------

export const FILE_COLUMNS = 'id, message_id, channel_id, position, path, bytes, kind, mime, name, width, height, sealed'

// Many messages ask for their files at once when a conversation opens; one
// request answers all of them.
function batcher<T>(run: (keys: string[]) => Promise<Map<string, T>>) {
  let queue = new Map<string, { resolve: (v: T | undefined) => void; reject: (e: unknown) => void }[]>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = async () => {
    timer = null
    const batch = queue
    queue = new Map()
    const keys = [...batch.keys()]
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100)
      try {
        const found = await run(chunk)
        for (const k of chunk) for (const w of batch.get(k) ?? []) w.resolve(found.get(k))
      } catch (err) {
        for (const k of chunk) for (const w of batch.get(k) ?? []) w.reject(err)
      }
    }
  }
  return (key: string) =>
    new Promise<T | undefined>((resolve, reject) => {
      const waiting = queue.get(key) ?? []
      waiting.push({ resolve, reject })
      queue.set(key, waiting)
      if (!timer) timer = setTimeout(flush, 15)
    })
}

const rowsFor = batcher<MessageFileRow[]>(async (ids) => {
  const { data, error } = await createClient().from('message_files').select(FILE_COLUMNS).in('message_id', ids).order('position')
  if (error) throw error
  const out = new Map<string, MessageFileRow[]>()
  for (const row of (data ?? []) as MessageFileRow[]) out.set(row.message_id, [...(out.get(row.message_id) ?? []), row])
  return out
})

const SIGNED_FOR = 6 * 3600
const signed = new Map<string, { url: string; until: number }>()
const signedUrl = batcher<string>(async (paths) => {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrls(paths, SIGNED_FOR)
  if (error) throw error
  const out = new Map<string, string>()
  const until = Date.now() + (SIGNED_FOR - 600) * 1000
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) {
      out.set(d.path, d.signedUrl)
      signed.set(d.path, { url: d.signedUrl, until })
    }
  }
  return out
})

/** A file ready to show: a link for rooms and teams; for direct messages, a way to fetch and open it on this device. */
export type ShownFile = {
  id: string
  path: string
  kind: FileKind
  mime: string
  name: string
  width: number | null
  height: number | null
  bytes: number
  src?: string
  meta?: FileMeta
}

export async function loadShownFiles(m: Message, e2ee: E2eeSession): Promise<ShownFile[]> {
  const rows = (await rowsFor(m.id)) ?? []
  return Promise.all(
    rows.map(async (row): Promise<ShownFile> => {
      if (row.sealed) {
        const meta = await e2ee.openFileMeta(m, row.id, row.sealed)
        return { id: row.id, path: row.path, kind: meta.kind, mime: meta.mime, name: meta.name, width: meta.width, height: meta.height, bytes: row.bytes, meta }
      }
      const cached = signed.get(row.path)
      const src = cached && cached.until > Date.now() ? cached.url : await signedUrl(row.path)
      return {
        id: row.id,
        path: row.path,
        kind: row.kind ?? 'image',
        mime: row.mime ?? '',
        name: row.name ?? 'file',
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        src,
      }
    }),
  )
}

// Opened files stay in memory for this session, so scrolling back doesn't download them again.
const opened = new Map<string, Promise<string>>()

export function openSealed(m: Message, f: ShownFile, e2ee: E2eeSession): Promise<string> {
  let p = opened.get(f.path)
  if (!p) {
    p = (async () => {
      if (!f.meta) throw new AttachmentError('This file can’t be opened on this device.')
      const { data, error } = await createClient().storage.from(BUCKET).download(f.path)
      if (error || !data) throw new AttachmentError('Couldn’t download this file.')
      const bytes = await e2ee.openFile(m, f.id, f.meta, new Uint8Array(await data.arrayBuffer()))
      return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: f.mime }))
    })()
    p.catch(() => opened.delete(f.path))
    opened.set(f.path, p)
  }
  return p
}

/** Where your own files live, so deleting the message can take them away too. */
export async function pathsOf(messageId: string): Promise<string[]> {
  const rows = (await rowsFor(messageId)) ?? []
  return rows.map((r) => r.path)
}
