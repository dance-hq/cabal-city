-- Team rooms are open by default: anyone in the community can find one and
-- join it, like a channel on IRC. Invite-only (private) rooms stay available.
--
-- Teams that already exist were created under the old "only team members can
-- see this channel" promise, so they keep that until an owner opens them up.
-- The defaults stay private so an older app (which tells people their new
-- team is private) never makes a public one; the current app always asks.
alter table public.teams
  add column visibility text not null default 'private' check (visibility in ('public', 'private'));

drop function public.create_team(uuid, text);
create function public.create_team(p_community uuid, p_name text, p_visibility text default 'private') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
  cid uuid;
  owned int;
  me public.profiles;
begin
  if not public.is_member(p_community) then raise exception 'No access' using errcode = '42501'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'Unknown visibility' using errcode = '22023'; end if;
  select count(*) into owned from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid() and tm.role = 'owner' and t.community_id = p_community;
  if owned >= 10 then raise exception 'You already own 10 teams' using errcode = '22023'; end if;
  select * into me from public.profiles where id = auth.uid();
  insert into public.teams (community_id, name, created_by, visibility)
    values (p_community, btrim(p_name), auth.uid(), p_visibility)
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, auth.uid(), 'owner');
  insert into public.channels (community_id, kind, team_id, slug, name)
    values (p_community, 'team', tid, 'general', 'general') returning id into cid;
  insert into public.messages (channel_id, kind, body) values (
    cid, 'system',
    me.display_name || ' started ' || btrim(p_name) || case
      when p_visibility = 'public' then '. Anyone in the community can join.'
      else '. It''s invite-only, so only people on the team can see it.'
    end
  );
  insert into public.channel_reads (user_id, channel_id, last_read_at) values (auth.uid(), cid, now())
    on conflict (user_id, channel_id) do update set last_read_at = excluded.last_read_at;
  return tid;
end;
$$;

-- Join a public team room. Private rooms answer "not found" so their names
-- never leak. Returns the room's channel.
create function public.join_team(p_team uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.teams;
  cid uuid;
  added uuid;
  me public.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into t from public.teams where id = p_team;
  if t.id is null or not public.is_member(t.community_id) then
    raise exception 'Team room not found' using errcode = 'P0002';
  end if;
  select id into cid from public.channels where team_id = t.id order by position, created_at limit 1;
  if exists (select 1 from public.team_members where team_id = t.id and user_id = auth.uid()) then
    return cid;
  end if;
  if t.visibility <> 'public' then raise exception 'Team room not found' using errcode = 'P0002'; end if;
  insert into public.team_members (team_id, user_id, role) values (t.id, auth.uid(), 'member')
    on conflict do nothing returning user_id into added;
  if added is null then return cid; end if;
  delete from public.team_invites where team_id = t.id and user_id = auth.uid();
  select * into me from public.profiles where id = auth.uid();
  insert into public.messages (channel_id, kind, body) values (cid, 'system', me.display_name || ' joined.');
  insert into public.channel_reads (user_id, channel_id, last_read_at) values (auth.uid(), cid, now())
    on conflict (user_id, channel_id) do update set last_read_at = excluded.last_read_at;
  return cid;
end;
$$;

-- Every team room you can see in a community: all public rooms plus the
-- private ones you're in.
create function public.community_teams(p_community uuid)
returns table (
  id uuid, name text, visibility text, member_count int, joined boolean,
  last_message_at timestamptz, created_at timestamptz
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
    t.created_at
  from public.teams t
  where t.community_id = p_community and public.is_member(p_community)
    and (t.visibility = 'public' or public.is_team_member(t.id))
$$;

create function public.set_team_visibility(p_team uuid, p_visibility text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_visibility text;
  cid uuid;
  me public.profiles;
begin
  if not public.is_team_owner(p_team) then
    raise exception 'Only team owners can change who can join' using errcode = '42501';
  end if;
  if p_visibility not in ('public', 'private') then raise exception 'Unknown visibility' using errcode = '22023'; end if;
  select visibility into current_visibility from public.teams where id = p_team;
  if current_visibility = p_visibility then return; end if;
  update public.teams set visibility = p_visibility where id = p_team;
  select * into me from public.profiles where id = auth.uid();
  select id into cid from public.channels where team_id = p_team order by position, created_at limit 1;
  insert into public.messages (channel_id, kind, body) values (
    cid, 'system',
    me.display_name || case
      when p_visibility = 'public' then ' opened this room. Anyone in the community can join and read it.'
      else ' made this room invite-only. Everyone here stays; new people need an invite.'
    end
  );
end;
$$;

-- Same as before, plus each team room's visibility.
drop function public.my_channels(uuid);
create function public.my_channels(p_community uuid)
returns table (
  id uuid, kind text, slug text, name text, topic text, "position" int,
  team_id uuid, team_name text, team_role text, team_visibility text, other_user_id uuid,
  last_message_at timestamptz, last_read_at timestamptz, unread int, muted boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select m.joined_at from public.community_members m
    where m.community_id = p_community and m.user_id = auth.uid() and m.banned_at is null
  ),
  visible as (
    select c.* from public.channels c, me
    where c.community_id = p_community and (
      c.kind = 'room'
      or (c.kind = 'team' and exists (select 1 from public.team_members tm where tm.team_id = c.team_id and tm.user_id = auth.uid()))
      or (c.kind = 'dm' and exists (select 1 from public.dm_participants p where p.channel_id = c.id and p.user_id = auth.uid()))
    )
  )
  select
    v.id, v.kind, v.slug, v.name, v.topic, v.position,
    v.team_id, t.name, tm.role, t.visibility,
    (select p.user_id from public.dm_participants p where p.channel_id = v.id and p.user_id <> auth.uid() limit 1),
    (select max(m.created_at) from public.messages m where m.channel_id = v.id),
    coalesce(r.last_read_at, case when v.kind = 'room' then (select joined_at from me) else '-infinity'::timestamptz end),
    (select count(*)::int from (
      select 1 from public.messages m
      where m.channel_id = v.id and m.deleted_at is null
        and (m.author_id is distinct from auth.uid())
        and m.created_at > coalesce(r.last_read_at, case when v.kind = 'room' then (select joined_at from me) else '-infinity'::timestamptz end)
      limit 100
    ) x),
    coalesce(r.muted, false)
  from visible v
  left join public.teams t on t.id = v.team_id
  left join public.team_members tm on tm.team_id = v.team_id and tm.user_id = auth.uid()
  left join public.channel_reads r on r.channel_id = v.id and r.user_id = auth.uid()
$$;

revoke execute on function public.create_team(uuid, text, text) from public, anon;
revoke execute on function public.join_team(uuid) from public, anon;
revoke execute on function public.community_teams(uuid) from public, anon;
revoke execute on function public.set_team_visibility(uuid, text) from public, anon;
revoke execute on function public.my_channels(uuid) from public, anon;
grant execute on function public.create_team(uuid, text, text) to authenticated;
grant execute on function public.join_team(uuid) to authenticated;
grant execute on function public.community_teams(uuid) to authenticated;
grant execute on function public.set_team_visibility(uuid, text) to authenticated;
grant execute on function public.my_channels(uuid) to authenticated;
