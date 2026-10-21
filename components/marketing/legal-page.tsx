import Link from 'next/link'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'
import { ChicagoStar } from './star'

const PAGES = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/guidelines', label: 'Guidelines' },
]

export const LEGAL_UPDATED = 'October 21, 2026'

// The address people can write to about their data or their account.
export function contactEmail() {
  const from = process.env.CABAL_EMAIL_FROM ?? ''
  return from.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? null
}

export function LegalPage({
  current,
  title,
  summary,
  children,
}: {
  current: string
  title: string
  summary: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="h-2 bg-flag" aria-hidden />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pt-12 pb-20 md:flex-row md:gap-16 md:pt-16">
        <nav aria-label="Policies" className="md:w-44 md:shrink-0">
          <ul className="flex gap-4 text-sm md:sticky md:top-8 md:flex-col md:gap-2">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={p.href === current ? 'page' : undefined}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {p.href === current && <ChicagoStar className="size-3" />}
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="flex max-w-2xl min-w-0 flex-col gap-10">
          <header className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h1>
            <p className="text-lg leading-relaxed text-muted-foreground text-pretty">{summary}</p>
            <p className="font-mono text-xs text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
          </header>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
