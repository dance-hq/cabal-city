# Running Cabal for your community

Each Cabal server runs one community. To run a second community, make a second deployment with its own Supabase project.

Don't add a second row to `communities` in the same project yet. The Build Cabal board and Today's ship are shared across the whole project, and any community's admins can run them.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the keys from **Project Settings → API** into `.env.local` (see `.env.example`).
3. Copy the **direct** connection string (not the pooler) into `POSTGRES_URL_NON_POOLING`.
4. Run `pnpm db:migrate`. It applies `supabase/migrations/*.sql` in order and records each one in `public.cabal_migrations`, so it's safe to run again after pulling new code.
5. Under **Authentication → Sign In / Providers**, turn off **Allow new users to sign up** and keep **Confirm email** on. This is required. Cabal creates every account itself with the service-role key, which that switch doesn't affect. Left on, anyone can make an account for someone else's email directly with Supabase, with a password of their choosing, wherever Supabase can deliver its own confirmation email. Cabal replaces such an account if it is still unconfirmed when its owner first asks for a code, but not once that confirmation link has been opened, whether by the owner or by a mail scanner.

Cabal uses Supabase for Postgres, Auth, Realtime and Storage. The migrations create the three buckets it needs: `avatars` and `team-images` (public) and `attachments` (private, for photos and videos in messages).

Leave **Realtime → Settings → Allow public access** on. Live messages and presence come through `postgres_changes`, which Realtime already filters through row-level security. Turning public access off would stop those updates. Typing indicators and the other broadcast topics are private either way.

## 2. Your community

Edit `supabase/seed.sql`: the slug, name, description and join policy. Optionally, set `NEXT_PUBLIC_CABAL_MAKERS_TEAM` to the name of the team that builds your Cabal, and it's suggested first to new members. Every community gets the four default rooms (#introductions, #cabal-chat, #launches, #asks) automatically; add any extra rooms in the seed. Then run `pnpm db:seed` and set `NEXT_PUBLIC_CABAL_COMMUNITY` to the same slug.

Join policies:

- `open`: anyone who signs in can join.
- `invite`: people need the community invite link. Admins can copy or rotate it from the admin panel, and rotating it stops the old link working.

## 3. Admins

Put admin emails in `CABAL_ADMIN_EMAILS` (comma-separated). They become admins when they join. Admins can remove people from the community, delete messages in rooms, review reports and change the join policy. Admins **cannot** read private teams or DMs they aren't part of. Reports on those include only the reported message.

## 4. Email

Sign-in uses a one-time code sent by email, with no passwords. Create a [Resend](https://resend.com) API key, verify your sending domain, and set `RESEND_API_KEY` and `CABAL_EMAIL_FROM`.

Requests are rate-limited per email and per IP. How long a code lasts is the **Email OTP expiration** setting under Supabase **Authentication → Providers → Email**.

## 5. Deploy

Any host that runs Next.js works. On Vercel, import the repo, add the environment variables, and deploy. Then set `NEXT_PUBLIC_CABAL_APP_URL` to the public address.

In Supabase, go to **Authentication → URL Configuration** and set the Site URL to the same address.

## 6. Desktop installers

Set the GitHub repository variable `CABAL_APP_URL` to your deployed address and push a tag. See [desktop.md](./desktop.md). Set `NEXT_PUBLIC_CABAL_GITHUB_REPO` so the landing page shows the downloads.

## Upgrading

Pull, then run `pnpm db:migrate` before deploying the new code. It applies every migration you don't have yet, in order. New migrations only add things or replace functions. They never drop your data without saying so in the release notes.

`0018_require_encrypted_dms.sql` makes the server refuse any DM that isn't encrypted. On a new install that's what you want. On an older install, apply it only once the web app you're running encrypts DMs.
