import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpRight } from 'lucide-react'
import { getCommunity } from '@/lib/community'
import { onlineCount } from '@/lib/online-count'
import { latestRelease } from '@/lib/releases'
import { githubUrl } from '@/lib/config'
import { GithubIcon } from '@/components/brand/github-icon'
import { AppleIcon, WindowsIcon } from '@/components/brand/platform-icons'
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

const PLATFORM_BUTTON =
  'group flex items-center gap-2.5 rounded-xl border bg-card p-2.5 transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:gap-3 sm:pr-4'

const OPEN_SOURCE =
  'rounded-sm text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

const GITHUB_TILE =
  'group flex items-center gap-2.5 rounded-xl border bg-card p-2.5 transition-colors hover:border-foreground/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none col-span-2 sm:gap-3 sm:pr-4'

const SECONDARY_LINK =
  'group inline-flex items-center gap-1.5 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

export default async function Home() {
  const community = await getCommunity()
  const [release, online] = await Promise.all([latestRelease(), community ? onlineCount(community.id) : null])
  // Straight to the installer when the release has one (Mac = Apple Silicon); otherwise the
  // downloads section further down, which also has Linux.
  const installer = (files: 'windows' | 'mac') =>
    (release.state === 'ready' && release[files][0]?.url) || '#download'
  const platforms = [
    { name: 'Windows', href: installer('windows'), Icon: WindowsIcon },
    { name: 'Mac', href: installer('mac'), Icon: AppleIcon },
  ]

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
            Cabal is an{' '}
            {githubUrl ? (
              <a href={githubUrl} className={`${OPEN_SOURCE} hover:decoration-foreground`}>
                open source
              </a>
            ) : (
              <span className={OPEN_SOURCE}>open source</span>
            )}{' '}
            home for Chicago&rsquo;s builders. Find people working on interesting things,
            see who&rsquo;s around, and jump into conversations or rooms to build alongside them.
          </p>
          <div className="grid grid-cols-2 gap-2.5 pt-2 sm:flex sm:flex-wrap sm:items-center">
            {/* Plain anchors: next/link ignores a click when the URL already ends in #download. */}
            {platforms.map(({ name, href, Icon }) => (
              <a key={name} href={href} className={PLATFORM_BUTTON}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-muted-foreground">Download for</span>
                  <span className="text-base font-semibold leading-tight">{name}</span>
                </span>
                <ArrowDownToLine
                  className="ml-3 hidden size-4 text-muted-foreground transition-colors group-hover:text-primary sm:block"
                  aria-hidden
                />
              </a>
            ))}
            {githubUrl && (
              <a href={githubUrl} className={GITHUB_TILE}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground">
                  <GithubIcon className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-muted-foreground">View on</span>
                  <span className="text-base font-semibold leading-tight">GitHub</span>
                </span>
                <ArrowUpRight
                  className="ml-3 hidden size-4 text-muted-foreground transition-colors group-hover:text-foreground sm:block"
                  aria-hidden
                />
              </a>
            )}
            <Link
              href="/login"
              className={`${SECONDARY_LINK} col-span-2 pt-2 text-foreground sm:ml-3 sm:pt-0`}
            >
              Or open Cabal in your browser
              <ArrowUpRight
                className="size-4 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
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
              <Feature title="Help each other ship" mono="#cabal-chat">
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
