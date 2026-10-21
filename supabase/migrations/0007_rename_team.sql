-- Team owners can rename their team. Everyone in it sees a short note in the
-- conversation, same as when it's opened up or made invite-only.

create function public.rename_team(p_team uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  new_name text := btrim(coalesce(p_name, ''));
  old_name text;
  cid uuid;
  me public.profiles;
begin
  if not public.is_team_owner(p_team) then
    raise exception 'Only team owners can rename the team' using errcode = '42501';
  end if;
  if char_length(new_name) not between 2 and 60 then
    raise exception 'Team names are 2 to 60 characters' using errcode = '22023';
  end if;
  select name into old_name from public.teams where id = p_team for update;
  if old_name = new_name then return; end if;
  update public.teams set name = new_name where id = p_team;
  select * into me from public.profiles where id = auth.uid();
  select id into cid from public.channels where team_id = p_team order by position, created_at limit 1;
  insert into public.messages (channel_id, kind, body)
    values (cid, 'system', me.display_name || ' renamed the team to ' || new_name || '.');
end;
$$;

-- Same as before; only the wording of the note changes ("room" is now "team").
create or replace function public.set_team_visibility(p_team uuid, p_visibility text) returns void
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
      when p_visibility = 'public' then ' made this team public. Anyone in the community can join and read it.'
      else ' made this team invite-only. Everyone here stays; new people need an invite.'
    end
  );
end;
$$;

revoke execute on function public.rename_team(uuid, text) from public, anon;
grant execute on function public.rename_team(uuid, text) to authenticated;
