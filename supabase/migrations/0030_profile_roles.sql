-- Roles are optional and you can have more than one: founder, builder,
-- investor, in any combination (or none). Picked in Settings → Profile,
-- no longer at sign-up.
alter table public.profiles
  add column identities text[] not null default '{}'
    check (identities <@ array['founder', 'builder', 'investor']::text[] and cardinality(identities) <= 3);

update public.profiles set identities = array[identity] where identity is not null;

grant update (identities) on public.profiles to authenticated;

-- The old single `identity` column follows the list (its first role), and an
-- older client that still writes `identity` updates the list, so both stay in
-- step while deploys roll over.
create or replace function public.sync_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(new.identities) = 0 and new.identity is not null then
      new.identities := array[new.identity];
    else
      new.identity := new.identities[1];
    end if;
  elsif new.identities is distinct from old.identities then
    new.identity := new.identities[1];
  elsif new.identity is distinct from old.identity then
    new.identities := case when new.identity is null then '{}'::text[] else array[new.identity] end;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_identity
  before insert or update on public.profiles
  for each row execute function public.sync_profile_identity();
