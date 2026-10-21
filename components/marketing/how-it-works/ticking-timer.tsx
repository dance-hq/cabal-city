'use client'

import { useEffect, useState } from 'react'
import { formatSession } from '@/lib/session'

// A sample lock-in clock for the How it works page. It counts up from a
// fixed start so the server and the first browser paint agree.
export function TickingTimer({ startSeconds }: { startSeconds: number }) {
  const [seconds, setSeconds] = useState(startSeconds)

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  return <span className="font-mono font-medium tabular-nums text-foreground">{formatSession(seconds * 1000)}</span>
}
