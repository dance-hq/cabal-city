'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function JoinButton({ code }: { code: string }) {
  const router = useRouter()
  return (
    <Button
      className="h-10"
      onClick={() => {
        if (code) sessionStorage.setItem('cabal:invite', code)
        router.push(code ? `/login?invite=${code}` : '/login')
      }}
    >
      Accept invite
    </Button>
  )
}
