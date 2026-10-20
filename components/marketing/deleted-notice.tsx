'use client'

import { useSearchParams } from 'next/navigation'

export function DeletedNotice() {
  const params = useSearchParams()
  if (params.get('account') !== 'deleted') return null
  return (
    <p role="status" className="mx-auto w-full max-w-5xl px-6 text-sm text-muted-foreground">
      Your account and messages have been deleted. Thanks for hanging out.
    </p>
  )
}
