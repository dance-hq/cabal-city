import type { Fact } from '@/lib/how-it-works'
import { Receipts } from './receipts'

export function DocSection({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-balance md:text-2xl">
          {title}
        </h2>
        {intro && <p className="leading-relaxed text-muted-foreground text-pretty">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="flex flex-col divide-y border-y">
      {facts.map((fact) => (
        <div key={fact.label} className="grid gap-1.5 py-4 md:grid-cols-[12rem_1fr] md:gap-6">
          <dt className="text-sm font-medium text-pretty">{fact.label}</dt>
          <dd className="flex flex-col gap-2">
            {fact.value && <p className="font-mono text-sm text-foreground">{fact.value}</p>}
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{fact.body}</p>
            <Receipts sources={fact.sources} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
