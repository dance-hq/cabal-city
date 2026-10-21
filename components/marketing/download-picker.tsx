'use client'

import { useSyncExternalStore } from 'react'
import { ArrowDownToLine, Laptop, Monitor, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'

type Os = 'mac' | 'windows' | 'linux'

export type Platform = {
  os: Os
  name: string
  detail: string
  url: string | null
  alt: { label: string; url: string } | null
}

const ICONS: Record<Os, React.ReactNode> = {
  mac: <Laptop className="size-5" aria-hidden />,
  windows: <Monitor className="size-5" aria-hidden />,
  linux: <Terminal className="size-5" aria-hidden />,
}

// Phones and tablets get no pick: Cabal runs in their browser instead.
function detectOs(): Os | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
  const platform = (nav.userAgentData?.platform || nav.platform || '').toLowerCase()
  const ua = nav.userAgent.toLowerCase()
  if (nav.userAgentData?.mobile || /android|iphone|ipad|ipod/.test(ua)) return null
  if (platform.includes('mac') || ua.includes('mac os')) return nav.maxTouchPoints > 1 ? null : 'mac'
  if (platform.includes('win') || ua.includes('windows')) return 'windows'
  if (platform.includes('linux') || ua.includes('linux')) return 'linux'
  return null
}

const noSubscription = () => () => {}

export function DownloadPicker({ platforms }: { platforms: Platform[] }) {
  const detected = useSyncExternalStore(noSubscription, detectOs, () => null)

  return (
    <ul className="grid gap-6 sm:grid-cols-3">
      {platforms.map((p) => {
        const mine = detected === p.os
        return (
          <li key={p.os} className={cn('flex flex-col gap-3 border-t pt-5', mine && 'border-flag')}>
            <div className="flex items-center gap-2.5">
              <span className="text-flag">{ICONS[p.os]}</span>
              <span className="font-medium">{p.name}</span>
              {mine && <span className="ml-auto font-mono text-[11px] text-flag">This computer</span>}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{p.detail}</p>
            {p.url ? (
              <a
                href={p.url}
                className={cn(
                  'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  mine ? 'bg-primary text-primary-foreground hover:opacity-90' : 'border hover:bg-accent',
                )}
              >
                <ArrowDownToLine className="size-4" aria-hidden />
                Download for {p.name}
              </a>
            ) : (
              <span className="inline-flex h-10 items-center justify-center rounded-lg border border-dashed px-4 font-mono text-xs text-muted-foreground">
                Coming with the first release
              </span>
            )}
            {p.alt && (
              <a
                href={p.alt.url}
                className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.alt.label}
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}
