-- First community for this deployment. Change these values (and
-- NEXT_PUBLIC_CABAL_COMMUNITY) to run Cabal for your own community.
-- Safe to run more than once.
--
-- The four default rooms (#introductions, #cabal-chat, #launches, #asks)
-- are added automatically when a community is created; see
-- public.default_rooms() (latest in migrations/0027_remove_irl.sql). Add any extra rooms below.

insert into public.communities (slug, name, description, join_policy)
values (
  'chicago',
  'Chicago AI Cabal',
  'Founders, developers, designers and other people building with AI in Chicago.',
  'open'
)
on conflict (slug) do nothing;
