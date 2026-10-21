import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowDownToLine, ArrowUpRight } from 'lucide-react'
import { StepStar } from '@/components/marketing/how-it-works/step-star'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { AroundScene, LockInScene, ProfileScene, SignInScene } from '@/components/marketing/how-it-works/scenes'

const DESCRIPTION =
  'How Cabal works: sign in with your email, say who you are, see which Chicago builders are around, and lock in alongside them.'

export const metadata: Metadata = {
  title: 'How it works',
  description: DESCRIPTION,
  alternates: { canonical: '/how-it-works' },
  openGraph: { type: 'website', siteName: 'cabal.city', title: 'How Cabal works', description: DESCRIPTION, url: '/how-it-works' },
}

const STEPS = [
  {
    label: 'Sign in',
    title: 'Sign in with your email.',
    body: 'No password to make up or forget. We email you a code, you type it in, and you’re through.',
    scene: <SignInScene />,
  },
  {
    label: 'Say hi',
    title: 'Tell us your name and what you do.',
    body: 'Founder, builder or investor. That’s the whole setup. Add a photo, links and what you’re building from your profile whenever you like.',
    scene: <ProfileScene />,
  },
  {
    label: 'Find people',
    title: 'See who’s around.',
    body: 'Your buddy list shows who’s here right now and how they’re doing. Message anyone directly, drop into #lobby, or start a team room for your crew.',
    scene: <AroundScene />,
  },
  {
    label: 'Lock in',
    title: 'Lock in, one tap.',
    body: 'Start a session and a gold ring goes around your photo, so people know you’re heads-down. The desktop app keeps a small timer in the corner of your screen while you work.',
    scene: <LockInScene />,
  },
]

const FACTS = [
  {
    q: 'What does it cost?',
    a: 'Nothing. Cabal is free and open source under the MIT license, with no ads and no tracking.',
  },
  {
    q: 'Does Cabal watch what I’m doing?',
    a: 'No. A session is a timer you start. Cabal never reads your keyboard or screen. If the app goes quiet for a few minutes, the clock pauses and that time isn’t counted.',
  },
  {
    q: 'Desktop app or browser?',
    a: 'Either. The desktop app for Windows, Mac and Linux adds notifications, a tray icon and the corner timer. The browser works anywhere.',
  },
  {
    q: 'Who can see that I’m around?',
    a: 'Other members of the community. Choose Away or Do not disturb to say you’re busy, or Invisible to not show up as around at all.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader current="/how-it-works" />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <p className="font-mono text-xs text-mark">How it works</p>
          <h1 className="max-w-3xl text-4xl leading-[1.02] font-semibold tracking-tight text-balance md:text-6xl">
            Sign in, say hi, lock in.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Getting set up takes about a minute. Here&apos;s everything that happens between your first code and your
            first session with Chicago&apos;s builders.
          </p>
        </section>

        <div className="h-3 bg-flag md:h-4" aria-hidden />

        <section aria-label="Steps" className="mx-auto w-full max-w-5xl px-6 pt-14 md:pt-20">
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li key={step.label} className="grid grid-cols-[2.5rem_1fr] gap-x-4 md:grid-cols-[3rem_1fr_1.15fr] md:gap-x-10">
                <div className="row-span-2 flex flex-col items-center md:row-span-1" aria-hidden>
                  <StepStar />
                  <span className="mt-3 w-px flex-1 bg-flag/50" />
                </div>
                <div className="flex flex-col gap-3 pt-1 pb-8 md:pb-24">
                  <p className="font-mono text-xs text-muted-foreground">
                    <span className="text-foreground">{String(i + 1).padStart(2, '0')}</span> · {step.label}
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{step.title}</h2>
                  <p className="max-w-md leading-relaxed text-muted-foreground text-pretty">{step.body}</p>
                </div>
                <div className="col-start-2 pb-14 md:col-start-3 md:pb-24">{step.scene}</div>
              </li>
            ))}

            <li className="grid grid-cols-[2.5rem_1fr] gap-x-4 md:grid-cols-[3rem_1fr_1.15fr] md:gap-x-10">
              <div className="flex flex-col items-center text-flag" aria-hidden>
                <StepStar outline />
              </div>
              <div className="flex flex-col gap-3 pt-1 pb-20 md:col-span-2 md:pb-28">
                <p className="font-mono text-xs text-flag">The fifth star</p>
                <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">Then build something.</h2>
                <p className="max-w-xl leading-relaxed text-muted-foreground text-pretty">
                  Share what you&apos;re launching in #lobby, find credits, funding, hackathons and events in Opportunities, and
                  tell us what Cabal should do next on the Build Cabal board. The flag has room for one more star.
                </p>
                <div className="flex flex-wrap gap-3 pt-3">
                  <a
                    href="/#download"
                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ArrowDownToLine className="size-4" aria-hidden />
                    Get the desktop app
                  </a>
                  <Link
                    href="/login"
                    className="inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open in browser
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="facts-title" className="border-t">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-16 md:flex-row md:gap-16 md:py-20">
            <h2 id="facts-title" className="text-2xl font-semibold tracking-tight md:w-56 md:shrink-0">
              Good to know
            </h2>
            <dl className="grid flex-1 gap-x-12 gap-y-8 md:grid-cols-2">
              {FACTS.map((f) => (
                <div key={f.q} className="flex flex-col gap-2">
                  <dt className="font-medium">{f.q}</dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
