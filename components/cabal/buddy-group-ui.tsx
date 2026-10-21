'use client'

import { useEffect, useState } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GROUP_NAME_MAX, cleanGroupName, type BuddyGroup } from '@/lib/buddy-groups'

export const PERSON_DRAG_TYPE = 'application/x-cabal-person'

const triggerClass =
  'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:opacity-100'

export function PersonMenu({
  name,
  groups,
  currentGroup,
  onProfile,
  onMove,
  onNewGroup,
}: {
  name: string
  groups: BuddyGroup[]
  currentGroup: string | null
  onProfile: () => void
  onMove: (groupId: string | null) => void
  onNewGroup: () => void
}) {
  const current = groups.find((g) => g.id === currentGroup)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`mr-1 ${triggerClass}`} aria-label={`Options for ${name}`}>
        <MoreHorizontal className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onProfile}>View profile</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to group</DropdownMenuLabel>
          {groups.map((g) => (
            <DropdownMenuItem key={g.id} onClick={() => g.id !== currentGroup && onMove(g.id)}>
              <span className="flex-1 truncate">{g.name}</span>
              {g.id === currentGroup && <Check className="size-3.5" aria-label="Current group" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={onNewGroup}>New group…</DropdownMenuItem>
        </DropdownMenuGroup>
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onMove(null)}>Remove from {current.name}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GroupMenu({ name, onRename, onDelete }: { name: string; onRename: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label={`Options for ${name}`}>
        <MoreHorizontal className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>Rename group</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Delete group
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export type Naming = { kind: 'create'; memberId: string | null; memberName?: string } | { kind: 'rename'; groupId: string; name: string }

export function GroupNameDialog({
  naming,
  onClose,
  onSubmit,
}: {
  naming: Naming | null
  onClose: () => void
  onSubmit: (naming: Naming, name: string) => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (naming) setName(naming.kind === 'rename' ? naming.name : '')
  }, [naming])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const clean = cleanGroupName(name)
    if (!naming || !clean) return
    setBusy(true)
    await onSubmit(naming, clean)
    setBusy(false)
    onClose()
  }

  const creating = naming?.kind === 'create'
  return (
    <Dialog open={!!naming} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{creating ? 'New group' : 'Rename group'}</DialogTitle>
            <DialogDescription>
              {creating
                ? naming.memberName
                  ? `Make a group and put ${naming.memberName} in it. Only you see your groups.`
                  : 'Sort your list your way, like Co-founders or Night owls. Only you see your groups.'
                : 'Only you see this name.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              autoFocus
              required
              maxLength={GROUP_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Co-founders"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !cleanGroupName(name)}>
              {creating ? 'Make group' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
