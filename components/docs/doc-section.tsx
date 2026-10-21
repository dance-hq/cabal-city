import type { Fact } from '@/lib/docs'
import { Receipts } from './receipts'
import { RichText } from './rich-text'

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
        <h2 id={`${id}-title`} className="group text-xl font-semibold tracking-tight text-balance md:text-2xl">
          <a href={`#${id}`} className="hover:underline hover:decoration-muted-foreground hover:underline-offset-4">
            {title}
          </a>
        </h2>
        {intro && (
          <p className="leading-relaxed text-muted-foreground text-pretty">
            {typeof intro === 'string' ? <RichText text={intro} /> : intro}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export function SubHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-8 pt-2 font-medium">
      {children}
    </h3>
  )
}

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="flex flex-col divide-y border-y">
      {facts.map((fact) => (
        <div key={fact.label} className="grid gap-1.5 py-4 md:grid-cols-[11rem_1fr] md:gap-6">
          <dt className="text-sm font-medium text-pretty">{fact.label}</dt>
          <dd className="flex min-w-0 flex-col gap-2">
            {fact.value && <p className="font-mono text-xs leading-relaxed break-words text-mark">{fact.value}</p>}
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              <RichText text={fact.body} />
            </p>
            <Receipts sources={fact.sources} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
