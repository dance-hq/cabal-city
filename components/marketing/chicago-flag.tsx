import { ChicagoStar } from './star'

const STARS = [
  { year: '1803', label: 'Fort Dearborn' },
  { year: '1871', label: 'The Great Fire' },
  { year: '1893', label: "The World's Fair" },
  { year: '1933', label: 'A Century of Progress' },
]

// The city flag's four stars between its two blue stripes, with an open
// spot for a fifth.
export function ChicagoFlag() {
  return (
    <section aria-labelledby="city-title" className="flex flex-col gap-6">
      <h2 id="city-title" className="max-w-xl text-2xl font-semibold tracking-tight text-balance md:text-3xl">
        Chicago has always been a city of builders.
      </h2>
      <figure className="flex flex-col" aria-label="The four stars of the Chicago city flag, and an open fifth">
        <div className="h-1.5 rounded-full bg-flag" aria-hidden />
        <ol className="grid grid-cols-5 gap-2 py-6 md:gap-6 md:py-8">
          {STARS.map((s, i) => (
            <li key={s.year} className="flex flex-col items-center gap-3 text-center">
              <span className="star-in" style={{ '--i': i } as React.CSSProperties}>
                <ChicagoStar className="size-10 md:size-14" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-xs font-medium">{s.year}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{s.label}</span>
              </span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-3 text-center">
            <span className="star-in text-flag" style={{ '--i': 4 } as React.CSSProperties}>
              <ChicagoStar outline className="size-10 md:size-14" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-mono text-xs font-medium text-flag">20__</span>
              <span className="hidden text-xs text-foreground text-balance sm:block">What we build next is up to us.</span>
            </span>
          </li>
        </ol>
        <div className="h-1.5 rounded-full bg-flag" aria-hidden />
      </figure>
      <p className="text-sm text-foreground sm:hidden">What we build next is up to us.</p>
    </section>
  )
}
