import { describe, expect, it, vi } from 'vitest'
import { decodeEntities, firstPreviewableLink, parsePreview } from '@/lib/link-preview'
import { allowedUrl, isPublicAddress } from '@/lib/safe-fetch'

vi.mock('server-only', () => ({}))

describe('firstPreviewableLink', () => {
  it('picks the first ordinary link', () => {
    expect(firstPreviewableLink('shipped https://example.com/launch, and https://two.dev')).toBe(
      'https://example.com/launch',
    )
  })

  it('skips links into the app itself', () => {
    const origins = ['https://cabal.city']
    expect(firstPreviewableLink('see https://cabal.city/docs then https://x.com/a', origins)).toBe('https://x.com/a')
    expect(firstPreviewableLink('no links here')).toBeNull()
  })
})

describe('parsePreview', () => {
  const page = `<html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Tiny Launch &amp; Co" />
    <meta name="description" content="Plain description">
    <meta property='og:description' content='Ship it &#8212; together'>
    <meta property="og:image" content="/card.png">
    <meta property="og:site_name" content="Tiny">
  </head></html>`

  it('reads Open Graph tags and resolves the image', () => {
    expect(parsePreview(page, 'https://www.tiny.dev/launch')).toEqual({
      site: 'Tiny',
      title: 'Tiny Launch & Co',
      description: 'Ship it — together',
      image: 'https://www.tiny.dev/card.png',
    })
  })

  it('falls back to <title> and the host, and drops http images', () => {
    const plain = '<title> Hello\n world </title><meta content="http://a.com/i.png" property="og:image">'
    expect(parsePreview(plain, 'https://www.example.org/')).toEqual({
      site: 'example.org',
      title: 'Hello world',
      description: null,
      image: null,
    })
  })

  it('gives nothing without a title', () => {
    expect(parsePreview('<html><body>hi</body></html>', 'https://a.com')).toBeNull()
  })

  it('decodes entities safely', () => {
    expect(decodeEntities('&lt;b&gt; &#x1F680; &#55296; &bogus;')).toBe('<b> 🚀 &#55296; &bogus;')
  })
})

describe('safe fetch rules', () => {
  it('only allows public addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPublicAddress(ip), ip).toBe(false)
    }
    for (const ip of ['1.1.1.1', '76.76.21.21', '2606:4700:4700::1111']) expect(isPublicAddress(ip), ip).toBe(true)
  })

  it('refuses private hosts, odd ports and credentials', () => {
    expect(allowedUrl('https://example.com/a#x')?.toString()).toBe('https://example.com/a')
    for (const bad of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'https://a.com:8443/', 'https://u:p@a.com/', 'ftp://a.com/', 'http://printer.local/']) {
      expect(allowedUrl(bad), bad).toBeNull()
    }
  })
})
