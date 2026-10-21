-- Your own groups on your buddy list, AIM-style ("Co-founders", "Night owls").
-- Private: only you can see your groups and who you put in them. Each person
-- sits in at most one of your groups; everyone else stays in Here now / Offline.

create table public.buddy_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint buddy_groups_name check (char_length(name) between 1 and 40 and name = btrim(name)),
  constraint buddy_groups_ref unique (id, owner_id, community_id)
);

create index buddy_groups_by_owner on public.buddy_groups (owner_id, community_id, position);

create table public.buddy_group_members (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null,
  member_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (owner_id, community_id, member_id),
  -- The group has to be yours, in the same community.
  foreign key (group_id, owner_id, community_id)
    references public.buddy_groups (id, owner_id, community_id) on delete cascade,
  constraint buddy_group_members_not_self check (member_id <> owner_id)
);

create index buddy_group_members_by_group on public.buddy_group_members (group_id);

alter table public.buddy_groups enable row level security;
alter table public.buddy_group_members enable row level security;

create policy "buddy groups: your own" on public.buddy_groups
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_member(community_id));

create policy "buddy group members: your own" on public.buddy_group_members
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_member(community_id));

revoke all on public.buddy_groups from anon, authenticated;
revoke all on public.buddy_group_members from anon, authenticated;
grant select, insert, update, delete on public.buddy_groups to authenticated;
grant select, insert, update, delete on public.buddy_group_members to authenticated;

-- Plenty for a buddy list, and keeps one account from filling the table.
create function public.buddy_groups_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.buddy_groups
      where owner_id = new.owner_id and community_id = new.community_id) >= 30 then
    raise exception 'You can have up to 30 groups.' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.buddy_groups_limit() from public, anon, authenticated;

create trigger buddy_groups_limit
  before insert on public.buddy_groups
  for each row execute function public.buddy_groups_limit();
