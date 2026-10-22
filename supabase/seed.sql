-- First community for this deployment. Change these values (and
-- NEXT_PUBLIC_CABAL_COMMUNITY) to run Cabal for your own community.
-- Safe to run more than once.
--
-- The five default rooms (#cabal-chat, #introductions, #launches, #asks, #irl)
-- are added automatically when a community is created; see
-- migrations/0024_default_rooms.sql. Add any extra rooms below.

insert into public.communities (slug, name, description, join_policy)
values (
  'chicago',
  'Chicago AI Cabal',
  'Founders, developers, designers and other people building with AI in Chicago.',
  'open'
)
on conflict (slug) do nothing;
