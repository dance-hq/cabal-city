import { ArrowDown, ChevronRight } from 'lucide-react'
import { MAP, type Source } from '@/lib/docs'
import { Receipts } from './receipts'

export function SystemMap() {
  return (
    <figure className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row md:items-stretch">
        <Node title={MAP.client.title} body={MAP.client.body} className="md:w-44 md:flex-none md:self-center" />
        <div className="grid grid-cols-1 gap-3 md:flex md:flex-1 md:flex-col">
          <div className="flex flex-col md:flex-row md:items-center">
            <Wire label={MAP.server.wire} />
            <Node title={MAP.server.title} body={MAP.server.body} sources={MAP.server.sources} />
          </div>
          <div className="flex flex-col md:flex-row md:items-center">
            <Wire label={MAP.database.wire} />
            <Node title={MAP.database.title} body={MAP.database.body} sources={MAP.database.sources} />
          </div>
        </div>
      </div>
      <figcaption className="text-sm leading-relaxed text-muted-foreground text-pretty">{MAP.caption}</figcaption>
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
    <div className="flex flex-col items-center gap-1 py-2 text-muted-foreground md:w-36 md:shrink-0 md:items-stretch md:px-2 md:py-0">
      <span className="text-center font-mono text-xs">{label}</span>
      <ArrowDown className="size-4 md:hidden" aria-hidden />
      <span className="hidden items-center md:flex" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <ChevronRight className="-ml-2 size-4" />
      </span>
    </div>
  )
}
