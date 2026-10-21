import type { Metadata } from 'next'
import { AppShell } from '@/components/cabal/app-shell'
import { loadBoot } from '@/lib/boot'

export const metadata: Metadata = { title: { absolute: 'Cabal' } }

export default async function AppPage() {
  return <AppShell boot={await loadBoot()} />
}
