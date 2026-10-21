import { ArrowDown, ChevronRight } from 'lucide-react'
import type { Source } from '@/lib/docs'
import { Receipts } from './receipts'

export function SystemMap() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-stretch">
        <Node
          title="Your computer"
          body="The desktop app or a browser tab."
          className="md:w-48 md:flex-none md:self-center"
        />
        <div className="grid grid-cols-2 gap-3 md:flex md:flex-1 md:flex-col">
          <div className="flex flex-col md:flex-row md:items-center">
            <Wire label="pages" />
            <Node
              title="cabal.city, on Vercel"
              body="Sends the pages and runs a few small jobs, like emailing your sign-in code."
              sources={[{ path: 'app/api/' }]}
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center">
            <Wire label="your data, live" />
            <Node
              title="Supabase"
              body="The database, sign-in, live updates and photos, guarded by the database’s own rules."
              sources={[{ path: 'supabase/migrations/' }]}
            />
          </div>
        </div>
      </div>
      <figcaption className="text-sm leading-relaxed text-muted-foreground text-pretty">
        Your app talks to the database directly. That&apos;s safe because the database checks every request against
        who you are, not against what the app claims. Resend delivers the sign-in emails and GitHub hosts the desktop
        downloads.
      </figcaption>
    </figure>
  )
}

function Node({
  title,
  body,
  sources,
  className = '',
}: {
  title: string
  body: string
  sources?: Source[]
  className?: string
}) {
  return (
    <div className={`flex flex-1 flex-col gap-1.5 rounded-lg border bg-card p-4 ${className}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{body}</p>
      <Receipts sources={sources} className="pt-1" />
    </div>
  )
}

function Wire({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2 text-muted-foreground md:w-32 md:shrink-0 md:items-stretch md:px-2 md:py-0">
      <span className="text-center font-mono text-xs">{label}</span>
      <ArrowDown className="size-4 md:hidden" aria-hidden />
      <span className="hidden items-center md:flex" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <ChevronRight className="-ml-2 size-4" />
      </span>
    </div>
  )
}
