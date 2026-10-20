import 'server-only'
import { config } from '@/lib/config'

export type Download = { label: string; url: string; size: number }
export type ReleaseInfo =
  | { state: 'unconfigured' }
  | { state: 'none' }
  | { state: 'ready'; version: string; url: string; prerelease: boolean; mac: Download[]; windows: Download[] }

type GithubAsset = { name: string; browser_download_url: string; size: number }
type GithubRelease = { tag_name: string; html_url: string; prerelease: boolean; draft: boolean; assets: GithubAsset[] }

// Reads the newest published GitHub release. Download buttons only appear
// for installer files that actually exist on it.
export async function latestRelease(): Promise<ReleaseInfo> {
  if (!config.githubRepo) return { state: 'unconfigured' }
  try {
    const res = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases?per_page=10`, {
      headers: { accept: 'application/vnd.github+json' },
      next: { revalidate: 600 },
    })
    if (!res.ok) return { state: 'none' }
    const releases = (await res.json()) as GithubRelease[]
    const release = releases.find((r) => !r.draft && r.assets.some((a) => /\.(dmg|exe)$/i.test(a.name)))
    if (!release) return { state: 'none' }
    const pick = (test: RegExp, label: string) =>
      release.assets
        .filter((a) => test.test(a.name) && !a.name.endsWith('.blockmap'))
        .map((a) => ({ label, url: a.browser_download_url, size: a.size }))
    return {
      state: 'ready',
      version: release.tag_name,
      url: release.html_url,
      prerelease: release.prerelease,
      mac: [...pick(/arm64\.dmg$/i, 'Apple Silicon'), ...pick(/x64\.dmg$/i, 'Intel')],
      windows: pick(/\.exe$/i, 'Windows'),
    }
  } catch {
    return { state: 'none' }
  }
}
