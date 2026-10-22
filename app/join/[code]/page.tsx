import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { JoinButton } from '@/components/auth/join-button'
import { getCommunity } from '@/lib/community'

export const metadata: Metadata = { title: 'You’re invited' }

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ c?: string }>
}) {
  const [{ code }, { c }] = await Promise.all([params, searchParams])
  const community = await getCommunity()
  const safeCode = /^[a-f0-9]{16,64}$/.test(code) ? code : ''
  const team = c && /^[0-9a-f-]{36}$/i.test(c) ? c : undefined

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-xs text-muted-foreground">You&apos;re invited to</p>
          <h1 className="text-2xl font-semibold text-balance">{community?.name ?? 'Cabal'}</h1>
          {community?.description && <p className="text-sm leading-relaxed text-muted-foreground">{community.description}</p>}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cabal is a small instant messenger. See who&apos;s around, send a message, or drop into a channel.
          {team && ' Once you’re in, you’ll land on the team that invited you.'}
        </p>
        <JoinButton code={safeCode} openAfter={team} />
      </div>
    </AuthShell>
  )
}
