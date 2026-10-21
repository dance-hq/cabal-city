'use client'

import { useEffect } from 'react'
import { SWRConfig } from 'swr'
import { CabalProvider, VIEWS, useCabal, type Boot } from './store'
import { Opportunities } from './opportunities'
import { BuildCabal } from './build-cabal'
import { BuddyList } from './buddy-list'
import { Conversation } from './conversation'
import { ProfileDialog } from './profile-dialog'
import { SettingsDialog } from './settings-dialog'
import { UpdateBar } from './update-bar'
import { WorkSessionProvider } from './work-session'
import { Home } from './home'
import { DesktopBuddies } from './desktop-buddies'
import { PinPrompt } from './pin-prompt'
import { E2eeProvider } from './e2ee-provider'
import { E2eeBar } from './e2ee-bar'
import { UnlockDialog } from './e2ee-unlock'
import { RecoveryKeyDialog } from './e2ee-recovery'
import { ApproveDevices } from './e2ee-approve'
import { useMedia } from '@/hooks/use-media'

export function AppShell({ boot }: { boot: Boot }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 1500, errorRetryInterval: 4000 }}>
      <E2eeProvider userId={boot.userId}>
        <CabalProvider boot={boot}>
          <WorkSessionProvider>
            <Layout />
            <ProfileDialog />
            <SettingsDialog />
            <DesktopBuddies />
            <PinPrompt />
            <UnlockDialog />
            <RecoveryKeyDialog />
            <ApproveDevices />
          </WorkSessionProvider>
        </CabalProvider>
      </E2eeProvider>
    </SWRConfig>
  )
}

function Layout() {
  const { active, open } = useCabal()
  const compact = useMedia('(max-width: 719px)')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && compact && active && !document.querySelector('[role="dialog"]')) open(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact, active, open])

  if (compact) {
    return (
      <div className="flex h-svh flex-col overflow-hidden bg-sidebar">
        <UpdateBar />
        <E2eeBar />
        {active ? <MainPane active={active} compact /> : <BuddyList compact />}
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <UpdateBar />
      <E2eeBar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar" aria-label="People and channels">
          <BuddyList />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{active ? <MainPane active={active} /> : <Home />}</main>
      </div>
    </div>
  )
}

function MainPane({ active, compact }: { active: string; compact?: boolean }) {
  if (active === VIEWS.opportunities) return <Opportunities compact={compact} />
  if (active === VIEWS.build) return <BuildCabal compact={compact} />
  return <Conversation compact={compact} />
}
