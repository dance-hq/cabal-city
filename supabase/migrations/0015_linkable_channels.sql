-- Channels you can point people to from a message: every room in the
-- community, every public team, and the invite-only teams you're on.
-- Messages store links as <#channel-id>, so a rename never breaks an old
-- link and an invite-only team's name is only shown to people on it.

create or replace function public.linkable_channels(p_community uuid)
returns table (
  id uuid,
  kind text,
  slug text,
  team_id uuid,
  team_name text,
  team_visibility text,
  joined boolean,
  member_count int,
  welcome text
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.kind, c.slug, c.team_id, t.name, t.visibility,
    c.kind = 'room' or public.is_team_member(c.team_id),
    case when c.kind = 'team' then (
      select count(*)::int from public.team_members tm
      join public.community_members m on m.community_id = t.community_id and m.user_id = tm.user_id
      where tm.team_id = t.id and m.banned_at is null
    ) end,
    t.welcome
  from public.channels c
  left join public.teams t on t.id = c.team_id
  where c.community_id = p_community
    and public.is_member(p_community)
    and (
      c.kind = 'room'
      or (c.kind = 'team' and t.community_id = p_community and (t.visibility = 'public' or public.is_team_member(t.id)))
    )
  order by c.kind = 'team', c."position", lower(coalesce(t.name, c.slug))
$$;

revoke all on function public.linkable_channels(uuid) from public, anon;
grant execute on function public.linkable_channels(uuid) to authenticated;
