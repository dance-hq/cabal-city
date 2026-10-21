import 'server-only'
import { Resend } from 'resend'

type Delivery = 'sent' | 'console' | 'unconfigured' | 'failed'

const from = () => {
  const value = (process.env.CABAL_EMAIL_FROM ?? '').trim()
  if (!value) return 'Cabal <onboarding@resend.dev>'
  return value.includes('<') ? value : `Cabal <${value}>`
}

export function adminEmails() {
  return (process.env.CABAL_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.includes('@'))
}

// Plain text on purpose: the body is whatever someone typed, so there's no
// HTML to escape and nothing that renders.
export async function sendFeedbackEmail(f: {
  kind: 'bug' | 'idea'
  body: string
  name: string
  username: string | null
  email: string | null
  context: Record<string, string>
}): Promise<Delivery> {
  const to = adminEmails()
  const key = process.env.RESEND_API_KEY
  if (!key || to.length === 0) return 'unconfigured'

  const label = f.kind === 'bug' ? 'Bug report' : 'Suggestion'
  const who = f.username ? `${f.name} (@${f.username})` : f.name
  const firstLine = f.body.split('\n')[0].slice(0, 60)
  const details = Object.entries(f.context)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const { error } = await new Resend(key).emails.send({
    from: from(),
    to,
    replyTo: f.email ?? undefined,
    subject: `${label} from ${f.name}: ${firstLine}`,
    text: `${label} from ${who}${f.email ? ` <${f.email}>` : ''}\n\n${f.body}\n\n${details ? `--\n${details}\n\n` : ''}Reply to this email to answer them. Mark it resolved in Cabal: Settings → Community & admin.`,
  })
  if (error) {
    console.error('[cabal] Resend error', error.message)
    return 'failed'
  }
  return 'sent'
}

export async function sendSignInCode(email: string, code: string): Promise<Delivery> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Local development without email: print the code to the server log.
    if (process.env.NODE_ENV === 'development') {
      console.log(`[cabal] sign-in code for ${email}: ${code}`)
      return 'console'
    }
    return 'unconfigured'
  }

  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from: from(),
    to: email,
    subject: `${code} is your Cabal code`,
    text: `Your Cabal sign-in code is ${code}\n\nIt expires in an hour. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2024">
<p>Your Cabal sign-in code:</p>
<p style="font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:6px;margin:16px 0"><b>${code}</b></p>
<p style="color:#6b6e76">It expires in an hour. If you didn't ask for it, ignore this email.</p>
</div>`,
  })
  if (error) {
    console.error('[cabal] Resend error', error.message)
    return 'failed'
  }
  return 'sent'
}
