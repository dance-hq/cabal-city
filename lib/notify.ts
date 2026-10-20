import { desktop } from '@/lib/desktop'

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

export function showNotification({
  title,
  body,
  tag,
  onClick,
}: {
  title: string
  body: string
  tag: string
  onClick: () => void
}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const n = new Notification(title, { body: body.slice(0, 180), tag, silent: true })
  n.onclick = () => {
    window.focus()
    desktop()?.show()
    onClick()
    n.close()
  }
}

let ctx: AudioContext | null = null

// A short, quiet two-note chime generated in the browser. Off by default.
export function playChime() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.09)
      gain.gain.linearRampToValueAtTime(0.06, now + i * 0.09 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(now + i * 0.09)
      osc.stop(now + i * 0.09 + 0.25)
    })
  } catch {
    // Audio is optional.
  }
}
