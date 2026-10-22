'use client'

import { useEffect } from 'react'
import { chatBridge } from '@/lib/popout'

// If the small desktop chat window breaks, hand the conversation to the main
// Cabal window (which closes this one) instead of leaving an error page floating.
export default function ChatWindowError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error)
    chatBridge()?.openInCabal()
  }, [error])

  return (
    <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">This chat couldn&apos;t open here.</p>
      <button
        type="button"
        onClick={reset}
        className="h-8 rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </div>
  )
}
