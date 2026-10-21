import type { Freshness } from '@/lib/docs'
import { Receipts } from './receipts'
import { RichText } from './rich-text'

export function FreshnessTable({ rows }: { rows: Freshness[] }) {
  return (
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th scope="col" className="py-2.5 pr-4 font-medium">
              What
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              How it arrives
            </th>
            <th scope="col" className="py-2.5 text-right font-medium">
              Latency
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.what} className="align-top">
              <th scope="row" className="py-3 pr-4 font-medium text-pretty">
                {row.what}
              </th>
              <td className="py-3 pr-4">
                <div className="flex flex-col gap-1.5">
                  <span className="leading-relaxed text-muted-foreground text-pretty">
                    <RichText text={row.how} />
                  </span>
                  <Receipts sources={row.sources} />
                </div>
              </td>
              <td className="py-3 text-right font-mono text-xs whitespace-nowrap text-foreground">{row.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
