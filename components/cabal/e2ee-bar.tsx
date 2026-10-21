'use client'

import { useState } from 'react'
import { KeyRound, Lock, X } from 'lucide-react'
import { useE2ee } from './e2ee-provider'

// Across the top of the app: this device can't read direct messages yet, or
// the recovery key made here still needs saving.
export function E2eeBar() {
  const { status, recovery, recoveryOpen, unlockOpen, setUnlockOpen, setRecoveryOpen } = useE2ee()
  const [dismissed, setDismissed] = useState<string | null>(null)

  const notice =
    status === 'locked' && !unlockOpen
      ? {
          key: 'locked',
          icon: <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />,
          text: 'Direct messages are locked on this device.',
          action: 'Unlock',
          run: () => setUnlockOpen(true),
        }
      : status === 'ready' && recovery && !recoveryOpen
        ? {
            key: 'recovery',
            icon: <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />,
            text: 'Save your recovery key, so you can always get back into your direct messages.',
            action: 'Show key',
            run: () => setRecoveryOpen(true),
          }
        : null

  if (!notice || dismissed === notice.key) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b bg-sidebar-accent py-1.5 pr-1.5 pl-3 text-sm text-sidebar-accent-foreground"
    >
      {notice.icon}
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
