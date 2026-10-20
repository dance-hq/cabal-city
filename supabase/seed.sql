-- First community for this deployment. Change these values (and
-- NEXT_PUBLIC_CABAL_COMMUNITY) to run Cabal for your own community.
-- Safe to run more than once.

insert into public.communities (slug, name, description, join_policy)
values (
  'chicago',
  'Chicago AI Cabal',
  'Founders, developers, designers and other people building with AI in Chicago.',
  'open'
)
on conflict (slug) do nothing;

insert into public.channels (community_id, kind, slug, name, topic, position)
select c.id, 'room', r.slug, r.slug, r.topic, r.position
from public.communities c
cross join (values
  ('lobby', 'The main hangout. Say what you''re working on.', 0),
  ('introductions', 'New here? Tell people who you are and what you''re building.', 1)
) as r (slug, topic, position)
where c.slug = 'chicago'
on conflict do nothing;
