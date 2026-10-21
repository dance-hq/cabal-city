'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { Command } from '@/lib/docs'

export function CodeBlock({ label, commands }: { label: string; commands: Command[] }) {
  const [copied, setCopied] = useState(false)
  const width = Math.max(0, ...commands.filter((c) => c.note).map((c) => c.run.length))

  async function copy() {
    try {
      await navigator.clipboard.writeText(commands.map((c) => c.run).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border bg-card">
      <figcaption className="flex items-center justify-between border-b py-1.5 pr-1.5 pl-4">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
          <span className="sr-only"> commands</span>
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
        <code>
          {commands.map((c) => (
            <span key={c.run} className="block whitespace-pre">
              <span className="text-muted-foreground select-none" aria-hidden>
                {'$ '}
              </span>
              <span className="text-foreground">{c.run}</span>
              {c.note && <span className="text-muted-foreground">{`${' '.repeat(width - c.run.length + 2)}# ${c.note}`}</span>}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  )
}
