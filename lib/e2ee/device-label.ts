/** "Chrome on Mac", "Cabal desktop on Windows": shown on the device asked to approve this one. */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iPhone or iPad'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /CrOS/.test(ua)
            ? 'Chromebook'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const app = /Electron\//.test(ua)
    ? 'Cabal desktop'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser'
  return os ? `${app} on ${os}` : app
}
