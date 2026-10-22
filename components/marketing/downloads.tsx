import Link from 'next/link'
import { AppWindow, ArrowDownToLine, ArrowUpRight, Laptop, Monitor, Terminal } from 'lucide-react'
import type { Download, ReleaseInfo } from '@/lib/releases'
import { githubUrl } from '@/lib/config'

type Row = { platform: string; detail: string; icon: React.ReactNode; files: Download[] }

export function Downloads({ release }: { release: ReleaseInfo }) {
  const ready = release.state === 'ready'
  const rows: Row[] = [
    {
      platform: 'Windows',
      detail: 'Windows 10 or 11 · x64 and Arm',
      icon: <Monitor className="size-5" aria-hidden />,
      files: ready ? release.windows : [],
    },
    {
      platform: 'macOS',
      detail: 'Apple Silicon or Intel',
      icon: <Laptop className="size-5" aria-hidden />,
      files: ready ? release.mac : [],
    },
    {
      platform: 'Linux',
      detail: 'AppImage or Debian/Ubuntu package',
      icon: <Terminal className="size-5" aria-hidden />,
      files: ready ? release.linux : [],
    },
  ]

  return (
    <section id="download" aria-labelledby="download-title" className="flex scroll-mt-8 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="download-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
          Get Cabal on your desktop
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
          Who&apos;s online in your menu bar, a show/hide shortcut, and notifications that know when to keep quiet. It&apos;s the
          same Cabal as the browser version, in its own window.
        </p>
      </div>

      <ul className="flex flex-col border-y">
        {rows.map((row) => (
          <li
            key={row.platform}
            className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-flag">{row.icon}</span>
              <div className="flex flex-col">
                <span className="font-medium">{row.platform}</span>
                <span className="text-xs text-muted-foreground">{row.detail}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.files.length > 0 ? (
                row.files.map((f) => (
                  <a
                    key={f.url}
                    href={f.url}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <ArrowDownToLine className="size-4" aria-hidden />
                    {row.platform === 'Windows' ? 'Download' : f.label}
                    <span className="font-mono text-xs opacity-75">{Math.max(1, Math.round(f.size / 1_000_000))} MB</span>
                  </a>
                ))
              ) : (
                <span className="inline-flex h-9 items-center rounded-md border border-dashed px-3 font-mono text-xs text-muted-foreground">
                  Coming with the first release
                </span>
              )}
            </div>
          </li>
        ))}
        <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-flag">
              <AppWindow className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col">
              <span className="font-medium">Any browser</span>
              <span className="text-xs text-muted-foreground">Nothing to install</span>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex h-9 items-center gap-2 self-start rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
          >
            Open in browser
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </li>
      </ul>

      <p className="font-mono text-xs leading-relaxed text-muted-foreground">
        {ready ? (
          <>
            {release.version}
            {release.prerelease ? ' (early release)' : ''} · The installers aren&apos;t signed yet, so Windows and macOS
            ask once before opening.{' '}
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
    </section>
  )
}
