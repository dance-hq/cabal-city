import { ChicagoStar } from './star'

const STARS = [
  { year: '1803', label: 'Fort Dearborn' },
  { year: '1871', label: 'The Great Fire' },
  { year: '1893', label: "The World's Fair" },
  { year: '1933', label: 'A Century of Progress' },
]

// The city flag, stretched edge to edge, with room left for a fifth star.
export function ChicagoFlag() {
  return (
    <figure className="flex w-full flex-col" aria-labelledby="flag-caption">
      <div className="h-5 bg-flag md:h-8" aria-hidden />
      <div className="mx-auto w-full max-w-5xl px-6 py-8 md:py-12">
        <ol className="grid grid-cols-5 gap-2 md:gap-6">
          {STARS.map((s, i) => (
            <li key={s.year} className="flex flex-col items-center gap-3 text-center">
              <span className="star-in" style={{ '--i': i } as React.CSSProperties}>
                <ChicagoStar className="size-12 md:size-20" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-xs font-medium">{s.year}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{s.label}</span>
              </span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-3 text-center">
            <span className="star-in text-flag" style={{ '--i': 4 } as React.CSSProperties}>
              <ChicagoStar outline className="size-12 md:size-20" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-mono text-xs font-medium text-flag">20__</span>
              <span className="hidden text-xs text-muted-foreground sm:block">What gets built here</span>
            </span>
          </li>
        </ol>
      </div>
      <div className="h-5 bg-flag md:h-8" aria-hidden />
      <figcaption id="flag-caption" className="mx-auto w-full max-w-5xl px-6 pt-3 font-mono text-xs text-muted-foreground">
        Four stars on the city flag. Chicago has been arguing about a fifth for decades.
      </figcaption>
    </figure>
  )
}
