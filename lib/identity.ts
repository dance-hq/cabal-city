export type Identity = 'founder' | 'builder' | 'investor'

export const IDENTITIES: { value: Identity; label: string; hint: string }[] = [
  { value: 'founder', label: 'Founder', hint: 'Starting or running a company' },
  { value: 'builder', label: 'Builder', hint: 'Shipping products and code' },
  { value: 'investor', label: 'Investor', hint: 'Backing founders' },
]

export const IDENTITY_LABEL: Record<Identity, string> = {
  founder: 'Founder',
  builder: 'Builder',
  investor: 'Investor',
}

// Roles in the order we always show them, without repeats or unknown values.
export function orderedIdentities(list: readonly string[] | null | undefined): Identity[] {
  const have = new Set(list ?? [])
  return IDENTITIES.map((i) => i.value).filter((v) => have.has(v))
}

// "Founder · Builder", or '' when someone hasn't picked any.
export function identityLabels(list: readonly string[] | null | undefined): string {
  return orderedIdentities(list)
    .map((i) => IDENTITY_LABEL[i])
    .join(' · ')
}
