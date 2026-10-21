import type { Identity } from './identity'
import type { Envelope } from './e2ee/crypto'

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
  links: string[] | null
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
  /** Direct messages: the encrypted text. `body` is empty until this device opens it. */
  sealed?: Envelope | null
  /** A long message: `body` is only its preview; the full text is in message_texts. */
  long_text?: boolean
  /** Its length in characters. Direct messages carry it inside the encryption, so it's set once opened. */
  long_chars?: number | null
  /** Client-only: the full text of a long message this device sent, so it never has to be fetched back. */
  long_body?: string
  // Client-only: optimistic sends.
  pending?: boolean
  failed?: boolean
  /** Client-only, sealed messages: opened, waiting for this device to be unlocked, or not openable here. */
  e2ee?: 'ok' | 'locked' | 'unreadable'
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
