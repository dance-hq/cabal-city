import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpRight } from 'lucide-react'
import { getCommunity } from '@/lib/community'
import { onlineCount } from '@/lib/online-count'
import { latestRelease } from '@/lib/releases'
import { githubUrl } from '@/lib/config'
import { GithubIcon } from '@/components/brand/github-icon'
import { ChicagoFlag } from '@/components/marketing/chicago-flag'
import { Downloads } from '@/components/marketing/downloads'
import { DeletedNotice } from '@/components/marketing/deleted-notice'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { SITE_DESCRIPTION } from '@/lib/site'

export const revalidate = 60

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'cabal.city', description: SITE_DESCRIPTION, locale: 'en_US', url: '/' },
}

export default async function Home() {
  const community = await getCommunity()
  const [release, online] = await Promise.all([latestRelease(), community ? onlineCount(community.id) : null])

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <Suspense>
        <DeletedNotice />
      </Suspense>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-10 pb-12 md:pt-16 md:pb-16">
          <p className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-online" aria-hidden />
            Chicago
            {online !== null && online > 0 && (
              <span>{online === 1 ? ' · 1 builder online now' : ` · ${online} builders online now`}</span>
            )}
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.02] font-semibold tracking-tight text-balance md:text-7xl">
            Chicago builders, it&apos;s time to lock in.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Cabal is an open-source home for Chicago&rsquo;s builders. Find people working on interesting things,
            see who&rsquo;s around, and jump into conversations or rooms to build alongside them.
          </p>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-wrap gap-3">
              <Link
                href="#download"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowDownToLine className="size-4" aria-hidden />
                Get the desktop app
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open in browser
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">Free and open source. Works on Windows, Mac, Linux or any browser.</p>
          </div>
        </section>

        <ChicagoFlag />

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pt-16 pb-20 md:gap-24 md:pt-24">
          <section aria-labelledby="features-title" className="flex flex-col gap-8">
            <h2 id="features-title" className="sr-only">
              What Cabal does
            </h2>
            <div className="grid gap-10 md:grid-cols-3">
              <Feature title="Find your people" mono="#introductions">
                Get to know Chicago&apos;s builders. Introduce yourself, see what others are making, and message the
                people you want to build alongside.
              </Feature>
              <Feature title="Lock in, on your terms" mono="status">
                Say what you&apos;re working on and choose when you&apos;re around, away, or heads-down with
                notifications muted. Cabal never watches your keyboard or screen.
              </Feature>
              <Feature title="Help each other ship" mono="#lobby">
                Share what you&apos;re launching, ask for feedback, and make the intro someone needs. Start a team
                room for your crew. Build your thing, just not alone.
              </Feature>
            </div>
          </section>

          <Downloads release={release} />

          {githubUrl && (
            <section
              aria-labelledby="open-title"
              className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10"
            >
              <div className="flex max-w-xl flex-col gap-2">
                <h2 id="open-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Built in the open.
                </h2>
                <p className="leading-relaxed text-muted-foreground text-pretty">
                  Cabal is open source and MIT licensed. Read the code, suggest a change, or help shape what it
                  becomes.
                </p>
              </div>
              <a
                href={githubUrl}
                className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-lg border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:self-auto"
              >
                <GithubIcon className="size-4" aria-hidden />
                View on GitHub
              </a>
            </section>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function Feature({ title, mono, children }: { title: string; mono: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-mark">{mono}</p>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
