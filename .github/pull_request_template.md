## What this changes

<!-- One or two plain sentences. Link the Build Cabal idea or issue if there is one. -->

## Checks

- [ ] `pnpm typecheck && pnpm test` pass
- [ ] `cd desktop && npm run check` passes (if `desktop/` changed)
- [ ] Permission changes are in a new migration, with a test in `tests/integration/`
- [ ] `lib/docs.ts` still describes the code correctly
- [ ] Touches sign-in, permissions, encryption, uploads or the desktop shell: went through [the release checklist](../docs/security/release-checklist.md)
