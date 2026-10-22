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
      summary="Cabal only keeps what it needs to run a messenger: your account, your profile, your messages and the things you choose to share. Direct messages are end-to-end encrypted. No ads, no analytics, no selling data, no watching what you do on your computer."
    >
      <LegalSection title="What we store">
        <ul>
          <li>
            <strong>Your email address</strong>, to send you sign-in codes. It isn&apos;t shown to other people.
          </li>
          <li>
            <strong>Your profile</strong>: your name and @username, and the roles (founder, builder, investor),
            photo, company, what you&apos;re building, bio, up to four links and status line you choose to add.
            Other signed-in members can see these.
          </li>
          <li>
            <strong>Your messages</strong> in rooms, team rooms and direct messages, plus when each was sent and who
            you mentioned. Direct messages are stored end-to-end encrypted, so we hold them but can&apos;t read
            them. If you delete a message, its text is erased, its photos and videos can no longer be opened, and
            only a &ldquo;deleted&rdquo; marker remains.
          </li>
          <li>
            <strong>Photos and videos you attach</strong>, with their file name, type, size and dimensions. In
            direct messages they&apos;re encrypted on your device before they upload, along with their name and type,
            so we can&apos;t open them; we can still see how big they are.
          </li>
          <li>
            <strong>Your public encryption key</strong>, so people can send you encrypted direct messages, and a
            backup of your private keys that only your recovery key can open. Your private keys stay on your own
            devices. We never have them or your recovery key.
          </li>
          <li>
            <strong>How you use conversations</strong>: which ones you&apos;ve read up to where, which you&apos;ve
            muted, the teams you&apos;re in, your buddy groups and the people you&apos;ve blocked.
          </li>
          <li>
            <strong>Your status</strong> (online, away, do not disturb) and which room you have open, so your buddy
            list works. This is erased about 10 minutes after Cabal stops hearing from you. Invisible mode sends
            nothing.
          </li>
          <li>
            <strong>Lock-in sessions</strong>: when each one started, paused and ended, a check-in about once a
            minute while one runs, what you said you&apos;re focused on if you add it, and any note you add when you
            finish. We add these up into your hours for each week.
          </li>
          <li>
            <strong>Build Cabal</strong>: ideas you post on the board, your comments, which ideas you&apos;ve voted
            for, opportunities you save and opportunities you suggest.
          </li>
          <li>
            <strong>Your settings</strong>: notification and lock-in preferences on our server; theme and window
            preferences on your own device.
          </li>
          <li>
            <strong>Reports</strong> you file, including a short excerpt of the reported message and your reason. When
            you report a direct message, your app shares the key to that one message so its text can be checked;
            the rest of the conversation, and any photos or videos, stay encrypted.
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
          <li>
            No keyboard, mouse or screen activity. &ldquo;Away&rdquo; is something you choose, never something we
            detect. A lock-in timer pauses on its own only when Cabal is closed or your computer sleeps, and any one
            session counts for at most 8 hours.
          </li>
          <li>No contacts or location, and nothing from your computer apart from the files you choose to attach.</li>
          <li>
            Photos are redrawn on your device before they upload, which removes location and camera details. Videos
            are sent exactly as they are, so if a video might hold your location, remove it before you share.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who can see what">
        <ul>
          <li>Community channels: every signed-in member of the Chicago community.</li>
          <li>
            Public teams: anyone in the Chicago community who joins them, including earlier messages.
            Invite-only teams: only the people on that team.
          </li>
          <li>
            Direct messages, and the photos and videos in them: only the two people in the conversation.
            They&apos;re end-to-end encrypted, so the copies we store can&apos;t be read by community admins or by
            the team that runs cabal.city.
          </li>
          <li>
            Photos and videos in rooms and teams: the same people who can read that conversation. They&apos;re kept
            private and opened through links that expire after a short time.
          </li>
          <li>
            Lock-ins: while one runs, people in the community see that you&apos;re locked in, for how long and your
            focus if you added one, unless you&apos;re invisible or have turned off &ldquo;Show me in Locked in
            now&rdquo;. Your weekly hours appear on the board and your profile only if you turn on &ldquo;Show my
            hours on the weekly board&rdquo; (it starts off). Notes and your list of past sessions are only ever shown
            to you.
          </li>
          <li>
            The Build Cabal board: ideas, comments and who posted them are visible to members of every Cabal
            community on cabal.city. Vote totals are shown, but not who voted. Opportunities you save are only
            visible to you; ones you suggest go to community admins.
          </li>
          <li>
            Reports: the person who filed them and community admins. Admins can also remove members from the
            community.
          </li>
          <li>Feedback and bug reports: the person who sent them and community admins.</li>
        </ul>
        <p>
          Direct messages are end-to-end encrypted on your device; we can see who messaged whom and when, but not
          what was said. The app that does the encrypting, in your browser and in the desktop app, is loaded from
          cabal.city, so this relies on that code being the open-source code on GitHub, which anyone can check.
          Messages that were sent before encryption arrived stay as they were. Room and team
          messages, and their photos and videos, are encrypted in transit and stored on our servers, but they
          aren&apos;t end-to-end encrypted: the small team that operates cabal.city could technically access them,
          and only does so to keep the service running or when the law requires it. Profile photos are stored at
          public web addresses, so anyone with the exact link can open one.
        </p>
      </LegalSection>

      <LegalSection title="Services we rely on">
        <p>We never sell your information. We share it only with the companies that run parts of Cabal for us:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores the database, sign-in, profile photos and the photos and videos you
            share.
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
          That removes, right away, your email, profile, photo, encryption keys and backup, every message you wrote
          along with the photos and videos in them, your lock-in history, your ideas, comments and votes, your saved
          opportunities and your feedback. Teams you own pass to their longest-standing member. Messages other people
          sent you stay with them, and opportunities you suggested stay without your name.
        </p>
        <p>
          Reports other people filed about you are kept for moderation, without being linked to your account. Deleted
          data can remain in routine database backups until they roll over.
        </p>
        <p>
          Your encryption keys also live in your browser or the desktop app on each device. Clearing that
          site&apos;s data removes them from that device; if you lose every device and your recovery key, nobody,
          including us, can recover your encrypted messages.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul>
          <li>Change or remove anything on your profile at any time.</li>
          <li>Go invisible to stop sharing your status and lock-ins completely.</li>
          <li>
            Choose whether you appear in &ldquo;Locked in now&rdquo; and on the weekly board, in{' '}
            <strong>Settings → Community</strong>.
          </li>
          <li>Delete any message you sent, including its photos and videos.</li>
          <li>Block someone to stop them messaging you.</li>
          <li>
            Ask for a copy of your data, a correction or a deletion
            {email ? (
              <>
                {' '}
                by emailing <a href={`mailto:${email}`}>{email}</a>
              </>
            ) : null}
            . We&apos;ll reply within 30 days. We can&apos;t include the contents of encrypted direct messages,
            because we can&apos;t read them.
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
              Cabal is open source, so you can also <a href={githubUrl}>read the code</a> that handles your data, and
              the <Link href="/docs">developer docs</Link> link each claim to the file that makes it true.
            </>
          ) : null}{' '}
          See also our <Link href="/terms">terms</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
