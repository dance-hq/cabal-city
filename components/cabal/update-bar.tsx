'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { RefreshCw, X } from 'lucide-react'
import { desktop, type DesktopUpdate } from '@/lib/desktop'

const LOADED_BUILD = process.env.NEXT_PUBLIC_CABAL_BUILD ?? ''

async function liveBuild(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`version check ${res.status}`)
  const body = (await res.json()) as { build?: string }
  return body.build ?? ''
}

function useNewerSite() {
  const { data } = useSWR(LOADED_BUILD ? '/api/version' : null, liveBuild, {
    refreshInterval: 10 * 60_000,
    revalidateOnFocus: true,
    focusThrottleInterval: 60_000,
    dedupingInterval: 60_000,
    shouldRetryOnError: false,
  })
  return data && data !== LOADED_BUILD ? data : null
}

function useDesktopUpdate() {
  const [ready, setReady] = useState<DesktopUpdate | null>(null)
  useEffect(() => {
    const d = desktop()
    if (!d?.getUpdate || !d.onUpdate) return
    let live = true
    d.getUpdate()
      .then((update) => live && update && setReady(update))
      .catch(() => {})
    const off = d.onUpdate(setReady)
    return () => {
      live = false
      off()
    }
  }, [])
  return ready
}

export function UpdateBar() {
  const desktopUpdate = useDesktopUpdate()
  const newerSite = useNewerSite()
  const [dismissed, setDismissed] = useState<string | null>(null)

  // A restart also loads the newest site, so the desktop update wins when both are waiting.
  const notice = desktopUpdate
    ? {
        key: `desktop:${desktopUpdate.version}`,
        text: desktopUpdate.version
          ? `Cabal ${desktopUpdate.version} is ready to install.`
          : 'A new version of Cabal is ready to install.',
        action: 'Restart to update',
        run: () => desktop()?.installUpdate?.(),
      }
    : newerSite
      ? {
          key: `site:${newerSite}`,
          text: 'Cabal was updated.',
          action: 'Refresh',
          run: () => window.location.reload(),
        }
      : null

  if (!notice || dismissed === notice.key) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b bg-sidebar-accent py-1.5 pr-1.5 pl-3 text-sm text-sidebar-accent-foreground"
    >
      <RefreshCw className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 truncate">{notice.text}</p>
      <button
        type="button"
        onClick={notice.run}
        className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {notice.action}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(notice.key)}
        aria-label="Not now"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}
