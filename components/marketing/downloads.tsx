import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { ReleaseInfo } from '@/lib/releases'
import { githubUrl } from '@/lib/config'
import { DownloadPicker, type Platform } from './download-picker'

export function Downloads({ release }: { release: ReleaseInfo }) {
  const ready = release.state === 'ready'
  const find = (files: { label: string; url: string }[], label: string) => files.find((f) => f.label === label)?.url ?? null

  const platforms: Platform[] = [
    {
      os: 'mac',
      name: 'Mac',
      detail: 'Apple Silicon (M1 and newer)',
      url: ready ? find(release.mac, 'Apple Silicon') : null,
      alt: ready && find(release.mac, 'Intel') ? { label: 'Intel Mac', url: find(release.mac, 'Intel')! } : null,
    },
    {
      os: 'windows',
      name: 'Windows',
      detail: 'Windows 10 or 11',
      url: ready ? (release.windows[0]?.url ?? null) : null,
      alt: null,
    },
    {
      os: 'linux',
      name: 'Linux',
      detail: 'AppImage, runs on most distributions',
      url: ready ? find(release.linux, 'AppImage') : null,
      alt: ready && find(release.linux, '.deb') ? { label: '.deb for Debian or Ubuntu', url: find(release.linux, '.deb')! } : null,
    },
  ]

  return (
    <section id="download" aria-labelledby="download-title" className="flex scroll-mt-8 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="download-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
          Get the desktop app
        </h2>
        <p className="max-w-xl leading-relaxed text-muted-foreground text-pretty">
          Cabal is one shortcut away when you want it, and out of your way when you don&apos;t.
        </p>
      </div>

      <DownloadPicker platforms={platforms} />

      <div className="flex flex-col gap-2">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Or continue in your browser
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          {ready ? (
            <>
              {release.version}
              {release.prerelease ? ' (early release)' : ''} · The installers aren&apos;t signed yet, so macOS and
              Windows ask once before opening.{' '}
              <a href={release.url} className="underline underline-offset-2 hover:text-foreground">
                Install steps and release notes
              </a>
            </>
          ) : (
            <>
              The first desktop release is being built. Until then the browser version has everything.
              {githubUrl && (
                <>
                  {' '}
                  <a href={`${githubUrl}/releases`} className="underline underline-offset-2 hover:text-foreground">
                    Watch releases on GitHub
                  </a>
                </>
              )}
            </>
          )}
        </p>
      </div>
    </section>
  )
}
