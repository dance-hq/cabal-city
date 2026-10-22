-- A logo and a banner for each team.
--
-- Owners upload them into the public `team-images` bucket under the team's own
-- folder (`<team id>/<file>`). The browser redraws every picture first, so what
-- lands here is a plain WebP/PNG/JPG with no camera or location data.
-- set_team_image only accepts a file that really is in that team's folder, so a
-- team can't point its logo at someone else's file or at another site.

alter table public.teams
  add column logo_url text,
  add column banner_url text;

alter table public.teams add constraint teams_logo_own_bucket
  check (logo_url is null or logo_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/team-images/' || id::text || '/[A-Za-z0-9._-]+$'));
alter table public.teams add constraint teams_banner_own_bucket
  check (banner_url is null or banner_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/team-images/' || id::text || '/[A-Za-z0-9._-]+$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-images', 'team-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- The folder name decides the team. Checked step by step so a folder that isn't
-- a team id is simply refused instead of failing the cast.
create function public.can_edit_team_image(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := (storage.foldername(p_name))[1];
begin
  if folder is null or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_team_owner(folder::uuid);
end;
$$;

create policy team_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'team-images' and public.can_edit_team_image(name));
create policy team_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'team-images' and public.can_edit_team_image(name));

create function public.set_team_image(p_team uuid, p_kind text, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  next_url text := nullif(btrim(coalesce(p_url, '')), '');
  object_name text;
begin
  if not public.is_team_owner(p_team) then
    raise exception 'Only team owners can change the logo or banner' using errcode = '42501';
  end if;
  if p_kind not in ('logo', 'banner') then
    raise exception 'Pick logo or banner' using errcode = '22023';
  end if;
  if next_url is not null then
    object_name := substring(next_url from '/storage/v1/object/public/team-images/(.+)$');
    if object_name is null or (storage.foldername(object_name))[1] <> p_team::text
      or not exists (select 1 from storage.objects o where o.bucket_id = 'team-images' and o.name = object_name) then
      raise exception 'Upload the picture again' using errcode = '22023';
    end if;
  end if;
  if p_kind = 'logo' then
    update public.teams set logo_url = next_url where id = p_team;
  else
    update public.teams set banner_url = next_url where id = p_team;
  end if;
end;
$$;

-- Same as before, plus each team's logo for the sidebar and headers.
drop function public.my_channels(uuid);
create function public.my_channels(p_community uuid)
returns table (
  id uuid, kind text, slug text, name text, topic text, "position" int,
  team_id uuid, team_name text, team_role text, team_visibility text, other_user_id uuid,
  last_message_at timestamptz, last_read_at timestamptz, unread int, muted boolean,
  team_logo_url text
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
    coalesce(r.muted, false),
    t.logo_url
  from visible v
  left join public.teams t on t.id = v.team_id
  left join public.team_members tm on tm.team_id = v.team_id and tm.user_id = auth.uid()
  left join public.channel_reads r on r.channel_id = v.id and r.user_id = auth.uid()
$$;

-- Same as before, plus logo and banner so the Teams list can show them before you join.
drop function public.community_teams(uuid);
create function public.community_teams(p_community uuid)
returns table (
  id uuid, name text, visibility text, member_count int, joined boolean,
  last_message_at timestamptz, created_at timestamptz, welcome text, owner_ids uuid[],
  logo_url text, banner_url text
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
      where tm.team_id = t.id and tm.role = 'owner' and m.banned_at is null), '{}'),
    t.logo_url,
    t.banner_url
  from public.teams t
  where t.community_id = p_community and public.is_member(p_community)
    and (t.visibility = 'public' or public.is_team_member(t.id))
$$;

revoke execute on function public.can_edit_team_image(text) from public, anon;
revoke execute on function public.set_team_image(uuid, text, text) from public, anon;
revoke execute on function public.my_channels(uuid) from public, anon;
revoke execute on function public.community_teams(uuid) from public, anon;
grant execute on function public.can_edit_team_image(text) to authenticated;
grant execute on function public.set_team_image(uuid, text, text) to authenticated;
grant execute on function public.my_channels(uuid) to authenticated;
grant execute on function public.community_teams(uuid) to authenticated;
