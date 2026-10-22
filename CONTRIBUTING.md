# Contributing to Cabal

Thanks for helping. Everyone taking part follows the [code of conduct](./CODE_OF_CONDUCT.md).

A few things keep Cabal trustworthy:

1. **Privacy rules belong in the database.** If a change affects who can see or do something, put it in a new migration (`supabase/migrations/000N_description.sql`). Add a case to `tests/integration/permissions.test.ts`, and, if it's a new function people can call, a "someone else tries this" case to `tests/integration/authorization.test.ts`. Hiding a button in the UI isn't a permission.
2. **Never edit an applied migration.** Add a new one. Use `create or replace function` to change a function. Wrap permission checks in `coalesce(…, false)` so a missing row means no.
3. **The server never reads DMs.** DM text and files are encrypted on the device. Don't add features that need the server to see them, such as link previews, search or notification text with the message in it.
4. **Invisible means invisible.** Don't add anything (typing indicators, read receipts, "last seen") that leaks presence for someone set to invisible.
5. **Keep the desktop shell small.** New bridge calls go through `src/rules.cjs` checks and need a test.
6. **Keep the docs page honest.** If you change something `lib/docs.ts` describes, update it in the same pull request. `tests/unit/docs.test.ts` will tell you.

## Build Cabal

Members suggest and back improvements inside the app (sidebar → **Build Cabal**), no GitHub account needed. Maintainers (community admins) link each idea to its GitHub issue or pull request, move it through Requested → Building → Shipped, and write one plain sentence about what changed when it ships. That sentence becomes **Today's ship**. Only post a ship once it's live for members, and never post one just to keep a streak going.

## Before opening a pull request

```bash
pnpm typecheck && pnpm test
cd desktop && npm run check
```

To run the live database tests, point `.env.local` at a Supabase project you don't mind testing against. The tests clean up after themselves, but don't use a community people are actually in.

Changes to sign-in, permissions, encryption, file uploads or the desktop shell: also go through [docs/security/release-checklist.md](./docs/security/release-checklist.md).
