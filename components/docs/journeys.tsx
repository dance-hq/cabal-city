import type { Journey } from '@/lib/docs'
import { Receipts } from './receipts'
import { RichText } from './rich-text'

export function Journeys({ journeys }: { journeys: Journey[] }) {
  return (
    <div className="flex flex-col gap-10">
      {journeys.map((journey) => (
        <div key={journey.id} className="flex flex-col gap-4">
          <h3 id={journey.id} className="scroll-mt-8 font-medium">
            {journey.title}
          </h3>
          <ol className="flex flex-col gap-4">
            {journey.steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs text-muted-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-2 pt-0.5">
                  <p className="text-sm leading-relaxed text-pretty">
                    <RichText text={step.text} />
                  </p>
                  <Receipts sources={step.sources} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
