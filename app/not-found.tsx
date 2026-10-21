import Link from 'next/link'
import { ChicagoStar } from '@/components/marketing/star'

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-flag">
        <ChicagoStar outline className="size-16" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nothing at this address</h1>
        <p className="text-muted-foreground">The link may be old, or the page has moved down the block.</p>
      </div>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to Cabal
      </Link>
    </main>
  )
}
