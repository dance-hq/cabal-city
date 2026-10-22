# Cabal

An open-source messenger for your local builder community: who's online, direct messages and IRC-style rooms, made for the people building things in your city.

The first community running on it is **Chicago AI Cabal**. Cabal is MIT-licensed and works for any community.

Join it at **[www.cabal.city](https://www.cabal.city)**, or get the [desktop app](https://github.com/dance-hq/cabal-city/releases/latest).

- **Who's around.** See who's online, who's busy and what they're working on. Invisible really means invisible: other people get no presence at all from you.
- **Direct messages.** Click anyone's name. DMs, including their photos and videos, are end-to-end encrypted, so the stored copies can't be read by community admins or by whoever runs the server.
- **Rooms.** `#introductions`, `#cabal-chat`, `#launches` and `#asks` to start, IRC-style: compact lines, join notices, a list of who's in the room.
- **Teams.** A channel for your startup or crew, public or private, with its own logo and banner. Only members can read a private team, and that's enforced by the database, not by hiding buttons.
- **Lock in.** One tap starts a focus session. Your hours add up week by week, and you can choose to show them on the community board.
- **Opportunities and Calendar.** Credits, programs and events worth knowing about. Admins curate them, and members can suggest more.
- **Build Cabal.** Members suggest and vote on improvements to Cabal itself. What ships shows up as **Today's ship**.
- **Desktop app.** A small Electron shell for macOS, Windows and Linux with a tray icon, an unread badge, a show/hide shortcut, floating chat windows and a Lock in timer in the corner of your screen.

## How it's built

| Part | What it is |
| --- | --- |
| Web app | Next.js (App Router), React, Tailwind, SWR |
| Data, auth, live updates | Supabase: Postgres with row-level security, email sign-in codes, Realtime |
| Files | Supabase Storage: avatars and team images, plus a private bucket for photos and videos in messages |
| Email | [Resend](https://resend.com) sends the sign-in codes |
| Desktop | Electron in [`desktop/`](./desktop), which loads the hosted web app |

Every rule about who can read or post what lives in Postgres (`supabase/migrations`). The browser only ever uses the public anon key, so a modified client can't read a team it isn't on or a DM it isn't in. See [docs/architecture.md](./docs/architecture.md).

The plain-language version, with a link to the code behind every claim, is [cabal.city/docs](https://www.cabal.city/docs). Its text lives in `lib/docs.ts`, and `tests/unit/docs.test.ts` fails when the code it describes changes (or when the page starts naming exact abuse limits or privileged keys), so update both together.

## Run it

You need Node 24, pnpm, and a Supabase project.

```bash
pnpm install
cp .env.example .env.local      # then fill it in
pnpm db:migrate                  # tables, policies, functions, storage buckets
pnpm db:seed                     # your community (its first rooms are added automatically)
pnpm dev
```

Open http://localhost:3000. Without `RESEND_API_KEY`, the sign-in code prints in the terminal running `pnpm dev`.

To make yourself an admin, put your email in `CABAL_ADMIN_EMAILS` before you sign up. Admin status is never handed to whoever signs up first.

Full setup, including your own community name, email sending and deploying: [docs/self-hosting.md](./docs/self-hosting.md).

## Desktop app

```bash
cd desktop
npm install
npm run dev        # opens the app against http://localhost:3000
```

Packaging, release builds and signing are covered in [docs/desktop.md](./docs/desktop.md). Pushing a tag like `v0.2.0` builds installers for all three platforms and attaches them to a GitHub Release, with checksums and a build-provenance attestation. The landing page then picks them up automatically.

## Tests

```bash
pnpm typecheck
pnpm test                      # unit tests, plus live database tests when Supabase keys are set
cd desktop && npm run check    # desktop shell rules
```

There are two live database suites. `tests/integration/permissions.test.ts` creates a throwaway community and users, checks the privacy rules (teams, DMs, blocks, admin powers, rate limits) against real Postgres, then deletes everything it made. `tests/integration/authorization.test.ts` plays other people trying to break those rules, inside one transaction that it rolls back, so nothing it does is ever saved.

## Security

Found a problem? Please report it privately, as described in [SECURITY.md](./SECURITY.md). The latest audit and the release checklist are in [docs/security](./docs/security).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). Ideas for the product itself are best posted in the app under **Build Cabal**, where the community can back them.

## License

[MIT](./LICENSE)
