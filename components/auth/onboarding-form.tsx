'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/cabal/avatar'
import { createClient } from '@/lib/supabase/client'
import { avatarProblem, uploadAvatar } from '@/lib/avatar'
import { friendlyError } from '@/lib/errors'

type Fields = { display_name: string; username: string; company: string; bio: string; avatar_url: string | null }

export function OnboardingForm({
  userId,
  communitySlug,
  communityName,
  invite,
  initial,
}: {
  userId: string
  communitySlug: string
  communityName: string
  invite?: string
  initial: Fields
}) {
  const router = useRouter()
  const [fields, setFields] = useState<Fields>(initial)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(initial.avatar_url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createClient()
    try {
      let avatar_url = fields.avatar_url
      if (file) avatar_url = await uploadAvatar(userId, file)

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: fields.display_name.trim(),
          username: fields.username.trim(),
          company: fields.company.trim() || null,
          bio: fields.bio.trim() || null,
          avatar_url,
        })
        .eq('id', userId)
      if (profileError) {
        if (profileError.code === '23505') throw new Error('That username is taken. Try another.')
        throw profileError
      }

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

  const name = fields.display_name.trim()
  const usernameValid = /^[A-Za-z0-9_]{2,24}$/.test(fields.username.trim())

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-xs text-muted-foreground">{communityName}</p>
        <h1 className="text-xl font-semibold text-balance">How should people know you?</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Just the basics. You can change all of this later.</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Add a profile photo (optional)"
        >
          <Avatar name={name || fields.username || '?'} url={preview} size={56} />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-secondary-foreground">
            <Camera className="size-3" aria-hidden />
          </span>
        </button>
        <div className="text-sm leading-relaxed text-muted-foreground">
          Photo <span className="text-xs">(optional)</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const problem = avatarProblem(f)
            if (problem) {
              setError(problem)
              return
            }
            setError(null)
            setFile(f)
            setPreview(URL.createObjectURL(f))
          }}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Name</Label>
          <Input
            id="display_name"
            required
            maxLength={60}
            autoFocus
            autoComplete="name"
            value={fields.display_name}
            onChange={set('display_name')}
            placeholder="Ada Lovelace"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              @
            </span>
            <Input
              id="username"
              required
              maxLength={24}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={fields.username}
              onChange={set('username')}
              aria-invalid={fields.username.length > 0 && !usernameValid}
              aria-describedby="username-hint"
              className="h-10 pl-7 font-mono"
            />
          </div>
          <p id="username-hint" className="text-xs text-muted-foreground">
            Letters, numbers and underscores. People @mention you with it.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="company">
            Company or project <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="company" maxLength={80} value={fields.company} onChange={set('company')} className="h-10" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bio">
            {"What you're building"} <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="bio"
            maxLength={280}
            rows={2}
            value={fields.bio}
            onChange={set('bio')}
            placeholder="An agent that files my receipts"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !name || !usernameValid} className="h-10">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Join {communityName}
      </Button>
    </form>
  )
}
