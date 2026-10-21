'use client'

import { cn } from '@/lib/utils'
import { IDENTITIES, type Identity } from '@/lib/identity'

export function IdentityPicker({
  value,
  onChange,
  required,
  compact,
  legend = "I'm a",
}: {
  value: Identity | null
  onChange: (value: Identity) => void
  required?: boolean
  // One row of labels; the chosen role's hint shows underneath.
  compact?: boolean
  legend?: string
}) {
  const chosen = IDENTITIES.find((o) => o.value === value)
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">{legend}</legend>
      <div className={cn('grid grid-cols-3', compact ? 'gap-1.5' : 'gap-2')}>
        {IDENTITIES.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-md border transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              compact ? 'h-10 items-center justify-center px-2' : 'px-3 py-2.5',
              value === o.value && 'border-flag bg-flag/10 hover:bg-flag/15',
            )}
          >
            <input
              type="radio"
              name="identity"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              required={required}
              className="sr-only"
            />
            <span className="text-sm font-medium">{o.label}</span>
            {!compact && <span className="text-xs leading-snug text-muted-foreground">{o.hint}</span>}
          </label>
        ))}
      </div>
      {compact && (
        <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {chosen?.hint ?? ''}
        </p>
      )}
    </fieldset>
  )
}
