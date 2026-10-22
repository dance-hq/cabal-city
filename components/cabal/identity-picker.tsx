'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IDENTITIES, orderedIdentities, type Identity } from '@/lib/identity'

// Pick any that fit, or none. Nothing in Cabal requires a role.
export function IdentityPicker({
  value,
  onChange,
  legend = 'Role',
}: {
  value: Identity[]
  onChange: (value: Identity[]) => void
  legend?: string
}) {
  function toggle(role: Identity, on: boolean) {
    onChange(orderedIdentities(on ? [...value, role] : value.filter((v) => v !== role)))
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby="identity-hint">
      <legend className="mb-2 text-sm leading-none font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-2">
        {IDENTITIES.map((o) => {
          const on = value.includes(o.value)
          return (
            <label
              key={o.value}
              className={cn(
                'relative flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2.5 transition-colors hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                on && 'border-flag bg-flag/10 hover:bg-flag/15',
              )}
            >
              <input
                type="checkbox"
                name="identities"
                value={o.value}
                checked={on}
                onChange={(e) => toggle(o.value, e.target.checked)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {o.label}
                <Check className={cn('size-3.5 shrink-0 text-flag', !on && 'invisible')} aria-hidden />
              </span>
              <span className="text-xs leading-snug text-muted-foreground">{o.hint}</span>
            </label>
          )
        })}
      </div>
      <p id="identity-hint" className="text-xs text-muted-foreground">
        Pick any that fit, or none.
      </p>
    </fieldset>
  )
}
