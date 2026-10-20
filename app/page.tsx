import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpRight } from 'lucide-react'
import { getCommunity } from '@/lib/community'
import { onlineCount } from '@/lib/online-count'
import { latestRelease } from '@/lib/releases'
import { githubUrl } from '@/lib/config'
import { ChicagoFlag } from '@/components/marketing/chicago-flag'
import { Downloads } from '@/components/marketing/downloads'
import { DeletedNotice } from '@/components/marketing/deleted-notice'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { ChicagoStar } from '@/components/marketing/star'

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
            Chicago&apos;s builders, one buddy list away.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Cabal is an open-source instant messenger for people building things in Chicago. See who&apos;s around,
            send a DM, or drop into a room. AIM&apos;s buddy list meets IRC&apos;s rooms.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
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
        </section>

        <ChicagoFlag />

        <div className="mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pt-16 pb-20 md:gap-24 md:pt-24">
          <section aria-labelledby="features-title" className="flex flex-col gap-8">
            <h2 id="features-title" className="sr-only">
              What Cabal does
            </h2>
            <div className="grid gap-10 md:grid-cols-3">
              <Feature title="A buddy list, first" mono="buddies">
                Online, away, do not disturb, or invisible. You set it; Cabal never watches your keyboard or your
                screen.
              </Feature>
              <Feature title="Messages that keep up" mono="/msg">
                Direct messages and a couple of city-wide rooms, with real history, unread markers and quiet
                notifications.
              </Feature>
              <Feature title="A room for your team" mono="#your-team">
                Start a private team and invite your co-founders. Nobody else in the community can read it.
              </Feature>
            </div>
          </section>

          <section
            aria-labelledby="chicago-title"
            className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start md:gap-10"
          >
            <ChicagoStar className="size-10 md:size-14" />
            <div className="flex max-w-2xl flex-col gap-4">
              <h2 id="chicago-title" className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Chicago first. One city, one buddy list.
              </h2>
              <p className="leading-relaxed text-muted-foreground text-pretty">
                Right now Cabal has one community, and it&apos;s Chicago: founders, engineers, designers, and whoever
                runs the meetup you went to last month. Signing up puts you on the city&apos;s buddy list. When it
                feels right here, we&apos;ll open the next city.
              </p>
              {githubUrl && (
                <p className="leading-relaxed text-muted-foreground text-pretty">
                  Can&apos;t wait for your city? Cabal is open source.{' '}
                  <a href={githubUrl} className="text-foreground underline underline-offset-4 hover:text-flag">
                    Run your own
                  </a>{' '}
                  for any group you like.
                </p>
              )}
            </div>
          </section>

          <Downloads release={release} />
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
