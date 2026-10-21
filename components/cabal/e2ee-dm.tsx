'use client'

import useSWR from 'swr'
import { Lock, LockOpen, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { E2eeStatus, PeerState } from '@/lib/e2ee/session'
import { friendlyError } from '@/lib/errors'
import { useE2ee } from './e2ee-provider'

export function usePeerEncryption(peerId: string | null) {
  const { session, status } = useE2ee()
  return useSWR(
    peerId && status !== 'unsupported' ? ['e2ee-peer', peerId] : null,
    () => session.peerState(peerId!),
    // Picks up someone starting over with new keys.
    { refreshInterval: 60_000, revalidateOnFocus: true, focusThrottleInterval: 30_000 },
  )
}

/** Why the composer is off in this direct message, if it is. */
export function dmSendBlock(status: E2eeStatus, peer: PeerState | undefined, name: string): string | null {
  if (status === 'loading') return 'Getting encryption ready…'
  if (status === 'locked') return 'Unlock direct messages on this device to send'
  if (status === 'unsupported') return 'This browser can’t send encrypted messages'
  if (status === 'error') return 'Can’t check your encryption keys right now'
  if (peer && !peer.key) return `${name} needs to open Cabal before you can message them`
  return null
}

export function EncryptionBadge({ peer, onClick }: { peer: PeerState | undefined; onClick: () => void }) {
  const verified = !!peer?.verified
  const label = verified ? 'Verified' : 'Encrypted'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={verified ? 'End-to-end encrypted and verified. See security code' : 'End-to-end encrypted. Check security code'}
      title={verified ? 'End-to-end encrypted, and you checked the code' : 'End-to-end encrypted. Click to check the security code'}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-1.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        verified && 'text-mark hover:text-mark',
      )}
    >
      {verified ? <ShieldCheck className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// The one thing worth knowing about this conversation's encryption right now, above the composer.
export function DmEncryptionNotice({
  peerId,
  name,
  peer,
  onVerify,
  onAcknowledged,
}: {
  peerId: string
  name: string
  peer: PeerState | undefined
  onVerify: () => void
  onAcknowledged: () => void
}) {
  const { status, setUnlockOpen, session } = useE2ee()

  let icon = <Lock className="size-3.5" aria-hidden />
  let text: string
  let actions: React.ReactNode = null

  if (status === 'locked') {
    text = 'Direct messages are locked on this device.'
    actions = <Action onClick={() => setUnlockOpen(true)} primary>Unlock</Action>
  } else if (status === 'unsupported') {
    icon = <LockOpen className="size-3.5" aria-hidden />
    text = 'This browser can’t do the encryption direct messages need. Use the Cabal desktop app or an up-to-date browser.'
  } else if (status === 'error') {
    text = 'Couldn’t reach Cabal to check your encryption keys. Trying again when you’re back online.'
  } else if (status === 'ready' && peer && !peer.key) {
    text = `${name} hasn’t opened Cabal since direct messages became end-to-end encrypted. You can message them once they do.`
  } else if (status === 'ready' && peer?.key && peer.changed) {
    icon = <ShieldAlert className="size-3.5 text-flag" aria-hidden />
    text = `${name}’s security code changed. That’s normal if they set up again with new keys. To be sure nobody’s listening in, compare codes.`
    const keyId = peer.key.id
    actions = (
      <>
        <Action onClick={onVerify}>Compare</Action>
        <Action
          primary
          onClick={async () => {
            try {
              await session.acknowledgePeer(peerId, keyId)
              onAcknowledged()
            } catch (err) {
              toast.error(friendlyError(err))
            }
          }}
        >
          OK
        </Action>
      </>
    )
  } else {
    return null
  }

  return (
    <div
      role="status"
      className="mx-4 mb-2 flex items-center gap-3 rounded-md border bg-sidebar-accent/60 py-1.5 pr-1.5 pl-3 text-[13px] leading-snug text-sidebar-accent-foreground"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <p className="min-w-0 flex-1 text-pretty">{text}</p>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}

function Action({ onClick, primary, children }: { onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'text-foreground hover:bg-background',
      )}
    >
      {children}
    </button>
  )
}
