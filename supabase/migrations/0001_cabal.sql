-- Cabal schema: communities, profiles, presence, rooms, DMs, teams, messages.
-- Every table has row level security. Privileged changes go through
-- security definer functions that check auth.uid() themselves.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 280),
  join_policy text not null default 'open' check (join_policy in ('open', 'invite')),
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text check (username ~ '^[A-Za-z0-9_]{2,24}$'),
  display_name text check (char_length(display_name) between 1 and 60),
  avatar_url text check (char_length(avatar_url) <= 500),
  company text check (char_length(company) <= 80),
  bio text check (char_length(bio) <= 280),
  status_text text check (char_length(status_text) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

-- Private per-user settings. Availability lives here (not on the public
-- profile) so nobody can tell that someone is invisible.
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  availability text not null default 'online'
    check (availability in ('online', 'away', 'dnd', 'invisible')),
  notify_dms boolean not null default true,
  notify_mentions boolean not null default true,
  notify_sound boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  banned_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user_idx on public.community_members (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- One table for every conversation: community rooms, team channels, DMs.
-- Teams can have more channels later; the MVP creates one.
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  kind text not null check (kind in ('room', 'team', 'dm')),
  team_id uuid references public.teams (id) on delete cascade,
  slug text check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text check (char_length(name) <= 60),
  topic text check (char_length(topic) <= 200),
  position int not null default 0,
  dm_key text unique,
  created_at timestamptz not null default now(),
  check ((kind = 'team') = (team_id is not null)),
  check ((kind = 'dm') = (dm_key is not null)),
  check (kind = 'dm' or slug is not null)
);
create unique index channels_room_slug_key on public.channels (community_id, slug) where kind = 'room';
create index channels_team_idx on public.channels (team_id);

create table public.dm_participants (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (channel_id, user_id)
);
create index dm_participants_user_idx on public.dm_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'user' check (kind in ('user', 'system')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index messages_author_created_idx on public.messages (author_id, created_at desc);

create table public.channel_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (user_id, channel_id)
);

-- Short-lived presence. One row per open app session, refreshed by a
-- heartbeat. A row older than ~75 seconds means the session is gone
-- (closed, asleep, lost connection). Invisible users have no rows.
create table public.presence_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  availability text not null check (availability in ('online', 'away', 'dnd')),
  room_id uuid references public.channels (id) on delete set null,
  last_seen timestamptz not null default now()
);
create index presence_sessions_community_idx on public.presence_sessions (community_id, last_seen desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  message_excerpt text,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

-- Server-only bookkeeping for sign-in code rate limits. No policies:
-- only the service role can touch it.
create table public.auth_code_requests (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index auth_code_requests_email_idx on public.auth_code_requests (email_hash, created_at desc);
create index auth_code_requests_ip_idx on public.auth_code_requests (ip_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper predicates (security definer so policies can call them without
-- recursing through other tables' policies)
-- ---------------------------------------------------------------------------

create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = cid and m.user_id = auth.uid() and m.banned_at is null
  )
$$;

create function public.is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = cid and m.user_id = auth.uid()
      and m.role = 'admin' and m.banned_at is null
  )
$$;

create function public.shares_community(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members a
    join public.community_members b on b.community_id = a.community_id
    where a.user_id = auth.uid() and a.banned_at is null and b.user_id = other
  )
$$;

create function public.is_team_member(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    join public.community_members m on m.community_id = t.community_id and m.user_id = tm.user_id
    where tm.team_id = tid and tm.user_id = auth.uid() and m.banned_at is null
  )
$$;

create function public.is_team_owner(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = tid and tm.user_id = auth.uid() and tm.role = 'owner'
  ) and public.is_team_member(tid)
$$;

create function public.can_read_channel(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and public.is_member(c.community_id) and (
      c.kind = 'room'
      or (c.kind = 'team' and public.is_team_member(c.team_id))
      or (c.kind = 'dm' and exists (
        select 1 from public.dm_participants p where p.channel_id = c.id and p.user_id = auth.uid()
      ))
    )
  )
$$;

create function public.can_post_channel(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_channel(cid) and not exists (
    select 1 from public.channels c
    join public.dm_participants p on p.channel_id = c.id and p.user_id <> auth.uid()
    join public.blocks b on (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
                         or (b.blocker_id = p.user_id and b.blocked_id = auth.uid())
    where c.id = cid and c.kind = 'dm'
  )
$$;

-- Realtime topics look like "chan:<uuid>". Bad input means no access.
create function public.can_use_topic(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if topic like 'chan:%' then
    return public.can_read_channel(substring(topic from 6)::uuid);
  end if;
  return false;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Clients can't backdate messages, post as "system", or skip rate limits.
create function public.guard_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
begin
  new.created_at := now();
  new.deleted_at := null;
  new.body := btrim(new.body);
  if char_length(new.body) = 0 then
    raise exception 'Message is empty' using errcode = '22023';
  end if;
  if new.kind = 'user' then
    select count(*) into recent from public.messages
      where author_id = new.author_id and created_at > now() - interval '20 seconds';
    if recent >= 15 then
      raise exception 'You are sending messages too quickly. Wait a moment.' using errcode = 'P0429';
    end if;
  end if;
  return new;
end;
$$;

create trigger messages_guard before insert on public.messages
  for each row execute function public.guard_message_insert();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.communities enable row level security;
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.community_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.channels enable row level security;
alter table public.dm_participants enable row level security;
alter table public.messages enable row level security;
alter table public.channel_reads enable row level security;
alter table public.presence_sessions enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.auth_code_requests enable row level security;

-- Communities: name/slug are public (the landing page shows them). The
-- invite code is hidden by column privileges below.
create policy communities_select on public.communities for select using (true);

-- Profiles: you, and anyone you share a community with.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_community(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy settings_select on public.user_settings for select to authenticated
  using (user_id = auth.uid());
create policy settings_update on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Memberships are visible to fellow members. Joining, roles and bans only
-- happen through functions.
create policy members_select on public.community_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(community_id));

create policy teams_select on public.teams for select to authenticated
  using (
    public.is_team_member(id)
    or exists (select 1 from public.team_invites i where i.team_id = id and i.user_id = auth.uid())
  );

create policy team_members_select on public.team_members for select to authenticated
  using (public.is_team_member(team_id));

create policy team_invites_select on public.team_invites for select to authenticated
  using (user_id = auth.uid() or public.is_team_owner(team_id));

create policy channels_select on public.channels for select to authenticated
  using (public.can_read_channel(id));

create policy dm_participants_select on public.dm_participants for select to authenticated
  using (public.can_read_channel(channel_id));

create policy messages_select on public.messages for select to authenticated
  using (public.can_read_channel(channel_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and kind = 'user' and public.can_post_channel(channel_id));

create policy reads_select on public.channel_reads for select to authenticated
  using (user_id = auth.uid());

create policy presence_select on public.presence_sessions for select to authenticated
  using (public.is_member(community_id));

create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin(community_id));

-- Column privileges: nobody reads invite codes directly.
revoke select on public.communities from anon, authenticated;
grant select (id, slug, name, description, join_policy, created_at) on public.communities to anon, authenticated;

-- Profiles: users may edit only these columns.
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name, avatar_url, company, bio, status_text) on public.profiles to authenticated;

revoke update on public.user_settings from anon, authenticated;
grant update (notify_dms, notify_mentions, notify_sound) on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Join a community. Open communities accept anyone signed in; invite-only
-- communities need the current invite code. Requires a finished profile.
create function public.join_community(p_slug text, p_code text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.communities;
  me public.profiles;
  existing public.community_members;
  lobby uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into c from public.communities where slug = p_slug;
  if c.id is null then raise exception 'Community not found' using errcode = 'P0002'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.username is null or me.display_name is null then
    raise exception 'Finish your profile first' using errcode = '22023';
  end if;
  select * into existing from public.community_members where community_id = c.id and user_id = auth.uid();
  if existing.user_id is not null then
    if existing.banned_at is not null then
      raise exception 'You can no longer join this community' using errcode = '42501';
    end if;
    return c.id;
  end if;
  if c.join_policy = 'invite' and (p_code is null or p_code <> c.invite_code) then
    raise exception 'This community is invite-only. Ask a member for an invite link.' using errcode = '42501';
  end if;
  insert into public.community_members (community_id, user_id) values (c.id, auth.uid());
  select id into lobby from public.channels
    where community_id = c.id and kind = 'room' order by position, created_at limit 1;
  if lobby is not null then
    insert into public.messages (channel_id, author_id, kind, body)
      values (lobby, null, 'system', me.display_name || ' (@' || me.username || ') joined.');
  end if;
  return c.id;
end;
$$;

-- Invite code is only for members to share.
create function public.community_invite_code(p_community uuid) returns text
language sql stable security definer set search_path = '' as $$
  select invite_code from public.communities where id = p_community and public.is_member(id)
$$;

create function public.open_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  community uuid;
  k text;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_other = auth.uid() then raise exception 'You cannot message yourself' using errcode = '22023'; end if;
  select a.community_id into community from public.community_members a
    join public.community_members b on b.community_id = a.community_id
    where a.user_id = auth.uid() and a.banned_at is null and b.user_id = p_other and b.banned_at is null
    limit 1;
  if community is null then raise exception 'That person is not in your community' using errcode = '42501'; end if;
  k := least(auth.uid()::text, p_other::text) || ':' || greatest(auth.uid()::text, p_other::text);
  select id into cid from public.channels where dm_key = k;
  if cid is null then
    insert into public.channels (community_id, kind, dm_key) values (community, 'dm', k)
      on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from public.channels where dm_key = k; end if;
    insert into public.dm_participants (channel_id, user_id) values (cid, auth.uid()), (cid, p_other)
      on conflict do nothing;
  end if;
  return cid;
end;
$$;

-- Everything in the sidebar for one community, with unread counts.
create function public.my_channels(p_community uuid)
returns table (
  id uuid, kind text, slug text, name text, topic text, "position" int,
  team_id uuid, team_name text, team_role text, other_user_id uuid,
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
    v.team_id, t.name, tm.role,
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

create function public.mark_read(p_channel uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_channel(p_channel) then raise exception 'No access' using errcode = '42501'; end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at) values (auth.uid(), p_channel, now())
    on conflict (user_id, channel_id) do update set last_read_at = now();
end;
$$;

create function public.set_muted(p_channel uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_read_channel(p_channel) then raise exception 'No access' using errcode = '42501'; end if;
  insert into public.channel_reads (user_id, channel_id, last_read_at, muted)
    values (auth.uid(), p_channel, now(), p_muted)
    on conflict (user_id, channel_id) do update set muted = p_muted;
end;
$$;

-- Presence ------------------------------------------------------------------

-- Called every ~25s by each open app session. The server stamps the time,
-- so a client can't keep itself "online" forever.
create function public.presence_heartbeat(p_session uuid, p_community uuid, p_room uuid default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  avail text;
  room uuid := null;
begin
  if not public.is_member(p_community) then raise exception 'No access' using errcode = '42501'; end if;
  select availability into avail from public.user_settings where user_id = auth.uid();
  delete from public.presence_sessions where last_seen < now() - interval '10 minutes';
  if avail = 'invisible' then
    delete from public.presence_sessions where user_id = auth.uid();
    return now();
  end if;
  if p_room is not null and exists (
    select 1 from public.channels where id = p_room and kind = 'room' and community_id = p_community
  ) then
    room := p_room;
  end if;
  insert into public.presence_sessions (id, user_id, community_id, availability, room_id, last_seen)
    values (p_session, auth.uid(), p_community, coalesce(avail, 'online'), room, now())
    on conflict (id) do update
      set availability = excluded.availability, room_id = excluded.room_id, last_seen = now()
      where public.presence_sessions.user_id = auth.uid();
  return now();
end;
$$;

create function public.presence_leave(p_session uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.presence_sessions where id = p_session and user_id = auth.uid()
$$;

create function public.set_availability(p_availability text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_availability not in ('online', 'away', 'dnd', 'invisible') then
    raise exception 'Unknown availability' using errcode = '22023';
  end if;
  update public.user_settings set availability = p_availability, updated_at = now() where user_id = auth.uid();
  if p_availability = 'invisible' then
    delete from public.presence_sessions where user_id = auth.uid();
  else
    update public.presence_sessions set availability = p_availability, last_seen = now() where user_id = auth.uid();
  end if;
end;
$$;

-- Teams ---------------------------------------------------------------------

create function public.create_team(p_community uuid, p_name text) returns uuid
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
  return tid;
end;
$$;

create function public.invite_to_team(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  community uuid;
begin
  if not public.is_team_owner(p_team) then raise exception 'Only team owners can invite' using errcode = '42501'; end if;
  select community_id into community from public.teams where id = p_team;
  if not exists (
    select 1 from public.community_members where community_id = community and user_id = p_user and banned_at is null
  ) then
    raise exception 'That person is not in this community' using errcode = '22023';
  end if;
  if exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Already on the team' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks where blocker_id = p_user and blocked_id = auth.uid()) then
    return; -- silently ignore invites to people who blocked you
  end if;
  insert into public.team_invites (team_id, user_id, invited_by) values (p_team, p_user, auth.uid())
    on conflict (team_id, user_id) do nothing;
end;
$$;

create function public.respond_team_invite(p_invite uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.team_invites;
  cid uuid;
  me public.profiles;
begin
  select * into inv from public.team_invites where id = p_invite and user_id = auth.uid();
  if inv.id is null then raise exception 'Invite not found' using errcode = 'P0002'; end if;
  delete from public.team_invites where id = inv.id;
  if not p_accept then return null; end if;
  insert into public.team_members (team_id, user_id, role) values (inv.team_id, auth.uid(), 'member')
    on conflict do nothing;
  select * into me from public.profiles where id = auth.uid();
  select id into cid from public.channels where team_id = inv.team_id order by position, created_at limit 1;
  if cid is not null then
    insert into public.messages (channel_id, kind, body) values (cid, 'system', me.display_name || ' joined the team.');
  end if;
  return inv.team_id;
end;
$$;

create function public.cancel_team_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid;
begin
  select team_id into tid from public.team_invites where id = p_invite;
  if tid is null or not public.is_team_owner(tid) then raise exception 'No access' using errcode = '42501'; end if;
  delete from public.team_invites where id = p_invite;
end;
$$;

-- Owners remove others; anyone can remove themselves (leave). The last
-- owner can't leave a team that still has members.
create function public.remove_team_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owners int;
  others int;
  cid uuid;
  them public.profiles;
begin
  if p_user <> auth.uid() and not public.is_team_owner(p_team) then
    raise exception 'Only team owners can remove members' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then return; end if;
  select count(*) into owners from public.team_members where team_id = p_team and role = 'owner' and user_id <> p_user;
  select count(*) into others from public.team_members where team_id = p_team and user_id <> p_user;
  if owners = 0 and others > 0 then
    raise exception 'Make someone else an owner before leaving' using errcode = '22023';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  if others = 0 then
    delete from public.teams where id = p_team;
    return;
  end if;
  select * into them from public.profiles where id = p_user;
  select id into cid from public.channels where team_id = p_team order by position, created_at limit 1;
  insert into public.messages (channel_id, kind, body) values (
    cid, 'system',
    them.display_name || case when p_user = auth.uid() then ' left the team.' else ' was removed from the team.' end
  );
end;
$$;

create function public.set_team_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_team_owner(p_team) then raise exception 'Only team owners can change roles' using errcode = '42501'; end if;
  if p_role not in ('owner', 'member') then raise exception 'Unknown role' using errcode = '22023'; end if;
  if p_role = 'member' and not exists (
    select 1 from public.team_members where team_id = p_team and role = 'owner' and user_id <> p_user
  ) then
    raise exception 'A team needs at least one owner' using errcode = '22023';
  end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
end;
$$;

-- Moderation ----------------------------------------------------------------

create function public.delete_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.channels;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null then raise exception 'Message not found' using errcode = 'P0002'; end if;
  select * into c from public.channels where id = m.channel_id;
  if not (
    (m.author_id = auth.uid() and public.can_read_channel(c.id))
    or (c.kind = 'room' and public.is_admin(c.community_id))
  ) then
    raise exception 'You can only delete your own messages' using errcode = '42501';
  end if;
  update public.messages set deleted_at = now(), body = 'deleted' where id = p_message;
end;
$$;

create function public.report_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.channels;
  recent int;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null or not public.can_read_channel(m.channel_id) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  select count(*) into recent from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many reports. Try again later.' using errcode = 'P0429'; end if;
  select * into c from public.channels where id = m.channel_id;
  -- The excerpt lets admins act on DM/team reports without reading the channel.
  insert into public.reports (community_id, reporter_id, reported_user_id, message_id, message_excerpt, reason)
    values (c.community_id, auth.uid(), m.author_id, m.id, left(m.body, 500), left(btrim(p_reason), 500));
end;
$$;

create function public.report_user(p_community uuid, p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
begin
  if not public.is_member(p_community) then raise exception 'No access' using errcode = '42501'; end if;
  select count(*) into recent from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many reports. Try again later.' using errcode = 'P0429'; end if;
  insert into public.reports (community_id, reporter_id, reported_user_id, reason)
    values (p_community, auth.uid(), p_user, left(btrim(p_reason), 500));
end;
$$;

create function public.resolve_report(p_report uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  select community_id into cid from public.reports where id = p_report;
  if cid is null or not public.is_admin(cid) then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.reports set resolved_at = now(), resolved_by = auth.uid() where id = p_report;
end;
$$;

create function public.set_member_banned(p_community uuid, p_user uuid, p_banned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot ban yourself' using errcode = '22023'; end if;
  update public.community_members
    set banned_at = case when p_banned then now() else null end
    where community_id = p_community and user_id = p_user and role <> 'admin';
  if p_banned then
    delete from public.presence_sessions where user_id = p_user and community_id = p_community;
  end if;
end;
$$;

create function public.set_join_policy(p_community uuid, p_policy text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  if p_policy not in ('open', 'invite') then raise exception 'Unknown policy' using errcode = '22023'; end if;
  update public.communities set join_policy = p_policy where id = p_community;
end;
$$;

create function public.rotate_invite_code(p_community uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.communities set invite_code = code where id = p_community;
  return code;
end;
$$;

-- Only expose the functions the app needs to signed-in users.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.guard_message_insert() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Database changes stream to subscribers through RLS: you only receive
-- message rows you are allowed to select.
alter publication supabase_realtime add table
  public.messages, public.presence_sessions, public.profiles,
  public.user_settings, public.team_invites, public.channel_reads;

-- Private broadcast channels (typing indicators) are named "chan:<id>".
create policy cabal_realtime_select on realtime.messages for select to authenticated
  using (public.can_use_topic(realtime.topic()));
create policy cabal_realtime_insert on realtime.messages for insert to authenticated
  with check (public.can_use_topic(realtime.topic()));

-- ---------------------------------------------------------------------------
-- Avatars: public images, each user writes only inside their own folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
