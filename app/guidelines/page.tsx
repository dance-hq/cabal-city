import type { Metadata } from 'next'
import { LegalPage, LegalSection, contactEmail } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Community guidelines',
  description: "How we treat each other in Cabal's Chicago community.",
}

export default function GuidelinesPage() {
  const email = contactEmail()
  return (
    <LegalPage
      current="/guidelines"
      title="Community guidelines"
      summary="Cabal works because it feels like a room full of neighbors. Act like you'd want to run into these people at the next meetup, because you will."
    >
      <LegalSection title="Be a good neighbor">
        <ul>
          <li>Be kind and assume good intent. Disagree with ideas, not people.</li>
          <li>Help people out. Answer the question you know the answer to.</li>
          <li>Keep channels on topic. Take long back-and-forths to a DM or a team.</li>
          <li>Respect &ldquo;away&rdquo; and &ldquo;do not disturb&rdquo;. People will get back to you.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Not okay here">
        <ul>
          <li>Harassment, threats, or hate based on who someone is.</li>
          <li>Sexual content, or anything involving minors.</li>
          <li>Spam, cold sales pitches in DMs, and drop-and-run self-promotion. Sharing what you built is great; be part of the conversation.</li>
          <li>Sharing someone&apos;s private messages, contact details or personal information without their permission.</li>
          <li>Scams, fake opportunities, and recruiting for anything illegal.</li>
          <li>Pretending to be someone else.</li>
        </ul>
      </LegalSection>

      <LegalSection title="If something's wrong">
        <p>
          <strong>Block</strong> someone from their profile and they can no longer message you.{' '}
          <strong>Report</strong> a message from its menu, and the community admins will see it along with your note.
          Reports are private: the person you report isn&apos;t told who filed it.
        </p>
        {email && (
          <p>
            For anything urgent, or a problem with an admin, email <a href={`mailto:${email}`}>{email}</a>.
          </p>
        )}
      </LegalSection>

      <LegalSection title="What admins can do">
        <p>
          Admins can delete messages in community channels that break these guidelines and remove people from the
          community. They can&apos;t read your DMs or invite-only team rooms, so report anything there that needs attention. We start with a
          friendly word where we can, and act right away for threats, harassment, spam or anything illegal. If you
          think we got it wrong, email us and a different person will take a look.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
