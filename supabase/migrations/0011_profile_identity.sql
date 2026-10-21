-- How someone describes themselves: founder, builder or investor. Picked when
-- they join; people who joined earlier can pick one in Settings, so it stays
-- optional at the database level.
alter table public.profiles
  add column identity text check (identity in ('founder', 'builder', 'investor'));

grant update (identity) on public.profiles to authenticated;
