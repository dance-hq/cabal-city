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
