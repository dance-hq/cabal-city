import type { Journey } from '@/lib/how-it-works'
import { Receipts } from './receipts'

export function Journeys({ journeys }: { journeys: Journey[] }) {
  return (
    <div className="flex flex-col gap-10">
      {journeys.map((journey) => (
        <div key={journey.id} className="flex flex-col gap-4">
          <h3 id={journey.id} className="scroll-mt-8 font-medium">
            {journey.title}
          </h3>
          <ol className="flex flex-col gap-4 border-l pl-5">
            {journey.steps.map((step, i) => (
              <li key={i} className="relative flex flex-col gap-2">
                <span
                  className="absolute top-0.5 -left-8 flex size-5 items-center justify-center rounded-full border bg-background font-mono text-[11px] text-muted-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-pretty">{step.text}</p>
                <Receipts sources={step.sources} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
