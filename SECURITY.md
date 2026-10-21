# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately instead: **[Report a vulnerability](https://github.com/dance-hq/cabal-city/security/advisories/new)** (the repository's Security tab).

Say what you found, how to reproduce it, and what someone could do with it. We'll confirm we got it and keep you posted while we fix it. There's no bug bounty.

## Testing

Test against your own deployment ([docs/self-hosting.md](./docs/self-hosting.md)), not against cabal.city. Never read, change or delete other people's accounts or messages, and don't run anything that slows the service down for others.

## Scope

In scope: this repository's web app, its database rules (`supabase/migrations`) and the desktop app.

Out of scope: the services Cabal runs on (Supabase, Vercel, Resend, GitHub), which have their own programs; spam or social engineering aimed at members; and anything that needs an already compromised device or browser.
