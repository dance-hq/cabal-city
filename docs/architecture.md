# How Cabal works

## Where decisions are made

The browser talks to Supabase directly with the public anon key and the signed-in person's session. Postgres row-level security and `security definer` functions decide everything. The Next.js server only handles sign-in codes and the admin bootstrap, using the service-role key, which never reaches the browser.

| Who can… | Rule |
| --- | --- |
| read a room | any member of the community who isn't banned |
| read a team channel | members of that team only, not community admins |
| read a DM | its two people only |
| post in a DM | its two people, and only while neither has blocked the other. Old messages stay readable. |
| become admin | only through `CABAL_ADMIN_EMAILS` on the server. Members can't change their own role. |
| see the community invite code | admins only (the column is hidden from everyone else) |

`tests/integration/permissions.test.ts` checks each of these against a real database.

## Messages

- The client picks each message's id, so a retried send after a dropped connection can't create a duplicate.
- A trigger sets the time on the server, trims the text, caps its length, and limits each person to 15 messages per 20 seconds.
- New messages, edits to profiles and settings, team invites and read markers arrive over Supabase Realtime `postgres_changes`, filtered by the same row-level security. Typing indicators use private broadcast topics, `chan:<id>`, that only people allowed in the channel can join.

## Presence

Each open window holds a presence session. It sends a heartbeat every 25 seconds, and the server stamps the time so clients can't fake it. A session counts as online for 90 seconds after its last heartbeat. Closing the window, quitting the desktop app, or putting the computer to sleep ends the session right away.

Availability is `online`, `away`, `dnd` or `invisible`. Invisible deletes your sessions and stops creating new ones, so there's nothing for anyone else to read.

## Unread counts

`channel_reads.last_read_at` per person per channel, with `my_channels()` returning each channel with its unread count (capped at 100). Muted channels don't count toward the desktop badge.

## Desktop

See [desktop.md](./desktop.md).
