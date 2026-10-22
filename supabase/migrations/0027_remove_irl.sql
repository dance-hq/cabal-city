-- #irl is gone for now: the Calendar covers meetups and events.
-- New communities get four default rooms. Existing #irl rooms are removed
-- only while nobody has posted in them.

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
    ('asks', 'Need something? Ask the Cabal. Feedback, introductions, collaborators, or a helping hand.', 3)
  ) as r (slug, topic, pos)
$$;

delete from public.channels ch
where ch.kind = 'room'
  and ch.slug = 'irl'
  and not exists (select 1 from public.messages m where m.channel_id = ch.id);
