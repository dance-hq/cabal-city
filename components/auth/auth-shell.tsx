import Link from 'next/link'
import { CabalWordmark } from '@/components/brand/logo'

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="app-drag flex h-12 items-center px-5 pt-2">
        <Link href="/" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
          <CabalWordmark />
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  )
}
