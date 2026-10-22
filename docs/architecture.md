# How Cabal works

A longer walkthrough, with links to the code behind each part, is at [cabal.city/docs](https://www.cabal.city/docs).

## Where decisions are made

The browser talks to Supabase directly with the public anon key and the signed-in person's session. Postgres row-level security and `security definer` functions decide everything.

The Next.js server has a few routes of its own (`app/api`). They cover the things the browser can't be trusted to do itself:

- sending sign-in codes
- granting admin to the emails in `CABAL_ADMIN_EMAILS`
- fetching link previews, so that links are never fetched by the browser, and never for DMs
- filing a report on an encrypted DM, after checking that the reported text really is what was sent
- deleting an account
- taking feedback
- reporting which build is live

Some of these use the service-role key, which never reaches the browser.

| Who can… | Rule |
| --- | --- |
| read a room | any member of the community who isn't banned |
| read a private team | its members only, not community admins. An invitation alone doesn't open it. |
| read a DM | its two people only. The text is end-to-end encrypted, so only their devices can read it. |
| post in a DM | its two people, and only while neither has blocked the other. Old messages stay readable. |
| see a photo or video | whoever can read the message it's attached to |
| put an event on the calendar | admins. A member's event waits as pending until an admin approves it. |
| become admin | only through `CABAL_ADMIN_EMAILS` on the server. Members can't change their own role, and joining always makes you a plain member. |
| see the community invite code | admins only |

`tests/integration/permissions.test.ts` and `tests/integration/authorization.test.ts` check these against a real database.

## Messages

- The client picks each message's id, so a retried send after a dropped connection can't create a duplicate.
- A trigger sets the time on the server, trims the text, caps its length and limits how fast each person can post.
- Long messages keep a short preview in `messages` and the full text in `message_texts`, so conversation lists stay light.
- Photos and videos go into the private `attachments` bucket. A file can only be read once a message claims it, and only by people who can read that message. Photos are redrawn on the device before upload, which drops location data.

## Direct messages

DMs are encrypted in the browser before they're sent, using Web Crypto: P-256 keys, a key derived per message, and AES-GCM. Each person's private keys live only on their devices and in a backup locked by their recovery key. A new device gets the keys from one of your other devices, after you match a code on both, or from that recovery key. The code is in `lib/e2ee/`, and the full protocol and its limits are on [cabal.city/docs](https://www.cabal.city/docs#encryption).

## Live updates

New messages, edits to profiles and settings, team invites and read markers arrive over Supabase Realtime `postgres_changes`. Realtime filters these through the same row-level security, so nobody receives a row they couldn't read.

Typing indicators and the Lock in "look again" ping use private broadcast topics (`chan:<id>`, `lock-ins:<community>`). `public.can_use_topic` decides who may join them. The Opportunities and Calendar badges poll instead of listening live.

## Presence

Each open window holds a presence session. It sends a heartbeat every 25 seconds, and the server stamps the time so clients can't fake it. A session counts as online for 90 seconds after its last heartbeat. Closing the window, quitting the desktop app, or putting the computer to sleep ends the session right away.

Availability is `online`, `away`, `dnd` or `invisible`. Invisible deletes your sessions and stops creating new ones, so there's nothing for anyone else to read.

## Unread counts

`channel_reads.last_read_at` per person per channel, with `my_channels()` returning each channel with its unread count (capped at 100). Muted channels don't count toward the desktop badge.

## Desktop

See [desktop.md](./desktop.md).
