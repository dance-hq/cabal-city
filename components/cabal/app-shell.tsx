'use client'

import { useEffect } from 'react'
import { SWRConfig } from 'swr'
import { CabalProvider, useCabal, type Boot } from './store'
import { BuddyList } from './buddy-list'
import { Conversation } from './conversation'
import { ProfileDialog } from './profile-dialog'
import { SettingsDialog } from './settings-dialog'
import { useMedia } from '@/hooks/use-media'
import { CabalMark } from '@/components/brand/logo'

export function AppShell({ boot }: { boot: Boot }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 1500, errorRetryInterval: 4000 }}>
      <CabalProvider boot={boot}>
        <Layout />
        <ProfileDialog />
        <SettingsDialog />
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
        {active ? <Conversation compact /> : <BuddyList />}
      </div>
    )
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r bg-sidebar" aria-label="People and rooms">
        <BuddyList />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{active ? <Conversation /> : <NothingOpen />}</main>
    </div>
  )
}

function NothingOpen() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="app-drag h-11 shrink-0 border-b" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <CabalMark className="size-8 opacity-80" />
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground text-pretty">
          Pick a name to start a conversation, or drop into a room. Or just leave Cabal open and get back to work.
        </p>
      </div>
    </div>
  )
}
