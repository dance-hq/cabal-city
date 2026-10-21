import Link from 'next/link'
import { GithubIcon } from '@/components/brand/github-icon'
import { CabalWordmark } from '@/components/brand/logo'
import { githubUrl } from '@/lib/config'
import { cn } from '@/lib/utils'

export function SiteHeader({ current }: { current?: string }) {
  const here = current === '/how-it-works'
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
      <Link href="/" aria-label="cabal.city home" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
        <CabalWordmark className="h-7" />
      </Link>
      <nav aria-label="Site" className="flex items-center gap-5 text-sm text-muted-foreground">
        <Link
          href="/how-it-works"
          aria-current={here ? 'page' : undefined}
          className={cn('hover:text-foreground', here && 'text-foreground')}
        >
          How it works
        </Link>
        {/* A plain anchor: next/link ignores a click when the URL already ends in #download. */}
        <a href="/#download" className="hidden hover:text-foreground sm:inline">
          Download
        </a>
        {githubUrl && (
          <a href={githubUrl} className="hidden items-center gap-1.5 hover:text-foreground md:inline-flex">
            <GithubIcon className="size-4" aria-hidden />
            GitHub
          </a>
        )}
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </nav>
    </header>
  )
}
