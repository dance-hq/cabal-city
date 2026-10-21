-- A team's welcome note: what they're building, how to help, where to start.
-- Owners write it; it's pinned at the top of the team's conversation and shown
-- in the Teams list so people can see what a team is about before joining.

alter table public.teams
  add column welcome text check (char_length(welcome) <= 1000),
  add column welcome_updated_at timestamptz,
  add column welcome_updated_by uuid references public.profiles (id) on delete set null;

create function public.set_team_welcome(p_team uuid, p_welcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  next_welcome text := nullif(btrim(coalesce(p_welcome, '')), '');
  old_welcome text;
  cid uuid;
  me public.profiles;
begin
  if not public.is_team_owner(p_team) then
    raise exception 'Only team owners can change the welcome note' using errcode = '42501';
  end if;
  if char_length(next_welcome) > 1000 then
    raise exception 'Welcome notes are up to 1,000 characters' using errcode = '22023';
  end if;
  select welcome into old_welcome from public.teams where id = p_team for update;
  if old_welcome is not distinct from next_welcome then return; end if;
  update public.teams
    set welcome = next_welcome,
        welcome_updated_at = case when next_welcome is null then null else now() end,
        welcome_updated_by = case when next_welcome is null then null else auth.uid() end
    where id = p_team;
  -- Only the first note is announced; later edits show up in the pinned note itself.
  if old_welcome is null and next_welcome is not null then
    select * into me from public.profiles where id = auth.uid();
    select id into cid from public.channels where team_id = p_team order by position, created_at limit 1;
    insert into public.messages (channel_id, kind, body)
      values (cid, 'system', me.display_name || ' pinned a welcome note.');
  end if;
end;
$$;

-- Same as before, plus the welcome note.
drop function public.community_teams(uuid);
create function public.community_teams(p_community uuid)
returns table (
  id uuid, name text, visibility text, member_count int, joined boolean,
  last_message_at timestamptz, created_at timestamptz, welcome text
)
language sql stable security definer set search_path = '' as $$
  select
    t.id, t.name, t.visibility,
    (select count(*)::int from public.team_members tm
      join public.community_members m on m.community_id = t.community_id and m.user_id = tm.user_id
      where tm.team_id = t.id and m.banned_at is null),
    exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = auth.uid()),
    (select max(x.created_at) from public.messages x
      join public.channels c on c.id = x.channel_id
      where c.team_id = t.id and x.kind = 'user' and x.deleted_at is null),
    t.created_at,
    t.welcome
  from public.teams t
  where t.community_id = p_community and public.is_member(p_community)
    and (t.visibility = 'public' or public.is_team_member(t.id))
$$;

revoke execute on function public.set_team_welcome(uuid, text) from public, anon;
revoke execute on function public.community_teams(uuid) from public, anon;
grant execute on function public.set_team_welcome(uuid, text) to authenticated;
grant execute on function public.community_teams(uuid) to authenticated;
