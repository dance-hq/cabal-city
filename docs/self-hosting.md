# Running Cabal for your community

Each Cabal server runs one community. Running a second community means a second deployment with its own Supabase project, or a second row in `communities` with its own `NEXT_PUBLIC_CABAL_COMMUNITY`.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the keys from **Project Settings → API** into `.env.local` (see `.env.example`).
3. Copy the **direct** connection string (not the pooler) into `POSTGRES_URL_NON_POOLING`.
4. Run `pnpm db:migrate`. It applies `supabase/migrations/*.sql` in order and records each one in `public.cabal_migrations`, so it's safe to run again after pulling new code.
5. Under **Authentication → Sign In / Providers**, turn off **Allow new users to sign up** and keep **Confirm email** on. This is required. Cabal creates every account itself with the service-role key, which that switch doesn't affect. Left on, anyone can make an account for someone else's email directly with Supabase, with a password of their choosing. Cabal replaces such an account if it is still unconfirmed when its owner first asks for a code, but not once Supabase's own confirmation email has been clicked.

Cabal uses Supabase only for Postgres, Auth and Realtime. It doesn't need Storage buckets beyond the `avatars` bucket the migration creates.

## 2. Your community

Edit `supabase/seed.sql`: the slug, name, description, join policy and starting rooms. Then run `pnpm db:seed` and set `NEXT_PUBLIC_CABAL_COMMUNITY` to the same slug.

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

Pull, then run `pnpm db:migrate` before deploying the new code. New migrations only add things or replace functions. They never drop your data without saying so in the release notes.
