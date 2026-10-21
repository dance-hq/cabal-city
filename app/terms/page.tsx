import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, contactEmail } from '@/components/marketing/legal-page'
import { githubUrl } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The ground rules for using Cabal at cabal.city.',
}

export default function TermsPage() {
  const email = contactEmail()
  return (
    <LegalPage
      current="/terms"
      title="Terms of use"
      summary="The short version: Cabal is free, you own what you write, be decent to people, and the service comes as is."
    >
      <LegalSection title="Who this is between">
        <p>
          These terms cover your use of Cabal at cabal.city and its desktop apps, run by the team behind Cabal
          (&ldquo;we&rdquo;). By signing in, you agree to them. If you run your own copy of the open-source software,
          these terms don&apos;t apply to it. Your copy is yours to run.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <ul>
          <li>You need to be at least 16 and use an email address you control.</li>
          <li>One person per account. Don&apos;t impersonate anyone or pick a username meant to mislead.</li>
          <li>You&apos;re responsible for what happens on your account, so keep your email secure.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What you post">
        <p>
          You own your messages and profile. You give us permission to store them and show them to the people you sent
          them to, only so Cabal can work. That permission ends when you delete them or your account.
        </p>
        <p>
          You must follow the <Link href="/guidelines">community guidelines</Link>. We may remove content or members
          that break them, and admins may remove people from the community.
        </p>
      </LegalSection>

      <LegalSection title="Things you can't do">
        <ul>
          <li>Break the law, or help someone else break it, using Cabal.</li>
          <li>Send spam, bulk unsolicited messages, malware or phishing links.</li>
          <li>Scrape the service, overload it, or try to get into accounts or data that aren&apos;t yours.</li>
          <li>Get around a block, a ban or a rate limit.</li>
        </ul>
        <p>
          Found a security problem?{' '}
          {email ? (
            <>
              Email <a href={`mailto:${email}`}>{email}</a> before telling anyone else, and we&apos;ll work with you on it.
            </>
          ) : (
            'Tell us privately before telling anyone else, and we will work with you on it.'
          )}
        </p>
      </LegalSection>

      <LegalSection title="The software">
        <p>
          Cabal&apos;s code is released under the MIT license
          {githubUrl ? (
            <>
              {' '}
              and available <a href={githubUrl}>on GitHub</a>
            </>
          ) : null}
          . The desktop installers are early releases and aren&apos;t code-signed yet, so your computer will ask you to
          confirm before opening them.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          Cabal is free, and it&apos;s provided as is. We work to keep it running and your messages safe, but we
          can&apos;t promise it will always be available, that messages will never be lost, or that it will suit any
          particular purpose. Don&apos;t use it as your only copy of anything important.
        </p>
        <p>
          To the extent the law allows, we aren&apos;t liable for indirect or consequential losses arising from your
          use of Cabal, and our total liability is limited to $100.
        </p>
      </LegalSection>

      <LegalSection title="Ending things">
        <p>
          You can stop using Cabal and delete your account any time from Settings. We can suspend or close accounts
          that break these terms, and we may shut the service down with at least 30 days&apos; notice in the
          community, so you have time to save anything you need.
        </p>
      </LegalSection>

      <LegalSection title="Changes and law">
        <p>
          If we change these terms, we&apos;ll update this page and announce it in the community before the changes
          take effect. These terms are governed by the laws of the State of Illinois.
          {email ? (
            <>
              {' '}
              Questions go to <a href={`mailto:${email}`}>{email}</a>.
            </>
          ) : null}
        </p>
      </LegalSection>
    </LegalPage>
  )
}
