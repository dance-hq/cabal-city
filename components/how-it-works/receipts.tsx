import { FileCode2, Folder } from 'lucide-react'
import { codeUrl, type Source } from '@/lib/how-it-works'

// The file paths under each claim, linked to that file at the running version.
export function Receipts({ sources, className = '' }: { sources?: Source[]; className?: string }) {
  const paths = [...new Set((sources ?? []).map((s) => s.path))]
  if (paths.length === 0) return null

  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 ${className}`}>
      {paths.map((path) => {
        const href = codeUrl(path)
        const Icon = path.endsWith('/') ? Folder : FileCode2
        const body = (
          <>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className="break-all">{path}</span>
          </>
        )
        return (
          <li key={path}>
            {href ? (
              <a
                href={href}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-mark underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
                <span className="sr-only"> (opens the code on GitHub)</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
