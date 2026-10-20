import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Avatar } from '@/components/cabal/avatar'

// Photos load straight into every viewer's browser, so only this deployment's own avatar storage may
// serve them. The database accepts any *.supabase.co project.

const OWN = 'https://ownproject.supabase.co'
const UID = '0b5c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e'
const render = (url: string | null) => renderToStaticMarkup(createElement(Avatar, { name: 'Pat Lee', url }))

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', OWN))
afterEach(() => vi.unstubAllEnvs())

describe('Avatar', () => {
  it("shows a photo from this deployment's own storage", () => {
    const url = `${OWN}/storage/v1/object/public/avatars/${UID}/avatar-1.png`
    expect(render(url)).toContain(`src="${url}"`)
  })

  it('shows a picture just picked on this device, before it uploads', () => {
    expect(render('blob:https://www.cabal.city/5e1d2c3b')).toContain('<img')
  })

  it('shows initials instead of a photo hosted on another Supabase project', () => {
    const html = render(`https://someoneelse.supabase.co/storage/v1/object/public/avatars/${UID}/pixel.png`)
    expect(html).not.toContain('<img')
    expect(html).toContain('PL')
  })

  it('shows initials for a look-alike address', () => {
    expect(render(`${OWN}.attacker.example/storage/v1/object/public/avatars/${UID}/a.png`)).not.toContain('<img')
    expect(render(`${OWN}/storage/v1/object/public/avatarsx/${UID}/a.png`)).not.toContain('<img')
  })

  it('shows initials when the deployment has no Supabase address', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    expect(render(`${OWN}/storage/v1/object/public/avatars/${UID}/avatar-1.png`)).not.toContain('<img')
  })
})
