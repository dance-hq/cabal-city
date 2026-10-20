'use client'

import { Loader2, WifiOff } from 'lucide-react'
import { useCabal } from './store'

export function ConnectionBanner() {
  const { connection } = useCabal()
  if (connection === 'live') return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mb-1 flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
    >
      {connection === 'offline' ? (
        <>
          <WifiOff className="size-3.5" aria-hidden />
          {"Offline. You'll catch up when you reconnect."}
        </>
      ) : (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </>
      )}
    </div>
  )
}
