import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PopoutChat } from '@/components/cabal/popout-chat'
import { loadBoot } from '@/lib/boot'

export const metadata: Metadata = { title: { absolute: 'Cabal' }, robots: { index: false } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The desktop app's small chat window for one person. Who you can message is
// still decided by the server when the conversation opens.
export default async function ChatWindowPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  if (!UUID.test(userId)) notFound()
  const boot = await loadBoot()
  if (userId === boot.userId) notFound()
  return <PopoutChat boot={boot} otherId={userId} />
}
