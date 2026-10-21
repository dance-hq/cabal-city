import type { Identity } from './identity'

export type Availability = 'online' | 'away' | 'dnd' | 'invisible'
export type ShownStatus = 'online' | 'away' | 'dnd' | 'offline'

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  company: string | null
  bio: string | null
  status_text: string | null
  identity: Identity | null
}

export type Settings = {
  availability: Availability
  notify_dms: boolean
  notify_mentions: boolean
  notify_sound: boolean
}

export type Community = {
  id: string
  slug: string
  name: string
  description: string | null
  join_policy: 'open' | 'invite'
}

export type Member = { user_id: string; role: 'member' | 'admin'; joined_at: string; banned_at: string | null }

export type ChannelKind = 'room' | 'team' | 'dm'

export type TeamVisibility = 'public' | 'private'

export type TeamRoom = {
  id: string
  name: string
  visibility: TeamVisibility
  member_count: number
  joined: boolean
  last_message_at: string | null
  created_at: string
  welcome: string | null
}

export type Channel = {
  id: string
  kind: ChannelKind
  slug: string | null
  name: string | null
  topic: string | null
  position: number
  team_id: string | null
  team_name: string | null
  team_role: 'owner' | 'member' | null
  team_visibility: TeamVisibility | null
  other_user_id: string | null
  last_message_at: string | null
  last_read_at: string | null
  unread: number
  muted: boolean
}

export type Message = {
  id: string
  channel_id: string
  author_id: string | null
  kind: 'user' | 'system'
  body: string
  created_at: string
  deleted_at: string | null
  // Client-only: optimistic sends.
  pending?: boolean
  failed?: boolean
}

export type PresenceSession = {
  id: string
  user_id: string
  community_id: string
  availability: 'online' | 'away' | 'dnd'
  room_id: string | null
  last_seen: string
}

export type TeamInvite = { id: string; team_id: string; user_id: string; invited_by: string | null; created_at: string }
