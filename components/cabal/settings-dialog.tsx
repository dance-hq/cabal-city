'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Camera, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from './avatar'
import { AdminPanel } from './admin-panel'
import { IdentityPicker } from './identity-picker'
import { DeleteAccount } from './delete-account'
import { PinSetting } from './pin-prompt'
import { copyInviteLink } from './buddy-list'
import { CreateTeamDialog } from './team-dialogs'
import { cleanLinks } from '@/lib/username'
import { useCabal } from './store'
import { createClient } from '@/lib/supabase/client'
import { avatarProblem, uploadAvatar } from '@/lib/avatar'
import { desktop, type DesktopSettings } from '@/lib/desktop'
import { friendlyError } from '@/lib/errors'
import type { Identity } from '@/lib/identity'
import { ensureNotificationPermission, notificationsSupported, playChime } from '@/lib/notify'

type Tab = 'profile' | 'notifications' | 'app' | 'community'

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, isAdmin } = useCabal()
  const [tab, setTab] = useState<Tab>('profile')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'app', label: 'App' },
    { id: 'community', label: isAdmin ? 'Community & admin' : 'Community' },
  ]

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b px-5 pt-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Profile, notifications, app and community settings</DialogDescription>
          <div role="tablist" aria-label="Settings sections" className="-mb-px mt-3 flex gap-4 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'shrink-0 border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  tab === t.id && 'border-primary text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="quiet-scroll flex-1 overflow-y-auto p-5" role="tabpanel">
          {tab === 'profile' && <ProfileSettings />}
          {tab === 'notifications' && <NotificationSettings />}
          {tab === 'app' && <AppSettings />}
          {tab === 'community' && (
            <div className="flex flex-col gap-6">
              <CommunitySettings />
              {isAdmin && <AdminPanel />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSettings() {
  const { me, userId, refreshMembers } = useCabal()
  const [fields, setFields] = useState({
    display_name: me.display_name ?? '',
    username: me.username ?? '',
    company: me.company ?? '',
    bio: me.bio ?? '',
  })
  const [identity, setIdentity] = useState<Identity | null>(me.identity)
  const [links, setLinks] = useState<string[]>(() => [...(me.links ?? []), '', '', ''].slice(0, Math.max(3, me.links?.length ?? 0)))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingTeam, setCreatingTeam] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = cleanLinks(links)
    if (cleaned.length < links.filter((l) => l.trim()).length) {
      toast.error("One of your links doesn't look like a web address.")
      return
    }
    setBusy(true)
    const { error } = await createClient()
      .from('profiles')
      .update({
        display_name: fields.display_name.trim(),
        username: fields.username.trim(),
        identity,
        company: fields.company.trim() || null,
        bio: fields.bio.trim() || null,
        links: cleaned.length ? cleaned : null,
      })
      .eq('id', userId)
    setBusy(false)
    if (error) toast.error(error.code === '23505' ? 'That username is taken.' : friendlyError(error))
    else {
      toast.success('Profile saved')
      setLinks([...cleaned, '', '', ''].slice(0, Math.max(3, cleaned.length)))
      refreshMembers()
    }
  }

  async function setPhoto(f: File | null) {
    setUploading(true)
    try {
      const url = f ? await uploadAvatar(userId, f) : null
      const { error } = await createClient().from('profiles').update({ avatar_url: url }).eq('id', userId)
      if (error) throw error
      refreshMembers()
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setUploading(false)
    }
  }

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }))

  return (
    <>
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={me.display_name ?? ''} url={me.avatar_url} size={52} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => file.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
            {me.avatar_url ? 'Change photo' : 'Add photo'}
          </Button>
          {me.avatar_url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)} disabled={uploading}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            const problem = avatarProblem(f)
            if (problem) toast.error(problem)
            else setPhoto(f)
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" required maxLength={60} value={fields.display_name} onChange={set('display_name')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="s-username">Username</Label>
          <Input
            id="s-username"
            required
            pattern="[A-Za-z0-9_]{2,24}"
            maxLength={24}
            value={fields.username}
            onChange={set('username')}
            aria-describedby="s-username-hint"
            className="font-mono"
          />
          <p id="s-username-hint" className="text-xs text-muted-foreground">
            People @mention you with it.
          </p>
        </div>
      </div>
      <IdentityPicker value={identity} onChange={setIdentity} legend="Role" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="s-bio">What you&apos;re building</Label>
        <Textarea
          id="s-bio"
          maxLength={280}
          rows={3}
          value={fields.bio}
          onChange={set('bio')}
          placeholder="An agent that files my receipts"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="s-company">Company or project</Label>
        <Input id="s-company" maxLength={80} value={fields.company} onChange={set('company')} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Want a place for it here?{' '}
          <button
            type="button"
            onClick={() => setCreatingTeam(true)}
            className="rounded text-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start a team
          </button>{' '}
          and it shows on your profile.
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">Links</legend>
        {links.map((value, i) => (
          <Input
            key={i}
            aria-label={`Link ${i + 1}`}
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={200}
            value={value}
            onChange={(e) => setLinks((ls) => ls.map((l, j) => (j === i ? e.target.value : l)))}
            placeholder={LINK_PLACEHOLDERS[i] ?? 'https://'}
          />
        ))}
        {links.length < 4 && (
          <button
            type="button"
            onClick={() => setLinks((ls) => [...ls, ''])}
            className="self-start rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Add another link
          </button>
        )}
      </fieldset>
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Save profile
        </Button>
      </div>
    </form>
    <CreateTeamDialog open={creatingTeam} onOpenChange={setCreatingTeam} />
    </>
  )
}

