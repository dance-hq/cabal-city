'use client'

import { useEffect } from 'react'
import { SWRConfig } from 'swr'
import { CabalProvider, useCabal, type Boot } from './store'
import { BuddyList } from './buddy-list'
import { Conversation } from './conversation'
import { ProfileDialog } from './profile-dialog'
import { SettingsDialog } from './settings-dialog'
import { UpdateBar } from './update-bar'
import { WorkSessionProvider } from './work-session'
import { Home } from './home'
import { DesktopBuddies } from './desktop-buddies'
import { useMedia } from '@/hooks/use-media'

export function AppShell({ boot }: { boot: Boot }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 1500, errorRetryInterval: 4000 }}>
      <CabalProvider boot={boot}>
        <WorkSessionProvider>
          <Layout />
          <ProfileDialog />
          <SettingsDialog />
          <DesktopBuddies />
        </WorkSessionProvider>
      </CabalProvider>
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
        {active ? <Conversation compact /> : <BuddyList />}
      </div>
    )
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <UpdateBar />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar" aria-label="People and channels">
          <BuddyList />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">{active ? <Conversation /> : <Home />}</main>
      </div>
    </div>
  )
}
