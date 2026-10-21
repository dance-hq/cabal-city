import type { Metadata } from 'next'
import Link from 'next/link'
import { DocSection, FactList } from '@/components/docs/doc-section'
import { Journeys } from '@/components/docs/journeys'
import { Receipts } from '@/components/docs/receipts'
import { SystemMap } from '@/components/docs/system-map'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { githubUrl } from '@/lib/config'
import {
  BUILT_ON,
  FRESHNESS,
  GOOD_TO_KNOW,
  JOURNEYS,
  REVIEWED_ON,
  RUN_YOUR_OWN,
  SECTIONS,
  WHO_SEES_WHAT,
  WHO_SEES_WHAT_PROOF,
  codeUrl,
  reportUrl,
} from '@/lib/docs'

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How Cabal is built, what happens when you use it and who can see what, with a link to the code behind every claim.',
  alternates: { canonical: '/docs' },
}

const title = (id: (typeof SECTIONS)[number]['id']) => SECTIONS.find((s) => s.id === id)!.title

const link = 'text-foreground underline underline-offset-4 hover:decoration-foreground'

export default function DocsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader current="/docs" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pt-10 pb-20 md:flex-row md:gap-16 md:pt-14">
        <nav aria-label="On this page" className="hidden md:block md:w-44 md:shrink-0">
          <ul className="flex flex-col gap-2 text-sm md:sticky md:top-8">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="flex max-w-3xl min-w-0 flex-1 flex-col gap-16">
          <header className="flex flex-col gap-3">
            <p className="font-mono text-xs tracking-[0.2em] text-mark">DOCS</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">Under the hood</h1>
            <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
              What Cabal is built on, what happens when you use it, and who can see what, in plain words. Every claim
              links to the code that makes it true.
            </p>
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">
              {githubUrl ? 'Code links open the latest code on GitHub' : 'File paths refer to the Cabal source code'}
              {' · '}Reviewed {REVIEWED_ON}
            </p>
          </header>

          <DocSection
            id="short-version"
            title={title('short-version')}
            intro="Cabal is a website and a desktop app that share one database. The rules about who can read what are built into that database, so the app itself can’t get around them."
          >
            <SystemMap />
          </DocSection>

          <DocSection id="built-on" title={title('built-on')}>
            <FactList facts={BUILT_ON} />
          </DocSection>

          <DocSection id="step-by-step" title={title('step-by-step')}>
            <Journeys journeys={JOURNEYS} />
          </DocSection>

          <DocSection
            id="who-sees-what"
            title={title('who-sees-what')}
            intro={
              <>
                The short list. The full details are on the{' '}
                <Link href="/privacy" className={link}>
                  privacy page
                </Link>
                .
              </>
            }
          >
            <FactList facts={WHO_SEES_WHAT} />
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                <strong className="font-medium text-foreground">How we know.</strong> A test signs in as different
                people against a real database and tries to read and post where they shouldn&apos;t. It fails if any
                of them can.
              </p>
              <Receipts sources={WHO_SEES_WHAT_PROOF} />
            </div>
          </DocSection>

          <DocSection
            id="how-fresh"
            title={title('how-fresh')}
            intro="Some things are pushed to you the moment they happen. Others are checked on a timer. Here’s which is which."
          >
            <FactList facts={FRESHNESS} />
          </DocSection>

          <DocSection id="good-to-know" title={title('good-to-know')}>
            <FactList facts={GOOD_TO_KNOW} />
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              <strong className="font-medium text-foreground">Found a security problem?</strong> Please{' '}
              {reportUrl ? (
                <a href={reportUrl} className={link}>
                  report it privately
                </a>
              ) : (
                'report it privately'
              )}{' '}
              instead of posting it publicly, and test against your own copy of Cabal, never against cabal.city.
            </p>
          </DocSection>

          <DocSection
            id="run-your-own"
            title={title('run-your-own')}
            intro="Cabal is open source under the MIT license. Running your own takes one Supabase project, a Resend account for email and somewhere to host the site. Your community’s name and rooms are settings, not code."
          >
            <ul className="flex flex-col divide-y border-y">
              {RUN_YOUR_OWN.map((item) => {
                const href = codeUrl(item.path)
                return (
                  <li key={item.path} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                    {href ? (
                      <a href={href} className="text-sm font-medium underline-offset-4 hover:underline">
                        {item.label}
                      </a>
                    ) : (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{item.path}</span>
                  </li>
                )
              })}
            </ul>
          </DocSection>

          <p className="border-t pt-6 text-sm leading-relaxed text-muted-foreground text-pretty">
            See something here that isn&apos;t true?{' '}
            {githubUrl ? (
              <>
                <a href={`${githubUrl}/issues/new`} className={link}>
                  Open an issue on GitHub
                </a>{' '}
                or send feedback from inside Cabal.
              </>
            ) : (
              'Send feedback from inside Cabal.'
            )}{' '}
            When the code changes, a test fails until this page is updated to match.
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
