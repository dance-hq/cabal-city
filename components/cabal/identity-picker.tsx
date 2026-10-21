'use client'

import { cn } from '@/lib/utils'
import { IDENTITIES, type Identity } from '@/lib/identity'

export function IdentityPicker({
  value,
  onChange,
  required,
}: {
  value: Identity | null
  onChange: (value: Identity) => void
  required?: boolean
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">I&apos;m a</legend>
      <div className="grid grid-cols-3 gap-2">
        {IDENTITIES.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
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
            <span className="text-xs leading-snug text-muted-foreground">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
