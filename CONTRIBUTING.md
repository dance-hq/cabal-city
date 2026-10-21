# Contributing to Cabal

Thanks for helping. A few things keep Cabal trustworthy:

1. **Privacy rules belong in the database.** If a change affects who can see or do something, put it in a new migration (`supabase/migrations/000N_description.sql`) and add a case to `tests/integration/permissions.test.ts`. Hiding a button in the UI isn't a permission.
2. **Never edit an applied migration.** Add a new one. Use `create or replace function` to change a function.
3. **Invisible means invisible.** Don't add anything (typing indicators, read receipts, "last seen") that leaks presence for someone set to invisible.
4. **Keep the desktop shell small.** New bridge calls go through `src/rules.cjs` checks and need a test.

## Build Cabal

Members suggest and back improvements inside the app (sidebar → **Build Cabal**), no GitHub account needed. Maintainers (community admins) link each idea to its GitHub issue or pull request, move it through Requested → Building → Shipped, and write one plain sentence about what changed when it ships. That sentence becomes **Today's ship**. Only post a ship once it's live for members, and never post one just to keep a streak going.

## Before opening a pull request

```bash
pnpm typecheck && pnpm test
cd desktop && npm run check
```

To run the live database tests, point `.env.local` at a Supabase project you don't mind testing against. The tests clean up after themselves, but don't use a community people are actually in.
