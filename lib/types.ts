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
  // Show my running Lock in in "Locked in now".
  lock_in_live: boolean
  // Be on the weekly board and share my Lock in numbers on my profile.
  lock_in_board: boolean
  // The one-time welcome has been shown.
  welcome_seen: boolean
  // Playbook items ticked by hand (see lib/playbook.ts).
  playbook_done: string[]
  // The Playbook card is tucked away on Home.
  playbook_hidden: boolean
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
  // Who started it, oldest owner first. Readable before you join.
  owner_ids: string[]
  logo_url: string | null
  banner_url: string | null
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
  team_logo_url?: string | null
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
  /** How many photos or videos it carries (rows in message_files). */
  files?: number
  /** Client-only: the photos and videos this device is sending, shown from memory until they're stored. */
  local_files?: LocalFile[]
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

export type FileKind = 'image' | 'video'

/** A photo or video picked on this device and ready to send. */
export type LocalFile = {
  key: string
  blob: Blob
  /** An object URL for showing it before it's stored. */
  url: string
  kind: FileKind
  mime: string
  name: string
  width: number | null
  height: number | null
}

/** A stored attachment. Direct messages keep kind, type, name and size inside `sealed`. */
export type MessageFileRow = {
  id: string
  message_id: string
  channel_id: string
  position: number
  path: string
  bytes: number
  kind: FileKind | null
  mime: string | null
  name: string | null
  width: number | null
  height: number | null
  sealed: Envelope | null
}
