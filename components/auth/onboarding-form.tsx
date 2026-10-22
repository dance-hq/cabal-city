'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/cabal/avatar'
import { IdentityPicker } from '@/components/cabal/identity-picker'
import { createClient } from '@/lib/supabase/client'
import type { Identity } from '@/lib/identity'
import { friendlyError } from '@/lib/errors'
import { usernameCandidates, usernameFrom } from '@/lib/username'

// Two fields and you're in. Photo, company, what you're building and links
// all live in your profile, for whenever you feel like adding them.
export function OnboardingForm({
  userId,
  communitySlug,
  communityName,
  invite,
  emailName,
  initial,
}: {
  userId: string
  communitySlug: string
  communityName: string
  invite?: string
  emailName: string
  initial: { display_name: string; username: string | null; identity: Identity | null; avatar_url: string | null }
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.display_name)
  const [identity, setIdentity] = useState<Identity | null>(initial.identity)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createClient()
    try {
      await saveProfile(supabase, userId, {
        display_name: name.trim(),
        identity,
        username: initial.username ?? null,
        base: usernameFrom(name, emailName),
      })

      const storedInvite = invite ?? sessionStorage.getItem('cabal:invite') ?? undefined
      const { error: joinError } = await supabase.rpc('join_community', {
        p_slug: communitySlug,
        p_code: storedInvite ?? null,
      })
      if (joinError) throw joinError
      sessionStorage.removeItem('cabal:invite')

      await fetch('/api/session/bootstrap', { method: 'POST' }).catch(() => null)
      router.replace('/app?welcome=1')
      router.refresh()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const trimmed = name.trim()

  return (
    <form onSubmit={submit} className="flex flex-col gap-7">
      <div className="flex items-center gap-3">
        <Avatar name={trimmed || '?'} url={initial.avatar_url} size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-xs text-muted-foreground">{communityName}</p>
          <h1 className="text-xl font-semibold text-balance">Pull up a chair.</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Your name</Label>
          <Input
            id="display_name"
            required
            maxLength={60}
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
          />
        </div>
        <IdentityPicker value={identity} onChange={setIdentity} required compact legend="Your role" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button type="submit" disabled={busy || !trimmed || !identity} className="h-10">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Enter Cabal
          {!busy && <ArrowRight aria-hidden />}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Add a photo and more from your profile, any time.</p>
      </div>
    </form>
  )
}

type Supabase = ReturnType<typeof createClient>

// Keeps an existing @username; otherwise makes one from the name, trying a
// few numbered variants if someone already has it. Never touches the photo.
async function saveProfile(
  supabase: Supabase,
  userId: string,
  p: { display_name: string; identity: Identity | null; username: string | null; base: string },
) {
  const candidates = p.username ? [p.username] : usernameCandidates(p.base)
  for (const username of candidates) {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: p.display_name, identity: p.identity, username })
      .eq('id', userId)
    if (!error) return
    if (error.code !== '23505' || p.username) throw error
  }
  throw new Error("We couldn't save your name just now. Try again in a moment.")
}
