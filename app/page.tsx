import Link from 'next/link'
import { ArrowUpRight, Laptop, Monitor } from 'lucide-react'
import { GithubIcon } from '@/components/brand/github-icon'
import { CabalWordmark } from '@/components/brand/logo'
import { getCommunity } from '@/lib/community'
import { onlineCount } from '@/lib/online-count'
import { latestRelease, type Download } from '@/lib/releases'
import { githubUrl } from '@/lib/config'

export const revalidate = 60

export default async function Home() {
  const community = await getCommunity()
  const [release, online] = await Promise.all([latestRelease(), community ? onlineCount(community.id) : null])

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <CabalWordmark />
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          {githubUrl && (
            <a href={githubUrl} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <GithubIcon className="size-4" aria-hidden />
              GitHub
            </a>
          )}
          <Link href="/login" className="text-foreground hover:underline underline-offset-4">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 pt-10 pb-20 md:pt-20">
        <section className="flex max-w-2xl flex-col gap-6">
          {community && (
            <p className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-online" aria-hidden />
              {community.name}
              {online !== null && (
                <span>
                  {' · '}
                  {online === 1 ? '1 builder online right now' : `${online} builders online right now`}
                </span>
              )}
            </p>
          )}
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
            Your people, right there on your desktop.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            Cabal is an open-source instant messenger for communities of builders. See who&apos;s around, start a
            conversation, or drop into a room. Inspired by AIM and IRC. Starting in Chicago.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <DownloadButtons release={release} />
              <Link
                href="/login"
                className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open in browser
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
              {githubUrl && (
                <a
                  href={githubUrl}
                  className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GithubIcon className="size-4" aria-hidden />
                  View on GitHub
                </a>
              )}
            </div>
            <ReleaseNote release={release} />
          </div>
        </section>

        <section className="grid gap-8 border-t pt-10 md:grid-cols-3">
          <Feature title="A buddy list, first" mono="buddies">
            Online, away, do not disturb, or invisible. You set it; Cabal never watches your keyboard or your screen.
          </Feature>
          <Feature title="Messages that keep up" mono="/msg">
            Direct messages and a couple of community rooms, with real history, unread markers and quiet notifications.
          </Feature>
          <Feature title="A room for your team" mono="#general">
            Start a private team and invite your co-founders. Nobody else in the community can read it.
          </Feature>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 font-mono text-xs text-muted-foreground">
        MIT licensed · No ads, no tracking, no payment · <Link href="/privacy" className="underline underline-offset-2">What Cabal collects</Link>
      </footer>
    </div>
  )
}

function Feature({ title, mono, children }: { title: string; mono: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-xs text-mark">{mono}</p>
      <h2 className="font-medium">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

function DownloadButtons({ release }: { release: Awaited<ReturnType<typeof latestRelease>> }) {
  if (release.state !== 'ready') {
    return (
      <>
        <DisabledDownload icon={<Laptop className="size-4" aria-hidden />} label="Download for Mac" />
        <DisabledDownload icon={<Monitor className="size-4" aria-hidden />} label="Download for Windows" />
      </>
    )
  }
  return (
    <>
      {release.mac.length > 0 ? (
        release.mac.map((d) => <DownloadLink key={d.url} d={d} icon={<Laptop className="size-4" aria-hidden />} prefix="Mac" />)
      ) : (
        <DisabledDownload icon={<Laptop className="size-4" aria-hidden />} label="Download for Mac" />
      )}
      {release.windows.length > 0 ? (
        release.windows.map((d) => <DownloadLink key={d.url} d={d} icon={<Monitor className="size-4" aria-hidden />} prefix="Windows" />)
      ) : (
        <DisabledDownload icon={<Monitor className="size-4" aria-hidden />} label="Download for Windows" />
      )}
    </>
  )
}

function DownloadLink({ d, icon, prefix }: { d: Download; icon: React.ReactNode; prefix: string }) {
  return (
    <a
      href={d.url}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      {prefix === 'Windows' ? 'Download for Windows' : `Mac · ${d.label}`}
      <span className="font-mono text-xs opacity-70">{Math.round(d.size / 1_000_000)} MB</span>
    </a>
  )
}

function DisabledDownload({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      aria-disabled="true"
      className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed px-4 text-sm text-muted-foreground"
    >
      {icon}
      {label}
    </span>
  )
}

function ReleaseNote({ release }: { release: Awaited<ReturnType<typeof latestRelease>> }) {
  if (release.state === 'ready') {
    return (
      <p className="font-mono text-xs leading-relaxed text-muted-foreground">
        {release.version}
        {release.prerelease ? ' alpha' : ''} · unsigned builds, so macOS and Windows will warn on first open.{' '}
        <a href={release.url} className="underline underline-offset-2">
          Release notes and install steps
        </a>
      </p>
    )
  }
  return (
    <p className="font-mono text-xs leading-relaxed text-muted-foreground">
      Desktop installers haven&apos;t been published yet. Use the browser version for now; the downloads switch on as soon
      as the first release is out.
    </p>
  )
}
