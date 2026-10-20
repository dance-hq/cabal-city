-- The person who creates a team has already "read" its opening notice.
create or replace function public.create_team(p_community uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
  cid uuid;
  owned int;
  me public.profiles;
begin
  if not public.is_member(p_community) then raise exception 'No access' using errcode = '42501'; end if;
  select count(*) into owned from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.user_id = auth.uid() and tm.role = 'owner' and t.community_id = p_community;
  if owned >= 10 then raise exception 'You already own 10 teams' using errcode = '22023'; end if;
  select * into me from public.profiles where id = auth.uid();
  insert into public.teams (community_id, name, created_by) values (p_community, btrim(p_name), auth.uid())
    returning id into tid;
  insert into public.team_members (team_id, user_id, role) values (tid, auth.uid(), 'owner');
  insert into public.channels (community_id, kind, team_id, slug, name)
    values (p_community, 'team', tid, 'general', 'general') returning id into cid;
  insert into public.messages (channel_id, kind, body)
    values (cid, 'system', me.display_name || ' created ' || btrim(p_name) || '. Only team members can see this channel.');
  insert into public.channel_reads (user_id, channel_id, last_read_at) values (auth.uid(), cid, now())
    on conflict (user_id, channel_id) do update set last_read_at = excluded.last_read_at;
  return tid;
end;
$$;
