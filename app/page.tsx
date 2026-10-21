import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, ArrowRight } from 'lucide-react'
import { getCommunity } from '@/lib/community'
import { onlineCount } from '@/lib/online-count'
import { latestRelease } from '@/lib/releases'
import { githubUrl } from '@/lib/config'
import { GithubIcon } from '@/components/brand/github-icon'
import { ChicagoFlag } from '@/components/marketing/chicago-flag'
import { Downloads } from '@/components/marketing/downloads'
import { DeletedNotice } from '@/components/marketing/deleted-notice'
import { ProductPreview } from '@/components/marketing/product-preview'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'

export const revalidate = 60

export default async function Home() {
  const community = await getCommunity()
  const [release, online] = await Promise.all([latestRelease(), community ? onlineCount(community.id) : null])

  return (
    <div className="chicago flex min-h-svh flex-col">
      <SiteHeader />
      <Suspense>
        <DeletedNotice />
      </Suspense>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-6 pt-10 pb-20 md:gap-28 md:pt-16">
        <section aria-labelledby="hero-title" className="flex flex-col gap-12 md:gap-16">
          <div className="flex flex-col gap-6">
            <p className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-online" aria-hidden />
              Chicago
              {online !== null && online > 0 && (
                <span>{online === 1 ? ' · 1 builder online now' : ` · ${online} builders online now`}</span>
              )}
            </p>
            <h1
              id="hero-title"
              className="max-w-3xl text-4xl leading-[1.02] font-semibold tracking-tight text-balance md:text-7xl"
            >
              Chicago builders, it&apos;s time to lock in.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Meet the people building Chicago&apos;s next chapter. Find your people, share what you&apos;re working
              on, and make progress together. Cabal is an open-source home for builders who show up for each other.
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Join the Chicago Cabal
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href="#download"
                  className="inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowDownToLine className="size-4" aria-hidden />
                  Download desktop app
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Free, in your browser. Sign in with an emailed code, no password.
              </p>
            </div>
          </div>

          <ProductPreview communityName={community?.name ?? 'Chicago'} />
        </section>

        <section aria-labelledby="reasons-title" className="flex flex-col gap-8">
          <h2 id="reasons-title" className="sr-only">
            Why Cabal
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            <Reason title="Find your people" mono="#introductions">
              Get to know Chicago&apos;s builders. Introduce yourself, see what others are making, and message the
              people you want to build alongside.
            </Reason>
            <Reason title="Lock in, on your terms" mono="status">
              Say what you&apos;re working on and choose when you&apos;re around, away, or heads-down with
              notifications muted. Cabal never watches your keyboard or screen.
            </Reason>
            <Reason title="Help each other ship" mono="#lobby">
              Share what you&apos;re launching, ask for feedback, and make the intro someone needs. Start a private
              team room for your crew. Build your thing, just not alone.
            </Reason>
          </div>
        </section>

        <ChicagoFlag />

        <Downloads release={release} />

        {githubUrl && (
          <section aria-labelledby="open-title" className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-10">
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
      </main>

      <SiteFooter />
    </div>
  )
}

function Reason({ title, mono, children }: { title: string; mono: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-mark">{mono}</p>
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{children}</p>
    </div>
  )
}
