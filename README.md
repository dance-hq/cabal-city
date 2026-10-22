# Cabal

An open-source messenger for your local builder community: who's online, direct messages and IRC-style rooms, made for the people building things in your city.

The first community running on it is **Chicago AI Cabal**. Cabal is MIT-licensed and works for any community.

Join it at **[www.cabal.city](https://www.cabal.city)**, or get the [desktop app](https://github.com/dance-hq/cabal-city/releases/latest).

- **Who's around.** See who's online, who's busy and what they're working on. Invisible really means invisible: other people get no presence at all from you.
- **Direct messages.** Click anyone's name.
- **Rooms.** `#cabal-chat` and `#introductions` to start, IRC-style: compact lines, join notices, a list of who's in the room.
- **Private teams.** A channel for your startup or crew. Only invited members can read it, and that's enforced by the database, not by hiding buttons.
- **Desktop app.** A small Electron shell for macOS, Windows and Linux with a tray icon, an unread badge, a show/hide shortcut and an option to start when you log in.

## How it's built

| Part | What it is |
| --- | --- |
| Web app | Next.js (App Router), React, Tailwind, SWR |
| Data, auth, live updates | Supabase: Postgres with row-level security, email sign-in codes, Realtime |
| Email | [Resend](https://resend.com) sends the sign-in codes |
| Desktop | Electron in [`desktop/`](./desktop), which loads the hosted web app |

Every rule about who can read or post what lives in Postgres (`supabase/migrations`). The browser only ever uses the public anon key, so a modified client can't read a team it isn't on or a DM it isn't in. See [docs/architecture.md](./docs/architecture.md).

The plain-language version, with a link to the code behind every claim, is [cabal.city/docs](https://www.cabal.city/docs). Its text lives in `lib/docs.ts`, and `tests/unit/docs.test.ts` fails when the code it describes changes (or when the page starts naming exact abuse limits or privileged keys), so update both together.

## Run it

You need Node 24, pnpm, and a Supabase project.

```bash
pnpm install
cp .env.example .env.local      # then fill it in
pnpm db:migrate                  # tables, policies, functions
pnpm db:seed                     # your community and its first rooms
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

Packaging, release builds and signing are covered in [docs/desktop.md](./docs/desktop.md). Pushing a tag like `v0.2.0` builds installers for all three platforms and attaches them to a GitHub Release. The landing page then picks them up automatically.

## Tests

```bash
pnpm typecheck
pnpm test                      # unit tests, plus live database tests when Supabase keys are set
cd desktop && npm run check    # desktop shell rules
```

The live database tests create a throwaway community and throwaway users, check the privacy rules (teams, DMs, blocks, admin powers, rate limits) against real Postgres, then delete everything they made.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
