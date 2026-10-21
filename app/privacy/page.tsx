import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection, contactEmail } from '@/components/marketing/legal-page'
import { githubUrl } from '@/lib/config'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Cabal stores, who can see it, and how to delete it.',
}

export default function PrivacyPage() {
  const email = contactEmail()
  return (
    <LegalPage
      current="/privacy"
      title="What Cabal collects"
      summary="Cabal only keeps what it needs to run a messenger: your account, your profile, and your messages. No ads, no analytics, no selling data, no watching what you do on your computer."
    >
      <LegalSection title="What we store">
        <ul>
          <li>
            <strong>Your email address</strong>, to send you sign-in codes. It isn&apos;t shown to other people.
          </li>
          <li>
            <strong>Your profile</strong>: the username, display name, photo, company, bio and status line you choose
            to add. Other signed-in members can see these.
          </li>
          <li>
            <strong>Your messages</strong> in rooms, team rooms and direct messages, plus when each was sent. If you
            delete a message, its text is erased and only a &ldquo;deleted&rdquo; marker remains.
          </li>
          <li>
            <strong>How you use conversations</strong>: which ones you&apos;ve read up to where, which you&apos;ve
            muted, the teams you&apos;re in, and the people you&apos;ve blocked.
          </li>
          <li>
            <strong>Your status</strong> (online, away, do not disturb) and which room you have open, so your buddy
            list works. This is erased about 10 minutes after Cabal stops hearing from you. Invisible mode sends
            nothing.
          </li>
          <li>
            <strong>Lock-in sessions</strong>: when you lock in, plus when each session started, paused and ended.
            While one runs, people in the community see that you&apos;re locked in and for how long, unless you&apos;re
            invisible.
          </li>
          <li>
            <strong>Your settings</strong>: notification preferences on our server; theme and window preferences
            on your own device.
          </li>
          <li>
            <strong>Reports</strong> you file, including a short excerpt of the reported message and your reason.
          </li>
          <li>
            <strong>Feedback</strong> you send, and, if you leave &ldquo;Include app details&rdquo; on, the page you
            were on, the app version, your browser and window size. Admins get a copy by email so they can reply.
          </li>
          <li>
            <strong>Sign-in protection</strong>: a scrambled (hashed) form of your email and IP address each time a
            code is requested, used only to stop abuse and deleted after 24 hours.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="What we don't collect">
        <ul>
          <li>No analytics, advertising or tracking scripts, and no cookies apart from the one that keeps you signed in.</li>
          <li>No keyboard, mouse or screen activity. &ldquo;Away&rdquo; is something you choose, never something we detect.</li>
          <li>No contacts, location or files from your computer.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Who can see what">
        <ul>
          <li>Community channels: every signed-in member of the Chicago community.</li>
          <li>
            Public teams: anyone in the Chicago community who joins them, including earlier messages.
            Invite-only teams: only the people on that team.
          </li>
          <li>Direct messages: only the people in the conversation. Community admins can&apos;t read them.</li>
          <li>
            Reports: the person who filed them and community admins. Admins can also remove members from the
            community.
          </li>
          <li>Feedback: the person who sent it and community admins.</li>
        </ul>
        <p>
          Messages are encrypted in transit and stored on our database, but they aren&apos;t end-to-end encrypted.
          The small team that operates cabal.city could technically access the database, and only does so to keep
          the service running or when the law requires it. Profile photos are stored at public web addresses, so
          anyone with the exact link can open one.
        </p>
      </LegalSection>

      <LegalSection title="Services we rely on">
        <p>We never sell your information. We share it only with the companies that run parts of Cabal for us:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores the database, sign-in and profile photos.
          </li>
          <li>
            <strong>Vercel</strong> hosts the website and keeps short-lived request logs (such as IP address and
            pages requested) for security and debugging.
          </li>
          <li>
            <strong>Resend</strong> delivers sign-in emails and feedback copies to admins, so it sees your email
            address and any feedback you send.
          </li>
          <li>
            <strong>GitHub</strong> hosts the desktop app downloads. The desktop app checks GitHub for updates
            every few hours; that check doesn&apos;t include anything about your account.
          </li>
        </ul>
        <p>These providers may process data in the United States.</p>
      </LegalSection>

      <LegalSection title="Keeping and deleting your data">
        <p>
          We keep your account until you delete it. To delete it, open <strong>Settings → App → Delete account</strong>.
          That removes your email, profile, photo, feedback and every message you wrote, right away. Teams you own pass to their
          longest-standing member. Messages other people sent you stay with them.
        </p>
        <p>
          Reports other people filed about you are kept for moderation, without being linked to your account. Deleted
          data can remain in routine database backups until they roll over.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul>
          <li>Change or remove anything on your profile at any time.</li>
          <li>Go invisible to stop sharing your status completely.</li>
          <li>Block someone to stop them messaging you.</li>
          <li>
            Ask for a copy of your data, a correction or a deletion
            {email ? (
              <>
                {' '}
                by emailing <a href={`mailto:${email}`}>{email}</a>
              </>
            ) : null}
            . We&apos;ll reply within 30 days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Age">
        <p>Cabal isn&apos;t for anyone under 16. If you think a child has signed up, let us know and we&apos;ll remove the account.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change what we collect, we&apos;ll update this page and announce it in the community before it takes
          effect.
          {githubUrl ? (
            <>
              {' '}
              Cabal is open source, so you can also <a href={githubUrl}>read the code</a> that handles your data.
            </>
          ) : null}{' '}
          See also our <Link href="/terms">terms</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
