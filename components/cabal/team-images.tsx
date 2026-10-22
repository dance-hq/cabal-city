'use client'

import { useRef, useState } from 'react'
import useSWR, { mutate as mutateGlobal } from 'swr'
import { ImagePlus, Loader2, Lock, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/errors'
import {
  TeamImageError,
  isOwnTeamImageUrl,
  prepareTeamImage,
  removeTeamImage,
  uploadTeamImage,
  type TeamImageKind,
} from '@/lib/team-images'
import type { TeamVisibility } from '@/lib/types'
import { cn } from '@/lib/utils'

export type TeamImages = { logo_url: string | null; banner_url: string | null }

const teamImagesKey = (teamId: string) => ['team-images', teamId] as const

export function useTeamImages(teamId: string | null) {
  return useSWR(
    teamId ? teamImagesKey(teamId) : null,
    async () => {
      const { data, error } = await createClient().from('teams').select('logo_url, banner_url').eq('id', teamId!).maybeSingle()
      if (error) throw error
      return {
        logo_url: isOwnTeamImageUrl(data?.logo_url) ? data!.logo_url : null,
        banner_url: isOwnTeamImageUrl(data?.banner_url) ? data!.banner_url : null,
      } as TeamImages
    },
    { refreshInterval: 120_000, keepPreviousData: true },
  )
}

export function refreshTeamImages(teamId: string) {
  return mutateGlobal(teamImagesKey(teamId))
}

// A team's logo, or the public/invite-only icon in the same square when it has none.
export function TeamMark({
  logo,
  visibility,
  size = 32,
  className,
}: {
  logo: string | null | undefined
  visibility: TeamVisibility | null
  size?: number
  className?: string
}) {
  const radius = size >= 40 ? 'rounded-lg' : 'rounded-md'
  if (logo && isOwnTeamImageUrl(logo)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn('shrink-0 bg-muted object-cover', radius, className)}
      />
    )
  }
  const Icon = visibility === 'public' ? Users : Lock
  return (
    <span
      style={{ width: size, height: size }}
      className={cn('flex shrink-0 items-center justify-center bg-muted text-muted-foreground', radius, className)}
      aria-hidden
    >
      <Icon style={{ width: Math.round(size * 0.45), height: Math.round(size * 0.45) }} />
    </span>
  )
}

export function TeamBanner({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn('w-full shrink-0 overflow-hidden bg-muted', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="size-full object-cover" />
    </div>
  )
}

// Owners only: pick, preview and remove the team's logo and banner.
export function TeamImagesEditor({ teamId, onChanged }: { teamId: string; onChanged?: () => void }) {
  const { data, mutate } = useTeamImages(teamId)
  const [busy, setBusy] = useState<TeamImageKind | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  async function save(kind: TeamImageKind, file: File | null) {
    const current = kind === 'logo' ? data?.logo_url : data?.banner_url
    setBusy(kind)
    let uploaded: string | null = null
    try {
      if (file) uploaded = await uploadTeamImage(teamId, kind, await prepareTeamImage(file, kind))
      const { error } = await createClient().rpc('set_team_image', { p_team: teamId, p_kind: kind, p_url: uploaded })
      if (error) throw error
      if (current && current !== uploaded) removeTeamImage(current)
      await mutate()
      onChanged?.()
      toast.success(
        file ? (kind === 'logo' ? 'Logo updated' : 'Banner updated') : kind === 'logo' ? 'Logo removed' : 'Banner removed',
      )
    } catch (error) {
      if (uploaded) removeTeamImage(uploaded)
      toast.error(error instanceof TeamImageError ? error.message : friendlyError(error))
    } finally {
      setBusy(null)
    }
  }

  function picker(kind: TeamImageKind, ref: React.RefObject<HTMLInputElement | null>) {
    return (
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          e.target.value = ''
          if (file) void save(kind, file)
        }}
      />
    )
  }

  const logo = data?.logo_url ?? null
  const banner = data?.banner_url ?? null

  return (
    <div className="flex flex-col gap-3 rounded-md border px-3 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Logo and banner</span>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Shown at the top of the team, in the sidebar and in the Teams list. Wide banners work best (4:1).
        </p>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => bannerInput.current?.click()}
          disabled={busy !== null}
          className="group relative block aspect-[4/1] w-full overflow-hidden rounded-md bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={banner ? 'Change banner' : 'Add a banner'}
        >
          {banner && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner} alt="" className="size-full object-cover" />
          )}
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-medium',
              banner
                ? 'bg-background/60 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
                : 'text-muted-foreground',
            )}
          >
            {busy === 'banner' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
            {banner ? 'Change banner' : 'Add a banner'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => logoInput.current?.click()}
          disabled={busy !== null}
          className="group absolute -bottom-5 left-3 rounded-lg ring-4 ring-background focus-visible:ring-ring focus-visible:outline-none"
          aria-label={logo ? 'Change logo' : 'Add a logo'}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-14 rounded-lg bg-muted object-cover" />
          ) : (
            <span className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed bg-card text-[10px] font-medium text-muted-foreground">
              <ImagePlus className="size-4" aria-hidden />
              Logo
            </span>
          )}
          {busy === 'logo' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
              <Loader2 className="size-4 animate-spin" aria-hidden />
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1 pt-1">
        {logo && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busy !== null} onClick={() => save('logo', null)}>
            Remove logo
          </Button>
        )}
        {banner && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={busy !== null} onClick={() => save('banner', null)}>
            Remove banner
          </Button>
        )}
        <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => logoInput.current?.click()}>
          {logo ? 'Change logo' : 'Upload logo'}
        </Button>
        <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => bannerInput.current?.click()}>
          {banner ? 'Change banner' : 'Upload banner'}
        </Button>
      </div>
      {picker('logo', logoInput)}
      {picker('banner', bannerInput)}
    </div>
  )
}
