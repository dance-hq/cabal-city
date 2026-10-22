# Security checklist

Short on purpose. Copy it into the release PR and tick it off.

## Every change to `main`

- [ ] CI is green: typecheck, tests, `pnpm audit --prod`, build, desktop checks.
- [ ] The Security workflow is green: CodeQL, plus dependency review on the PR.
- [ ] A new table has row-level security and at least one policy, or a comment saying why it's deny-all.
- [ ] A new `security definer` function sets `search_path = ''` and checks who's calling, wrapped in `coalesce(…, false)`.
- [ ] A new realtime broadcast topic is private and handled in `can_use_topic`. (`postgres_changes` channels can stay public: Realtime filters them through row-level security.)
- [ ] A new POST route that uses the session cookie calls `isCrossSite()` first.
- [ ] Anything that fetches a user-supplied URL goes through `lib/safe-fetch.ts`.
- [ ] Authorization changes come with a case in `tests/integration/authorization.test.ts`.
- [ ] Migrations are applied one file at a time, before the code that needs them merges. Never run `scripts/db.mjs migrate` blind: it applies every unrecorded file.

## Every desktop release

- [ ] Tag from `main` only, after CI and Security are green on that commit.
- [ ] `npm run check` in `desktop/` passes, including the fuse test.
- [ ] The release has `SHA256SUMS.txt`, and `gh attestation verify` passes for one file per platform.
- [ ] Once signing is set up: `spctl -a -vv` (macOS) and `Get-AuthenticodeSignature` (Windows) show the expected publisher.
- [ ] Launch each platform's build once and sign in.

## If something goes wrong

1. **Contain.** Leaked secret: rotate it in Supabase, Vercel or Resend first, then remove it from code. Bad release: delete the release (stops auto-update) and publish a fixed version. Bad deploy: roll back in Vercel.
2. **Look.** Vercel and Supabase logs for the time window. Note what was reachable and by whom.
3. **Tell.** If accounts or messages may have been exposed, tell the people affected, in plain words, as soon as the facts are clear.
4. **Fix and test.** Add a regression test, and write up what happened in a private advisory.
