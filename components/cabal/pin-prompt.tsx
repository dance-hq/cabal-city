'use client'

import { useEffect, useId, useRef, useState } from 'react'
import useSWR from 'swr'
import { Check, ChevronRight, Pin, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { desktop, type DesktopPin } from '@/lib/desktop'

// No installer can pin itself (Windows and macOS both forbid it), so Cabal asks
// in the app and watches for the pin, closing the card the moment it lands.

const FIRST_ASK_DELAY_MS = 5000
const WATCH_EVERY_MS = 1500
const CELEBRATE_MS = 2400

type SupportedPin = Extract<DesktopPin, { supported: true }>

const WORDS = {
  windows: {
    title: 'Pin Cabal to your taskbar',
    how: 'Right-click Cabal on your taskbar, then choose Pin to taskbar.',
    pinned: 'Pinned to your taskbar',
  },
  mac: {
    title: 'Keep Cabal in your Dock',
    how: 'Right-click Cabal in your Dock, then choose Options and Keep in Dock.',
    pinned: 'Kept in your Dock',
  },
}

function words() {
  return desktop()?.platform === 'darwin' ? WORDS.mac : WORDS.windows
}

export function usePin(watching: boolean): SupportedPin | null {
  const bridge = desktop()
  const { data } = useSWR(bridge?.getPin ? 'desktop:pin' : null, () => bridge!.getPin!(), {
    refreshInterval: (latest) => (watching && !(latest?.supported && latest.pinned) ? WATCH_EVERY_MS : 0),
    revalidateOnFocus: true,
    dedupingInterval: 1000,
  })
  return data?.supported ? data : null
}

async function moveToApplications() {
  const moved = await desktop()?.moveToApplications?.()
  if (!moved) toast.error("Cabal couldn't move itself. Drag it into your Applications folder, then open it from there.")
}

export function PinPrompt() {
  const [open, setOpen] = useState(false)
  const asked = useRef(false)
  const pin = usePin(open)
  const titleId = useId()
  const pinned = open && pin?.pinned === true

  useEffect(() => {
    if (!pin?.ask || asked.current) return
    const timer = setTimeout(() => {
      asked.current = true
      setOpen(true)
      // Moving to Applications reopens Cabal, and the real ask comes after that.
      if (!pin.needsMove) desktop()?.answerPin?.('shown')
    }, FIRST_ASK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pin?.ask, pin?.needsMove])

  useEffect(() => {
    if (!pinned) return
    const timer = setTimeout(() => setOpen(false), CELEBRATE_MS)
    return () => clearTimeout(timer)
  }, [pinned])

  if (!open || !pin) return null

  const w = words()
  const mac = desktop()?.platform === 'darwin'

  function notNow() {
    // A skipped move still counts as an ask, so it doesn't come back every launch.
    desktop()?.answerPin?.(pin?.needsMove ? 'shown' : 'later')
    setOpen(false)
  }

  function stopAsking() {
    desktop()?.answerPin?.('never')
    setOpen(false)
  }

  function confirmPinned() {
    desktop()?.answerPin?.('pinned')
    setOpen(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <section
        aria-labelledby={titleId}
        onKeyDown={(e) => e.key === 'Escape' && !pinned && notNow()}
        className="pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
      >
        {pinned ? (
          <p role="status" className="flex items-center gap-2.5 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-flag text-flag-foreground">
              <Check className="size-3.5" aria-hidden />
            </span>
            <span>
              <span className="font-medium">{w.pinned}.</span>{' '}
              <span className="text-muted-foreground">Cabal&apos;s one click away now.</span>
            </span>
          </p>
        ) : pin.needsMove ? (
          <>
            <Header id={titleId} title="Move Cabal to Applications" onClose={notNow} />
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Cabal is running from the disk image or your Downloads, so a Dock icon would stop working. Move it and
              Cabal reopens from Applications, ready to keep in your Dock.
            </p>
            <div className="flex items-center justify-end gap-2">
              <FooterButton onClick={notNow}>Not now</FooterButton>
              <PrimaryButton onClick={moveToApplications}>Move to Applications</PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <Header id={titleId} title={w.title} onClose={notNow} />
            <div className="flex flex-wrap items-center gap-4">
              {mac ? <DockMenu /> : <TaskbarMenu />}
              <div className="flex min-w-40 flex-1 flex-col gap-2">
                <p className="text-sm leading-relaxed text-pretty">{w.how}</p>
                {pin.pinned === false && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-flag motion-reduce:animate-none" aria-hidden />
                    This closes by itself once it&apos;s pinned.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <FooterButton onClick={stopAsking}>Don&apos;t ask again</FooterButton>
              {pin.pinned === null ? (
                <PrimaryButton onClick={confirmPinned}>I pinned it</PrimaryButton>
              ) : (
                <FooterButton onClick={notNow}>Not now</FooterButton>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Header({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 id={id} className="text-sm font-semibold text-balance">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Not now"
        className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function FooterButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-flag px-3 py-1.5 text-xs font-medium text-flag-foreground hover:bg-flag/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

// Small replicas of the menu you'll see, with the item to choose lit up.

function MenuRow({ lit, children }: { lit?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-2 py-1 whitespace-nowrap',
        lit ? 'bg-flag text-flag-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}

function TaskbarMenu() {
  return (
    <div aria-hidden className="flex w-40 shrink-0 flex-col gap-0.5 rounded-lg border bg-background p-1 text-xs">
      <MenuRow>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 14px app icon */}
        <img src="/cabal-icon.png" alt="" className="size-3.5 rounded-sm" />
        <span className="text-foreground">Cabal</span>
      </MenuRow>
      <div className="mx-1 my-0.5 h-px bg-border" />
      <MenuRow lit>
        <Pin className="size-3.5" />
        Pin to taskbar
      </MenuRow>
      <MenuRow>
        <X className="size-3.5" />
        Close window
      </MenuRow>
    </div>
  )
}

function DockMenu() {
  return (
    <div aria-hidden className="flex shrink-0 items-start text-xs">
      <div className="flex w-32 flex-col gap-0.5 rounded-lg border bg-background p-1">
        <MenuRow>
          <span className="flex-1 text-foreground">Options</span>
          <ChevronRight className="size-3" />
        </MenuRow>
        <div className="mx-1 my-0.5 h-px bg-border" />
        <MenuRow>Show All Windows</MenuRow>
        <MenuRow>Quit</MenuRow>
      </div>
      <div className="-ml-2 mt-0 flex w-28 flex-col gap-0.5 rounded-lg border bg-background p-1 shadow-md">
        <MenuRow lit>Keep in Dock</MenuRow>
        <MenuRow>Open at Login</MenuRow>
      </div>
    </div>
  )
}

// The same thing as a line in Settings, for anyone who skipped the card.
export function PinSetting() {
  const pin = usePin(true)
  if (!pin) return null
  const w = words()

  if (pin.pinned === true) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Check className="size-4 shrink-0 text-flag" aria-hidden />
        {w.pinned}
      </p>
    )
  }

  if (pin.needsMove) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm">Move Cabal to Applications</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            It&apos;s running from the disk image or Downloads, so the Dock can&apos;t keep it.
          </p>
        </div>
        <PrimaryButton onClick={moveToApplications}>Move</PrimaryButton>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm">{w.title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{w.how}</p>
    </div>
  )
}
