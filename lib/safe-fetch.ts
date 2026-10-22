import 'server-only'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { Readable } from 'node:stream'

// Fetches a public web page for a link card. Every connection, including each
// redirect, is checked at connect time, so a hostname can't point at (or be
// re-pointed at) this server's own network.

const MAX_BYTES = 512 * 1024
const DEADLINE_MS = 6000
const MAX_REDIRECTS = 4

// Separate lists: one BlockList treats IPv4 checks as IPv4-mapped IPv6, so
// blocking ::ffff:0:0/96 in a shared list would block every IPv4 address.
const blockedV4 = new BlockList()
const blockedV6 = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  // Unspecified, loopback and the deprecated IPv4-compatible range (::a.b.c.d).
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  // IETF protocol assignments, including Teredo tunnels.
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedV6.addSubnet(net, prefix, 'ipv6')
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blockedV4.check(address, 'ipv4')
  if (family === 6) return !blockedV6.check(address, 'ipv6')
  return false
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { family: options.family, hints: options.hints, all: true }, (error, addresses) => {
    const list = addresses as unknown as LookupAddress[]
    if (error) return callback(error, '', 0)
    if (!list?.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error('Address not allowed'), { code: 'EBLOCKED' }), '', 0)
    }
    if ((options as { all?: boolean }).all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export function allowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (url.port && url.port !== '80' && url.port !== '443') return null
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (isIP(host) && !isPublicAddress(host)) return null
    if (host === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/.test(host)) return null
    url.hash = ''
    return url
  } catch {
    return null
  }
}

type Hop = { status: number; location?: string; html?: string }

function get(url: URL): Promise<Hop> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (hop: Hop) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve(hop)
    }
    const transport = url.protocol === 'https:' ? https : http
    const req = transport.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: DEADLINE_MS,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; CabalBot/1.0; link previews)',
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-language': 'en',
          'accept-encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        // A connection reset mid-body must end this fetch, not crash the server.
        res.on('error', () => finish({ status: 0 }))
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          return finish({ status, location: res.headers.location })
        }
        const type = String(res.headers['content-type'] ?? '')
        if (status < 200 || status >= 300 || !/text\/html|application\/xhtml\+xml/i.test(type)) {
          res.destroy()
          return finish({ status })
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const body: Readable =
          encoding === 'gzip'
            ? res.pipe(createGunzip())
            : encoding === 'deflate'
              ? res.pipe(createInflate())
              : encoding === 'br'
                ? res.pipe(createBrotliDecompress())
                : res
        const chunks: Buffer[] = []
        let size = 0
        const done = () => finish({ status, html: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8') })
        body.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          if (size >= MAX_BYTES) {
            res.destroy()
            done()
          }
        })
        body.on('end', done)
        body.on('error', done)
      },
    )
    const deadline = setTimeout(() => {
      req.destroy()
      finish({ status: 0 })
    }, DEADLINE_MS)
    req.on('timeout', () => req.destroy())
    req.on('error', () => finish({ status: 0 }))
    req.end()
  })
}

export async function fetchPage(raw: string): Promise<{ url: string; html: string } | null> {
  let url = allowedUrl(raw)
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url)
    if (res.location) {
      try {
        url = allowedUrl(new URL(res.location, url).toString())
      } catch {
        return null
      }
      continue
    }
    return res.html ? { url: url.toString(), html: res.html } : null
  }
  return null
}
