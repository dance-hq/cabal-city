-- Where someone shows up, for their profile card:
--   * the teams they're on that you're allowed to see (public teams, plus
--     invite-only teams you're on too), with their role;
--   * the channels they've talked in over the last 90 days. Community admins
--     run every channel, so every channel is listed for them.
create function public.member_places(p_community uuid, p_user uuid)
returns table (
  kind text,
  channel_id uuid,
  slug text,
  team_id uuid,
  team_name text,
  visibility text,
  role text,
  joined boolean,
  posts int,
  last_posted_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with target as (
    select m.role from public.community_members m
    where m.community_id = p_community and m.user_id = p_user and m.banned_at is null
      and public.is_member(p_community)
  )
  select 'team', c.id, null::text, t.id, t.name, t.visibility, tm.role, public.is_team_member(t.id), null::int, null::timestamptz
  from public.team_members tm
  join public.teams t on t.id = tm.team_id and t.community_id = p_community
  left join lateral (
    select x.id from public.channels x where x.team_id = t.id order by x.position, x.created_at limit 1
  ) c on true
  where tm.user_id = p_user
    and exists (select 1 from target)
    and (t.visibility = 'public' or public.is_team_member(t.id))
  union all
  select 'room', c.id, c.slug, null, null, null,
    case when (select role from target) = 'admin' then 'admin' end,
    true, a.posts, a.last_posted_at
  from public.channels c
  cross join lateral (
    select count(*)::int as posts, max(x.created_at) as last_posted_at
    from public.messages x
    where x.channel_id = c.id and x.author_id = p_user and x.kind = 'user' and x.deleted_at is null
      and x.created_at > now() - interval '90 days'
  ) a
  where c.community_id = p_community and c.kind = 'room'
    and exists (select 1 from target)
    and ((select role from target) = 'admin' or a.posts > 0)
$$;

revoke execute on function public.member_places(uuid, uuid) from public, anon;
grant execute on function public.member_places(uuid, uuid) to authenticated;
