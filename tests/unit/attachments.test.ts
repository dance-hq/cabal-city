import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  attachmentPath,
  cleanName,
  displayBox,
  filesLabel,
  gridColumns,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  MAX_FILES,
  VIDEO_MAX_BYTES,
  VIDEO_TYPES,
} from '@/lib/attachments'
import { conversationKey, newKeyPair, openFile, openFileMeta, sealFile, type MessageContext } from '@/lib/e2ee/crypto'

const SQL = readFileSync('supabase/migrations/0021_message_files.sql', 'utf8')

describe('Attachment limits', () => {
  it('match what the database enforces', () => {
    expect(SQL).toContain(`files between 1 and ${MAX_FILES}`)
    expect(SQL).toContain(`n > ${MAX_FILES}`)
    expect(SQL).toContain(`new.kind = 'image' and new.bytes > ${IMAGE_MAX_BYTES}`)
    expect(SQL).toContain(`new.kind = 'video' and new.bytes > ${VIDEO_MAX_BYTES}`)
    for (const type of [...IMAGE_TYPES, ...VIDEO_TYPES]) expect(SQL).toContain(`'${type}'`)
  })

  it('stores files where the storage policy and trigger expect them', () => {
    const c = crypto.randomUUID()
    const m = crypto.randomUUID()
    const f = crypto.randomUUID()
    expect(attachmentPath(c, m, f)).toBe(`${c}/${m}/${f}`)
    expect(SQL).toContain(`m.channel_id::text || '/' || m.id::text || '/' || new.id::text`)
  })
})

describe('Showing attachments', () => {
  it('reserves the exact space a picture takes, so the conversation never jumps', () => {
    expect(displayBox(4000, 3000)).toEqual({ width: 360, height: 270 })
    expect(displayBox(1080, 1920)).toEqual({ width: 180, height: 320 })
    expect(displayBox(200, 100)).toEqual({ width: 200, height: 100 })
    expect(displayBox(null, null)).toEqual({ width: 360, height: 203 })
  })

  it('lays several out in a tidy grid', () => {
    expect([2, 3, 4, 5, 6].map(gridColumns)).toEqual([2, 3, 2, 3, 3])
  })

  it('cleans file names and describes file-only messages', () => {
    expect(cleanName('C:\\fakepath\\IMG_0001.HEIC', 'photo')).toBe('IMG_0001.HEIC')
    expect(cleanName('  \u0000 ', 'photo')).toBe('photo')
    expect(cleanName('a'.repeat(300), 'photo')).toHaveLength(200)
    expect(filesLabel(1)).toBe('Shared a photo or video')
    expect(filesLabel(3)).toBe('Shared 3 photos or videos')
  })
})

describe('Encrypted attachments', () => {
  async function pair() {
    const alice = await newKeyPair()
    const bob = await newKeyPair()
    return {
      a: await conversationKey(alice.privateKey, bob.publicKey),
      b: await conversationKey(bob.privateKey, alice.publicKey),
    }
  }
  const ctx: MessageContext = {
    channelId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    authorId: crypto.randomUUID(),
    sk: crypto.randomUUID(),
    rk: crypto.randomUUID(),
  }
  const meta = { name: 'whiteboard.jpg', mime: 'image/jpeg', kind: 'image' as const, width: 1600, height: 1200 }
  const bytes = crypto.getRandomValues(new Uint8Array(4096))

  it('round-trips the bytes and description between the two people', async () => {
    const { a, b } = await pair()
    const fileId = crypto.randomUUID()
    const { sealed, cipher } = await sealFile(a, ctx, fileId, bytes, meta)
    expect(cipher).not.toEqual(bytes)
    const opened = await openFileMeta(b, ctx, fileId, sealed)
    expect(opened).toMatchObject(meta)
    expect(await openFile(b, ctx, fileId, opened, cipher)).toEqual(bytes)
  })

  it("fails if it's moved to another file or message, or the bytes are changed", async () => {
    const { a, b } = await pair()
    const fileId = crypto.randomUUID()
    const { sealed, cipher } = await sealFile(a, ctx, fileId, bytes, meta)
    const opened = await openFileMeta(b, ctx, fileId, sealed)
    await expect(openFileMeta(b, ctx, crypto.randomUUID(), sealed)).rejects.toThrow()
    await expect(openFileMeta(b, { ...ctx, messageId: crypto.randomUUID() }, fileId, sealed)).rejects.toThrow()
    await expect(openFile(b, ctx, crypto.randomUUID(), opened, cipher)).rejects.toThrow()
    const tampered = cipher.slice()
    tampered[10] ^= 1
    await expect(openFile(b, ctx, fileId, opened, tampered)).rejects.toThrow()
  })

  it('the description fits what the database accepts', async () => {
    const { a } = await pair()
    const { sealed } = await sealFile(a, ctx, crypto.randomUUID(), bytes, { ...meta, name: 'x'.repeat(200) })
    expect(Object.keys(sealed).sort()).toEqual(['ct', 'iv', 'rk', 'sk', 'v'])
    expect(sealed.iv).toMatch(/^[A-Za-z0-9+/]{16}$/)
    expect(JSON.stringify(sealed).length).toBeLessThanOrEqual(4000)
  })
})
