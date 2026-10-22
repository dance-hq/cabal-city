-- Five default rooms, each with its own reason to exist. Every community gets
-- them: existing ones below, new ones from the trigger. Rooms are open to every
-- member, so nobody has to join them, and empty rooms never count as unread.
-- Rooms a community already has (by slug) are left exactly as they are.

create or replace function public.default_rooms()
returns table (room_slug text, room_topic text, room_position int)
language sql
immutable
set search_path = ''
as $$
  select r.slug, r.topic, r.pos
  from (values
    ('cabal-chat', 'The main hangout. Say what you''re working on.', 0),
    ('introductions', 'New here? Tell people who you are and what you''re building.', 1),
    ('launches', 'Shipping something? Share it with the Cabal. Get feedback, support, and a little extra momentum.', 2),
    ('asks', 'Need something? Ask the Cabal. Feedback, introductions, collaborators, or a helping hand.', 3),
    ('irl', 'Get together in the real world. Chicago meetups, coworking, events, and impromptu build sessions.', 4)
  ) as r (slug, topic, pos)
$$;

create or replace function public.add_default_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.channels (community_id, kind, slug, name, topic, position)
  select new.id, 'room', d.room_slug, d.room_slug, d.room_topic, d.room_position
  from public.default_rooms() d
  on conflict (community_id, slug) where kind = 'room' do nothing;
  return new;
end;
$$;

revoke all on function public.default_rooms() from public, anon, authenticated;
revoke all on function public.add_default_rooms() from public, anon, authenticated;

drop trigger if exists communities_default_rooms on public.communities;
create trigger communities_default_rooms
  after insert on public.communities
  for each row execute function public.add_default_rooms();

insert into public.channels (community_id, kind, slug, name, topic, position)
select c.id, 'room', d.room_slug, d.room_slug, d.room_topic, d.room_position
from public.communities c
cross join public.default_rooms() d
on conflict (community_id, slug) where kind = 'room' do nothing;
