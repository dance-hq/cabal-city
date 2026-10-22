'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Download, ImageOff, Loader2, Lock, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { displayBox, formatBytes, gridColumns, loadShownFiles, openSealed, type ShownFile } from '@/lib/attachments'
import type { FileKind, Message } from '@/lib/types'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useE2ee } from './e2ee-provider'

// What a tile needs to draw. `src` is ready to show; `load` (encrypted files)
// fetches and opens it on this device first.
type Tile = {
  key: string
  kind: FileKind
  name: string
  width: number | null
  height: number | null
  bytes?: number
  src?: string
  load?: () => Promise<string>
}

export function MessageFiles({ m }: { m: Message }) {
  if (m.deleted_at || !m.files) return null
  if (m.sealed && m.e2ee !== 'ok') return null
  if (m.local_files?.length) {
    return (
      <Gallery
        tiles={m.local_files.map((f) => ({ key: f.key, kind: f.kind, name: f.name, width: f.width, height: f.height, src: f.url }))}
      />
    )
  }
  return <StoredFiles m={m} />
}

function StoredFiles({ m }: { m: Message }) {
  const { session: e2ee } = useE2ee()
  const { data, error, isLoading, mutate } = useSWR(['message-files', m.id, m.e2ee ?? 'plain'], () => loadShownFiles(m, e2ee), {
    revalidateOnFocus: false,
    // Links to stored files last a few hours; pick up fresh ones well before.
    refreshInterval: m.sealed ? 0 : 4 * 3600_000,
  })

  if (isLoading) return <Placeholders n={m.files ?? 1} />
  if (error || !data) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <ImageOff className="size-3.5" aria-hidden />
        {m.sealed ? 'Couldn’t open these files on this device.' : 'Couldn’t load these files.'}
        {!m.sealed && (
          <button type="button" onClick={() => void mutate()} className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
            Try again
          </button>
        )}
      </div>
    )
  }
  if (data.length === 0) return null
  return (
    <Gallery
      sealed={!!m.sealed}
      tiles={data.map((f: ShownFile) => ({
        key: f.id,
        kind: f.kind,
        name: f.name,
        width: f.width,
        height: f.height,
        bytes: f.bytes,
        src: f.src,
        load: f.meta ? () => openSealed(m, f, e2ee) : undefined,
      }))}
    />
  )
}

function Placeholders({ n }: { n: number }) {
  const single = n === 1
  const box = displayBox(null, null)
  return (
    <div
      className={cn('mt-1.5 grid max-w-sm gap-1', !single && (gridColumns(n) === 2 ? 'grid-cols-2' : 'grid-cols-3'))}
      style={single ? { width: box.width, maxWidth: '100%' } : undefined}
      aria-hidden
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn('animate-pulse rounded-md bg-muted', single ? '' : 'aspect-square')} style={single ? { aspectRatio: `${box.width} / ${box.height}` } : undefined} />
      ))}
    </div>
  )
}

function Gallery({ tiles, sealed = false }: { tiles: Tile[]; sealed?: boolean }) {
  const [viewing, setViewing] = useState<number | null>(null)
  const single = tiles.length === 1
  const box = single ? displayBox(tiles[0].width, tiles[0].height) : null
  return (
    <>
      <div
        className={cn('mt-1.5 grid gap-1', single ? 'w-fit max-w-full' : 'max-w-sm', !single && (gridColumns(tiles.length) === 2 ? 'grid-cols-2' : 'grid-cols-3'))}
      >
        {tiles.map((t, i) => (
          <TileView key={t.key} tile={t} single={single} box={box} sealed={sealed} onOpen={() => setViewing(i)} />
        ))}
      </div>
      <Viewer tiles={tiles} index={viewing} onIndex={setViewing} />
    </>
  )
}

// Encrypted files open on this device. Photos open as soon as they're shown;
// videos wait for a tap, since they can be large.
function useSource(tile: Tile, eager: boolean) {
  const [want, setWant] = useState(eager)
  const { data, error, isLoading } = useSWR(tile.load && want ? ['file-src', tile.key] : null, () => tile.load!(), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  })
  return { src: tile.src ?? data, error, loading: isLoading, request: () => setWant(true) }
}

