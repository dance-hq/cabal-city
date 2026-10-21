'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useCabal } from './store'
import { useWorkSession } from './work-session'
import { useBuddyGroups } from '@/hooks/use-buddy-groups'
import { useLockIns } from '@/hooks/use-lock-ins'
import { arrangeBuddies, type BuddyAction, type OverlayBuddies, type OverlayPerson } from '@/lib/buddy-groups'
import { desktop } from '@/lib/desktop'

// Keeps the desktop corner list in step with your buddy list, and carries out
// what you do there (open a DM, move someone, make a group). Does nothing in a browser.
export function DesktopBuddies() {
  const bridge = desktop()
  const supported = !!bridge?.setBuddies && !!bridge.onBuddyAction
  return supported ? <Sync /> : null
}

function Sync() {
  const { members, userId, statusOf, channels, openDm, community } = useCabal()
  const buddy = useBuddyGroups()
  const lockIns = useLockIns(community.id)
  const session = useWorkSession()

  const list = useMemo<OverlayBuddies>(() => {
    const unread = new Map<string, number>()
    for (const c of channels) if (c.kind === 'dm' && c.other_user_id && !c.muted) unread.set(c.other_user_id, c.unread)
    const groupOf = new Map(buddy.placements.map((p) => [p.member_id, p.group_id]))
    const people = members
      .filter((m) => m.user_id !== userId)
      .map((m) => ({
        user_id: m.user_id,
        name: m.profile.display_name || m.profile.username || 'Someone',
        status: statusOf(m.user_id),
        note: lockIns.has(m.user_id)
          ? `Locked in${m.profile.status_text ? ` · ${m.profile.status_text}` : ''}`
          : m.profile.status_text,
      }))
    const arranged = arrangeBuddies(people, buddy.groups, buddy.placements)
    const shown = (p: (typeof people)[number]): OverlayPerson => ({
      id: p.user_id,
      name: p.name,
      status: p.status,
      note: p.note || null,
      unread: unread.get(p.user_id) ?? 0,
      group: groupOf.get(p.user_id) ?? null,
    })
    return {
      groups: arranged.groups.map(({ group, online, total }) => ({
        id: group.id,
        name: group.name,
        collapsed: group.collapsed,
        total,
        people: online.map(shown),
      })),
      here: arranged.here.map(shown),
      offline: arranged.offline.map(shown),
    }
  }, [members, userId, statusOf, channels, buddy.groups, buddy.placements, lockIns])

  const sent = useRef('')
  useEffect(() => {
    const timer = setTimeout(() => {
      const json = JSON.stringify(list)
      if (json === sent.current) return
      sent.current = json
      desktop()?.setBuddies?.(list)
    }, 250)
    return () => clearTimeout(timer)
  }, [list])

  const handle = useRef<(action: BuddyAction) => void>(() => {})
  useEffect(() => {
    handle.current = (action) => run(action)
  })
  useEffect(() => desktop()?.onBuddyAction?.((action) => handle.current(action)), [])

  function run(action: BuddyAction) {
    const isMember = (id: string) => id !== userId && members.some((m) => m.user_id === id)
    const isGroup = (id: string) => buddy.groups.some((g) => g.id === id)
    switch (action.type) {
      case 'open-dm':
        if (isMember(action.userId)) openDm(action.userId)
        return
      case 'move':
        if (isMember(action.userId) && (action.groupId === null || isGroup(action.groupId))) {
          buddy.moveTo(action.userId, action.groupId)
        }
        return
      case 'create-group':
        if (action.userId === null || isMember(action.userId)) buddy.createGroup(action.name, action.userId)
        return
      case 'rename-group':
        if (isGroup(action.groupId)) buddy.renameGroup(action.groupId, action.name)
        return
      case 'delete-group':
        if (isGroup(action.groupId)) buddy.deleteGroup(action.groupId)
        return
      case 'collapse-group':
        if (isGroup(action.groupId)) buddy.setCollapsed(action.groupId, action.collapsed)
        return
      case 'pause-session':
        if (session.status === 'running') void session.pause()
        return
    }
  }

  return null
}
