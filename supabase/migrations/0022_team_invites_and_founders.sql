-- Easier team invites, and teams that say who founded them.
--
-- 1. Anyone on a public team can invite people to it. They could join on
--    their own anyway; an invite just puts it in front of them. Invite-only
--    teams stay owner-only, since an invite there is what grants access.
-- 2. community_teams() also returns each team's owners, so the directory and
--    the "teams to follow" picks can show who started a team before you join
--    (team_members itself is only readable by members).

create or replace function public.invite_to_team(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  recent int;
begin
  select * into t from public.teams where id = p_team;
  if t.id is null then raise exception 'Team not found' using errcode = 'P0002'; end if;
  if not (
    public.is_team_owner(p_team)
    or (t.visibility = 'public' and public.is_team_member(p_team))
  ) then
    raise exception 'Only team owners can invite people to an invite-only team' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_members where community_id = t.community_id and user_id = p_user and banned_at is null
  ) then
    raise exception 'That person is not in this community' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Already on the team' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks where blocker_id = p_user and blocked_id = auth.uid()) then
    return; -- silently ignore invites to people who blocked you
  end if;
  select count(*) into recent from public.team_invites
    where invited_by = auth.uid() and created_at > now() - interval '1 day';
  if recent >= 40 then
    raise exception 'You''ve sent a lot of invites today. Try again tomorrow.' using errcode = '22023';
  end if;
  insert into public.team_invites (team_id, user_id, invited_by) values (p_team, p_user, auth.uid())
    on conflict (team_id, user_id) do nothing;
end;
$$;

drop function public.community_teams(uuid);
create function public.community_teams(p_community uuid)
returns table (
  id uuid, name text, visibility text, member_count int, joined boolean,
  last_message_at timestamptz, created_at timestamptz, welcome text, owner_ids uuid[]
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
    t.welcome,
    coalesce((select array_agg(tm.user_id order by tm.joined_at) from public.team_members tm
      join public.community_members m on m.community_id = t.community_id and m.user_id = tm.user_id
      where tm.team_id = t.id and tm.role = 'owner' and m.banned_at is null), '{}')
  from public.teams t
  where t.community_id = p_community and public.is_member(p_community)
    and (t.visibility = 'public' or public.is_team_member(t.id))
$$;

revoke execute on function public.invite_to_team(uuid, uuid) from public, anon;
revoke execute on function public.community_teams(uuid) from public, anon;
grant execute on function public.invite_to_team(uuid, uuid) to authenticated;
grant execute on function public.community_teams(uuid) to authenticated;
