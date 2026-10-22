'use client'

import { useEffect, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { Loader2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHARP_WIDTH, TEAM_IMAGE_ASPECT, type CropArea, type TeamImageKind } from '@/lib/team-images'
import { cn } from '@/lib/utils'

const MIN_ZOOM = 1
const MAX_ZOOM = 4

// Pick the part of a just-chosen picture to keep, with a live look at how it
// will sit in the team header.
export function TeamImageCropper({
  file,
  kind,
  teamName,
  logo,
  busy,
  onCancel,
  onSave,
}: {
  file: File | null
  kind: TeamImageKind
  teamName?: string | null
  logo?: string | null
  busy: boolean
  onCancel: () => void
  onSave: (crop: CropArea) => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [pixels, setPixels] = useState<Area | null>(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    setFailed(false)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setArea(null)
    setPixels(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const banner = kind === 'banner'
  const aspect = TEAM_IMAGE_ASPECT[kind]
  const soft = pixels && pixels.width < SHARP_WIDTH[kind]

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{banner ? 'Position your banner' : 'Position your logo'}</DialogTitle>
          <DialogDescription>
            Drag to choose what shows. Scroll, pinch or use the slider to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className={cn('relative w-full overflow-hidden rounded-md bg-muted', banner ? 'h-56 sm:h-64' : 'h-64 sm:h-72')}>
          {src && !failed && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={aspect}
              objectFit={banner ? 'horizontal-cover' : 'contain'}
              showGrid={false}
              zoomSpeed={0.3}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(next, nextPixels) => {
                setArea(next)
                setPixels(nextPixels)
              }}
              onMediaLoaded={() => setFailed(false)}
              cropperProps={{ 'aria-label': banner ? 'Banner crop area. Use arrow keys to move.' : 'Logo crop area. Use arrow keys to move.' }}
            />
          )}
          {failed && (
            <p className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Couldn&apos;t open that image. Try a PNG or JPG.
            </p>
          )}
          {src && (
            // Only here to notice files the browser can't draw.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" hidden onError={() => setFailed(true)} />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 flex-1 cursor-pointer accent-primary"
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>

        {src && area && !failed && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">How it will look</span>
            {banner ? (
              <BannerPreview src={src} area={area} teamName={teamName} logo={logo} />
            ) : (
              <LogoPreview src={src} area={area} teamName={teamName} />
            )}
          </div>
        )}

        {soft && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            This part of the picture is only {Math.round(pixels.width)} px wide, so it may look a little soft on big
            screens. {banner ? 'An image at least 1,800 px wide looks sharpest.' : 'A larger image will look sharper.'}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => pixels && onSave(pixels)} disabled={busy || !pixels || failed}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {banner ? 'Save banner' : 'Save logo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Shows only the chosen part, using the cropper's percentages, so nothing has to be drawn yet.
function CroppedImage({
  src,
  area,
  className,
  style,
}: {
  src: string
  area: Area
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${10000 / area.width}%`,
          left: `${(-area.x * 100) / area.width}%`,
          top: `${(-area.y * 100) / area.height}%`,
        }}
      />
    </div>
  )
}

function BannerPreview({
  src,
  area,
  teamName,
  logo,
}: {
  src: string
  area: Area
  teamName?: string | null
  logo?: string | null
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <CroppedImage src={src} area={area} className="w-full" style={{ aspectRatio: TEAM_IMAGE_ASPECT.banner }} />
      <div className="flex items-end gap-2 px-3 pb-2.5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="-mt-5 size-10 shrink-0 rounded-lg bg-muted object-cover ring-4 ring-background" />
        ) : null}
        <span className={cn('truncate text-sm font-semibold', !logo && 'pt-2')}>{teamName || 'Your team'}</span>
      </div>
    </div>
  )
}

function LogoPreview({ src, area, teamName }: { src: string; area: Area; teamName?: string | null }) {
  return (
    <div className="flex items-center gap-4 rounded-md border px-3 py-2.5">
      <CroppedImage src={src} area={area} className="size-14 shrink-0 rounded-lg" />
      <div className="flex min-w-0 items-center gap-2 rounded-md bg-accent/60 px-2 py-1">
        <CroppedImage src={src} area={area} className="size-4 shrink-0 rounded" />
        <span className="truncate text-[13px]">{teamName || 'Your team'}</span>
      </div>
    </div>
  )
}
