import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { githubUrl } from '@/lib/config'
import { ChicagoStar } from './star'

const LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/guidelines', label: 'Community guidelines' },
]

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <p className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.2em] text-foreground">
            <ChicagoStar className="size-3.5" />
            {BRAND.tagline}
          </p>
          <p className="font-mono text-xs">Made in Chicago · MIT licensed · No ads, no tracking</p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
          {githubUrl && (
            <a href={githubUrl} className="hover:text-foreground">
              Source code
            </a>
          )}
        </nav>
      </div>
    </footer>
  )
}
