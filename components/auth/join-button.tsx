'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// `openAfter` is a channel to land on once you're in (a team invite link).
export function JoinButton({ code, openAfter }: { code: string; openAfter?: string }) {
  const router = useRouter()
  return (
    <Button
      className="h-10"
      onClick={() => {
        if (code) sessionStorage.setItem('cabal:invite', code)
        if (openAfter) sessionStorage.setItem('cabal:open', openAfter)
        router.push(code ? `/login?invite=${code}` : '/login')
      }}
    >
      Accept invite
    </Button>
  )
}
