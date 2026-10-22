-- #introductions is the first room people see, #cabal-chat second.
-- Only communities still using the default order are reordered.

create or replace function public.default_rooms()
returns table (room_slug text, room_topic text, room_position int)
language sql
immutable
set search_path = ''
as $$
  select r.slug, r.topic, r.pos
  from (values
    ('introductions', 'New here? Tell people who you are and what you''re building.', 0),
    ('cabal-chat', 'The main hangout. Say what you''re working on.', 1),
    ('launches', 'Shipping something? Share it with the Cabal. Get feedback, support, and a little extra momentum.', 2),
    ('asks', 'Need something? Ask the Cabal. Feedback, introductions, collaborators, or a helping hand.', 3),
    ('irl', 'Get together in the real world. Chicago meetups, coworking, events, and impromptu build sessions.', 4)
  ) as r (slug, topic, pos)
$$;

update public.channels ch
set position = case ch.slug when 'introductions' then 0 else 1 end
where ch.kind = 'room'
  and ch.slug in ('introductions', 'cabal-chat')
  and exists (
    select 1 from public.channels a
    where a.community_id = ch.community_id and a.kind = 'room' and a.slug = 'cabal-chat' and a.position = 0
  )
  and exists (
    select 1 from public.channels b
    where b.community_id = ch.community_id and b.kind = 'room' and b.slug = 'introductions' and b.position = 1
  );