const LINK_PLACEHOLDERS = ['yoursite.com', 'x.com/you', 'linkedin.com/in/you', 'github.com/you']

function NotificationSettings() {
  const { settings, updateSettings } = useCabal()
  const [permission, setPermission] = useState<string>('default')

  useEffect(() => {
    setPermission(notificationsSupported() ? Notification.permission : 'unsupported')
  }, [])

  return (
    <div className="flex flex-col gap-5">
      {permission !== 'granted' && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">
            {permission === 'denied'
              ? 'Notifications are blocked for Cabal in your browser or system settings.'
              : permission === 'unsupported'
                ? "This browser doesn't support desktop notifications."
                : 'Allow notifications so Cabal can tell you about new messages.'}
          </p>
          {permission === 'default' && (
            <div>
              <Button size="sm" onClick={async () => setPermission(await ensureNotificationPermission())}>
                Allow notifications
              </Button>
            </div>
          )}
        </div>
      )}
      <Toggle
        id="n-dms"
        label="Direct messages"
        hint="A notification for each new direct message."
        checked={settings.notify_dms}
        onChange={(v) => updateSettings({ notify_dms: v })}
      />
      <Toggle
        id="n-mentions"
        label="Mentions"
        hint="When someone writes your @username in a channel or team. Channels are otherwise quiet."
        checked={settings.notify_mentions}
        onChange={(v) => updateSettings({ notify_mentions: v })}
      />
      <Toggle
        id="n-sound"
        label="Sound"
        hint="A soft chime with notifications."
        checked={settings.notify_sound}
        onChange={(v) => {
          updateSettings({ notify_sound: v })
          if (v) playChime()
        }}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Do not disturb silences everything. Nobody is notified when people come online. Mute a conversation from its header.
      </p>
    </div>
  )
}

function AppSettings() {
  const { theme, setTheme } = useTheme()
  const { email } = useCabal()
  const router = useRouter()
  const bridge = desktop()
  const [desk, setDesk] = useState<DesktopSettings | null>(null)
  const [shortcut, setShortcut] = useState('')

  useEffect(() => {
    bridge?.getSettings().then((s) => {
      setDesk(s)
      setShortcut(s.shortcut)
    })
  }, [bridge])

  async function patch(p: Partial<DesktopSettings>) {
    if (!bridge) return
    const next = await bridge.setSettings(p)
    setDesk(next)
    setShortcut(next.shortcut)
    if (p.shortcut !== undefined && next.shortcut !== p.shortcut) toast.error("That shortcut couldn't be registered.")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Appearance</h3>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {(['dark', 'light', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm capitalize hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                theme === t && 'border-primary bg-accent',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {bridge && desk ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-medium">Desktop</h3>
          <PinSetting />
          <Toggle
            id="d-login"
            label="Open Cabal when I log in"
            checked={desk.launchAtLogin}
            onChange={(v) => patch({ launchAtLogin: v })}
          />
          <Toggle
            id="d-tray"
            label="Keep running in the menu bar when I close the window"
            hint="Turn off to quit Cabal when its window closes."
            checked={desk.closeToTray}
            onChange={(v) => patch({ closeToTray: v })}
          />
          <Toggle
            id="d-top"
            label="Keep the window on top"
            hint="Off by default. Handy for keeping who's online at the edge of your screen."
            checked={desk.alwaysOnTop}
            onChange={(v) => patch({ alwaysOnTop: v })}
          />
          {desk.sessionOverlay !== undefined && (
            <Toggle
              id="d-overlay"
              label="Show the session timer"
              hint={
                desktop()?.setBuddies
                  ? 'A small clock that stays in the corner of your screen while a session runs, even over Cabal. Click it for your buddy list; drag it wherever you like.'
                  : 'A small clock that stays in the corner of your screen while a session runs, even over Cabal. Drag it wherever you like.'
              }
              checked={desk.sessionOverlay}
              onChange={(v) => patch({ sessionOverlay: v })}
            />
          )}
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              patch({ shortcut: shortcut.trim() })
            }}
          >
            <Label htmlFor="d-shortcut">Show/hide shortcut</Label>
            <div className="flex gap-2">
              <Input
                id="d-shortcut"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="CommandOrControl+Shift+Space"
                className="font-mono text-xs"
              />
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Leave empty to turn it off. Uses Electron accelerator names.</p>
          </form>
          <div className="flex items-center justify-between rounded-md border p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cabal {bridge.version}. Quitting disconnects you and stops everything in the background.
            </p>
            <Button variant="secondary" size="sm" onClick={() => bridge.quit()}>
              Quit Cabal
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          You&apos;re using Cabal in a browser. The desktop app adds a menu bar icon, a keyboard shortcut and launch at login.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Account</h3>
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm text-muted-foreground">{email}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              await createClient().auth.signOut()
              router.replace('/login')
            }}
          >
            Sign out
          </Button>
        </div>
        <DeleteAccount />
      </div>
    </div>
  )
}

function CommunitySettings() {
  const { community } = useCabal()
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">{community.name}</h3>
        {community.description && <p className="text-sm leading-relaxed text-muted-foreground">{community.description}</p>}
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {community.join_policy === 'open' ? 'Open: anyone can sign up and join.' : 'Invite-only: new people need an invite link.'}
      </p>
      <div>
        <Button variant="secondary" size="sm" onClick={() => copyInviteLink(community.id)}>
          <Link2 aria-hidden />
          Copy invite link
        </Button>
      </div>
    </div>
  )
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
