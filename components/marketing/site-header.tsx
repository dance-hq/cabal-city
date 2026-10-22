import Link from 'next/link'
import { CabalWordmark } from '@/components/brand/logo'
import { cn } from '@/lib/utils'

export function SiteHeader({ current }: { current?: string }) {
  const here = current === '/docs'
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
      <Link href="/" aria-label="cabal.city home" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
        <CabalWordmark className="h-7" />
      </Link>
      <nav aria-label="Site" className="flex items-center gap-5 text-sm text-muted-foreground">
        <Link
          href="/docs"
          aria-current={here ? 'page' : undefined}
          className={cn('hover:text-foreground', here && 'text-foreground')}
        >
          Docs
        </Link>
        {/* A plain anchor: next/link ignores a click when the URL already ends in #download. */}
        <a href="/#download" className="hidden hover:text-foreground sm:inline">
          Download
        </a>
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </nav>
    </header>
  )
}
