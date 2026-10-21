import type { Metadata } from 'next'
import Link from 'next/link'
import { CodeBlock } from '@/components/docs/code-block'
import { DocSection, FactList, SubHeading } from '@/components/docs/doc-section'
import { FreshnessTable } from '@/components/docs/freshness-table'
import { Journeys } from '@/components/docs/journeys'
import { Receipts } from '@/components/docs/receipts'
import { RichText } from '@/components/docs/rich-text'
import { SystemMap } from '@/components/docs/system-map'
import { SiteFooter } from '@/components/marketing/site-footer'
import { SiteHeader } from '@/components/marketing/site-header'
import { githubUrl } from '@/lib/config'
import {
  DATA_MODEL,
  DEVICE_LINK,
  DEV_COMMANDS,
  ENCRYPTION_INTRO,
  ENCRYPTION_SCOPE,
  FRESHNESS,
  JOURNEYS,
  KEY_CARE,
  LAYOUT,
  OVERVIEW,
  PERMISSIONS,
  PERMISSIONS_INTRO,
  PERMISSIONS_PROOF,
  PRESENCE_NOTE,
  PRIMITIVES,
  REVIEWED_ON,
  RUN_YOUR_OWN,
  SECTIONS,
  SELF_HOST_INTRO,
  SETUP,
  SETUP_NOTES,
  STACK,
  TESTING,
  codeUrl,
  reportUrl,
  type SectionId,
} from '@/lib/docs'

export const metadata: Metadata = {
  title: 'Developer docs',
  description:
    'Cabal’s architecture, Postgres permission model, realtime design and end-to-end encryption protocol, with a link to the code behind every claim.',
  alternates: { canonical: '/docs' },
}

const title = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.title

const link = 'text-foreground underline underline-offset-4 hover:decoration-foreground'

export default function DocsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader current="/docs" />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 pt-10 pb-20 md:flex-row md:gap-16 md:pt-14">
        <nav aria-label="On this page" className="hidden md:block md:w-44 md:shrink-0">
          <div className="flex flex-col gap-3 md:sticky md:top-8">
            <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">ON THIS PAGE</p>
            <ol className="flex flex-col gap-2 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="flex max-w-3xl min-w-0 flex-1 flex-col gap-16">
          <header className="flex flex-col gap-3">
            <p className="font-mono text-xs tracking-[0.2em] text-mark">DOCS</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">How Cabal works</h1>
            <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
              Architecture, permissions, realtime and the encryption protocol, for people who want to read, run or
              change the code. Every claim links to the file that makes it true.
            </p>
            <p className="font-mono text-xs leading-relaxed text-muted-foreground">
              {githubUrl ? 'Links open main on GitHub' : 'Paths refer to the Cabal source'}
              {' · '}Checked against the code by <span className="text-foreground">tests/unit/docs.test.ts</span>
              {' · '}Reviewed {REVIEWED_ON}
            </p>
          </header>

          <DocSection id="overview" title={title('overview')} intro={OVERVIEW}>
            <SystemMap />
            <FactList facts={STACK} />
          </DocSection>

          <DocSection id="quickstart" title={title('quickstart')} intro="Node 24 and pnpm, plus a Supabase project.">
            <CodeBlock label="setup" commands={SETUP} />
            <CodeBlock label="while developing" commands={DEV_COMMANDS} />
            <FactList facts={SETUP_NOTES} />
          </DocSection>

          <DocSection id="layout" title={title('layout')}>
            <ul className="flex flex-col divide-y border-y">
              {LAYOUT.map((item) => {
                const href = codeUrl(item.path)
                return (
                  <li key={item.path} className="grid gap-1 py-3 md:grid-cols-[11rem_1fr] md:gap-6">
                    {href ? (
                      <a href={href} className="font-mono text-sm text-mark underline-offset-4 hover:underline">
                        {item.path}
                      </a>
                    ) : (
                      <span className="font-mono text-sm">{item.path}</span>
                    )}
                    <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                      <RichText text={item.body} />
                    </p>
                  </li>
                )
              })}
            </ul>
          </DocSection>

          <DocSection id="permissions" title={title('permissions')} intro={PERMISSIONS_INTRO}>
            <FactList facts={PERMISSIONS} />
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                <strong className="font-medium text-foreground">Tested against a real database.</strong> The
                integration suite signs in as several throwaway users and tries every read and write above that each
                shouldn&apos;t be allowed. The full user-facing version is on the{' '}
                <Link href="/privacy" className={link}>
                  privacy page
                </Link>
                .
              </p>
              <Receipts sources={PERMISSIONS_PROOF} />
            </div>
          </DocSection>

          <DocSection
            id="data-model"
            title={title('data-model')}
            intro="All in the `public` schema. Grouped by what they’re for; the migrations are the source of truth."
          >
            <FactList facts={DATA_MODEL} />
          </DocSection>

          <DocSection
            id="realtime"
            title={title('realtime')}
            intro="Rows that change often and matter right away are pushed. Everything else is polled with SWR."
          >
            <FreshnessTable rows={FRESHNESS} />
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              <RichText text={PRESENCE_NOTE} />
            </p>
          </DocSection>

          <DocSection id="flows" title={title('flows')}>
            <Journeys journeys={JOURNEYS} />
          </DocSection>

          <DocSection id="encryption" title={title('encryption')} intro={ENCRYPTION_INTRO}>
            <SubHeading id="primitives">Primitives</SubHeading>
            <FactList facts={PRIMITIVES} />
            <Journeys journeys={[DEVICE_LINK]} />
            <SubHeading id="keys">Recovery, verification and reports</SubHeading>
            <FactList facts={KEY_CARE} />
            <SubHeading id="scope">What it doesn&apos;t cover</SubHeading>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-border">
              {ENCRYPTION_SCOPE.map((line) => (
                <li key={line} className="text-pretty">
                  {line}
                </li>
              ))}
            </ul>
          </DocSection>

          <DocSection id="testing" title={title('testing')}>
            <FactList facts={TESTING} />
          </DocSection>

          <DocSection id="contributing" title={title('contributing')} intro={SELF_HOST_INTRO}>
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
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              <strong className="font-medium text-foreground">Found a security problem?</strong>{' '}
              {reportUrl ? (
                <a href={reportUrl} className={link}>
                  Report it privately
                </a>
              ) : (
                'Report it privately'
              )}{' '}
              rather than in a public issue, and test against your own deployment, never against cabal.city.
            </p>
          </DocSection>

          <p className="border-t pt-6 text-sm leading-relaxed text-muted-foreground text-pretty">
            Spotted something here that isn&apos;t true?{' '}
            {githubUrl ? (
              <>
                <a href={`${githubUrl}/issues/new`} className={link}>
                  Open an issue
                </a>{' '}
                or send a pull request that fixes <span className="font-mono text-xs text-foreground">lib/docs.ts</span>
                .
              </>
            ) : (
              'Send feedback from inside Cabal.'
            )}
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
