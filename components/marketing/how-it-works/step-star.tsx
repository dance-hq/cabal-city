'use client'

import { useEffect, useRef, useState } from 'react'
import { ChicagoStar } from '@/components/marketing/star'
import { cn } from '@/lib/utils'

// Each step's star lands as it scrolls into view. Stars start visible (no
// JavaScript, reduced motion), and only ones still below the fold wait.
export function StepStar({ outline = false }: { outline?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState<'shown' | 'waiting' | 'landing'>('shown')

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setState('landing')
      return
    }
    setState('waiting')
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setState('landing')
        io.disconnect()
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <span ref={ref} className={cn(state === 'waiting' && 'opacity-0', state === 'landing' && 'star-in')}>
      <ChicagoStar outline={outline} className="size-8 md:size-10" />
    </span>
  )
}
