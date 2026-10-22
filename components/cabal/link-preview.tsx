'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { firstPreviewableLink, type LinkPreviewData } from '@/lib/link-preview'
import { appOrigins } from './channel-links'

async function load([, url]: readonly [string, string]): Promise<LinkPreviewData | null> {
  const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
  if (!res.ok) return null
  return ((await res.json()) as { preview: LinkPreviewData | null }).preview
}

// A card for the first link in a message. Only used where the server can read
// the message anyway (rooms and teams), never in end-to-end encrypted DMs.
export function LinkPreview({ body }: { body: string }) {
  const url = useMemo(() => firstPreviewableLink(body, appOrigins()), [body])
  const { data } = useSWR(url ? (['link-preview', url] as const) : null, load, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    dedupingInterval: 60 * 60_000,
  })
  const [noImage, setNoImage] = useState(false)
  const card = useRef<HTMLAnchorElement>(null)

  // The card arrives after its message, so keep the conversation pinned to the
  // bottom if it was there before the card made it taller.
  useLayoutEffect(() => {
    const el = card.current
    const log = el?.closest<HTMLElement>('[role="log"]')
    if (!el || !log) return
    if (log.scrollHeight - log.scrollTop - log.clientHeight - el.offsetHeight < 80) log.scrollTop = log.scrollHeight
  }, [data])

  if (!url || !data) return null
  return (
    <a
      ref={card}
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-2 flex max-w-md flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {data.image && !noImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setNoImage(true)}
          className="aspect-[1.91/1] w-full border-b bg-accent object-cover"
        />
      )}
      <span className="flex flex-col gap-1 px-3 py-2.5">
        <span className="truncate font-mono text-[11px] leading-4 text-muted-foreground">{data.site}</span>
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{data.title}</span>
        {data.description && (
          <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{data.description}</span>
        )}
      </span>
    </a>
  )
}