function TileView({
  tile,
  single,
  box,
  sealed,
  onOpen,
}: {
  tile: Tile
  single: boolean
  box: { width: number; height: number } | null
  sealed: boolean
  onOpen: () => void
}) {
  const { src, error, loading, request } = useSource(tile, tile.kind === 'image')
  const frame = cn(
    'relative overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    !single && 'aspect-square',
  )
  const size = single && box ? { width: box.width, maxWidth: '100%', aspectRatio: `${box.width} / ${box.height}` } : undefined
  const label = tile.kind === 'video' ? `Play video ${tile.name}` : `Open photo ${tile.name}`

  if (error) {
    return (
      <div className={cn(frame, 'flex items-center justify-center p-2 text-center text-xs text-muted-foreground')} style={size}>
        <span className="inline-flex items-center gap-1.5">
          <ImageOff className="size-3.5 shrink-0" aria-hidden />
          Couldn’t open this file.
        </span>
      </div>
    )
  }

  // A single video plays right in the conversation.
  if (tile.kind === 'video' && single && src) {
    return (
      <div className={frame} style={size}>
        <video src={src} controls playsInline preload="metadata" className="size-full bg-foreground/90 object-contain" aria-label={tile.name} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (tile.kind === 'video' && !src) request()
        if (src || tile.kind === 'video') onOpen()
      }}
      aria-label={label}
      className={frame}
      style={size}
    >
      {tile.kind === 'image' ? (
        src ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed and decrypted object URLs, not static assets
          <img src={src} alt={tile.name} loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </span>
        )
      ) : (
        <>
          {src && <video src={src} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden tabIndex={-1} />}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-foreground/30 text-background">
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground/70">
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden />}
            </span>
            {!src && (
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                {sealed && <Lock className="size-3" aria-hidden />}
                {tile.bytes ? formatBytes(tile.bytes) : 'Video'}
              </span>
            )}
          </span>
        </>
      )}
    </button>
  )
}

function Viewer({ tiles, index, onIndex }: { tiles: Tile[]; index: number | null; onIndex: (i: number | null) => void }) {
  const open = index !== null
  const tile = open ? tiles[index] : null
  const many = tiles.length > 1

  useEffect(() => {
    if (!open || !many) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onIndex(((index ?? 0) + 1) % tiles.length)
      if (e.key === 'ArrowLeft') onIndex(((index ?? 0) - 1 + tiles.length) % tiles.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, many, index, tiles.length, onIndex])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-3 p-3 sm:max-w-[min(92vw,1100px)]">
        <DialogTitle className="truncate pr-8 text-sm font-medium">
          {tile?.name}
          {many && index !== null && <span className="ml-2 font-mono text-xs text-muted-foreground">{`${index + 1} of ${tiles.length}`}</span>}
        </DialogTitle>
        {tile && <ViewerItem key={tile.key} tile={tile} />}
        {many && index !== null && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onIndex((index - 1 + tiles.length) % tiles.length)}
              aria-label="Previous"
              className="flex size-8 items-center justify-center rounded-md border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onIndex((index + 1) % tiles.length)}
              aria-label="Next"
              className="flex size-8 items-center justify-center rounded-md border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ViewerItem({ tile }: { tile: Tile }) {
  const { src, error } = useSource(tile, true)
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2">
      <div className="flex min-h-48 w-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted">
        {error ? (
          <span className="text-xs text-muted-foreground">Couldn’t open this file.</span>
        ) : !src ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Opening" />
        ) : tile.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed and decrypted object URLs, not static assets
          <img src={src} alt={tile.name} className="max-h-[74vh] max-w-full object-contain" />
        ) : (
          <video src={src} controls autoPlay playsInline className="max-h-[74vh] max-w-full" aria-label={tile.name} />
        )}
      </div>
      {src && (
        <a
          href={src}
          download={tile.name}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 self-end rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="size-3.5" aria-hidden />
          Download
        </a>
      )}
    </div>
  )
}
