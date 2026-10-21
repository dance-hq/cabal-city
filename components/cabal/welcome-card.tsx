'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useCabal } from './store'

const KEY = 'cabal:welcome-dismissed'

// A note from the app itself, styled so it can't be mistaken for a person.
export function WelcomeCard() {
  const { channels, open, community } = useCabal()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(localStorage.getItem(KEY) !== '1')
  }, [])

  if (!show) return null
  const intro = channels.find((c) => c.kind === 'room' && c.slug === 'introductions')
  const dismiss = () => {
    localStorage.setItem(KEY, '1')
    setShow(false)
  }

  return (
    <aside aria-label="Welcome from Cabal" className="mx-3 mt-1 mb-2 rounded-lg border border-dashed bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10.5px] tracking-wider text-mark uppercase">From Cabal</p>
        <button
          type="button"
          onClick={dismiss}
          className="-mt-1 -mr-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss welcome"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-[13px] font-medium">Welcome to {community.name}.</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
        <li>
          Say hello in{' '}
          {intro ? (
            <button
              type="button"
              onClick={() => open(intro.id)}
              className="rounded font-mono text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              #introductions
            </button>
          ) : (
            '#introductions'
          )}
          .
        </li>
        <li>Click anyone&apos;s name to message them.</li>
        <li>When you want to focus, Lock in and say what you&apos;re building. It&apos;s optional, and you can stop any time.</li>
      </ul>
    </aside>
  )
}
