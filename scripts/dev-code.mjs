// Development helper: prints a fresh sign-in code for an email address,
// for when the server isn't set up to send email. Needs the service-role key,
// so it only works for people who run the Supabase project.
//
//   node scripts/dev-code.mjs you@example.com

import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const file of ['.env.local', '.env.development.local']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/dev-code.mjs <email>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })
await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {})
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) {
  console.error(error.message)
  process.exit(1)
}
console.log(data.properties.email_otp)
