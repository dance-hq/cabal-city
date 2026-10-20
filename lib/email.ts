import 'server-only'
import { Resend } from 'resend'

type Delivery = 'sent' | 'console' | 'unconfigured' | 'failed'

const from = () => process.env.CABAL_EMAIL_FROM || 'Cabal <onboarding@resend.dev>'

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
