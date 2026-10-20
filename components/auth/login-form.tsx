'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { createClient } from '@/lib/supabase/client'

type Step = { name: 'email' } | { name: 'code'; length: number; devLog: boolean }

export function LoginForm({ communityName, invite }: { communityName: string; invite?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, invite }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Try again.')
        return
      }
      setCode('')
      setStep({ name: 'code', length: json.length ?? 6, devLog: Boolean(json.devLog) })
    } catch {
      setError("Couldn't reach Cabal. Check your connection.")
    } finally {
      setBusy(false)
    }
  }

  async function verify(token: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' })
    if (error) {
      setBusy(false)
      setCode('')
      if (error.status === 429) setError('Too many attempts. Wait a minute and try again.')
      else setError('That code is wrong or expired. Check the latest email, or send a new code.')
      return
    }
    router.replace(invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : '/onboarding')
    router.refresh()
  }

  if (step.name === 'code') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold text-balance">Check your email</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We sent {step.length === 8 ? 'an' : 'a'} {step.length}-digit code to <span className="text-foreground">{email}</span>.
          </p>
          {step.devLog && (
            <p className="rounded-md border border-dashed px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
              Development server without email: the code is in the server log.
            </p>
          )}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length === step.length) verify(code)
          }}
        >
          <Label htmlFor="code" className="sr-only">
            Verification code
          </Label>
          <InputOTP
            id="code"
            maxLength={step.length}
            value={code}
            onChange={(v) => {
              setCode(v)
              if (v.length === step.length && !busy) verify(v)
            }}
            autoFocus
            disabled={busy}
            inputMode="numeric"
            autoComplete="one-time-code"
          >
            <InputOTPGroup>
              {Array.from({ length: step.length }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 font-mono text-base" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || code.length !== step.length} className="h-10">
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Continue
          </Button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep({ name: 'email' })
              setError(null)
            }}
            className="inline-flex items-center gap-1 rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Different email
          </button>
          <button
            type="button"
            onClick={() => requestCode()}
            disabled={busy}
            className="rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Send a new code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-xs text-muted-foreground">{communityName}</p>
        <h1 className="text-xl font-semibold text-balance">Sign in or join</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {"We'll email you a short code. No password to remember."}
        </p>
      </div>
      <form onSubmit={requestCode} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !email} className="h-10">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Email me a code
        </Button>
      </form>
    </div>
  )
}
