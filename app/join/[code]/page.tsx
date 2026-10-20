import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { JoinButton } from '@/components/auth/join-button'
import { getCommunity } from '@/lib/community'

export const metadata: Metadata = { title: 'You’re invited' }

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const community = await getCommunity()
  const safeCode = /^[a-f0-9]{16,64}$/.test(code) ? code : ''

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs text-muted-foreground">You&apos;re invited to</p>
          <h1 className="text-2xl font-semibold text-balance">{community?.name ?? 'Cabal'}</h1>
          {community?.description && <p className="text-sm leading-relaxed text-muted-foreground">{community.description}</p>}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cabal is a small instant messenger. See who&apos;s around, send a message, or drop into a room.
        </p>
        <JoinButton code={safeCode} />
      </div>
    </AuthShell>
  )
}
