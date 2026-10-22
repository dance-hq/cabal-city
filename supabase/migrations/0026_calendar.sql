-- Calendar: upcoming events for a community. Admins add events directly;
-- members send theirs in and an admin checks them before they show up.
-- Times are entered and shown in the community's time_zone.

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  host text check (host is null or char_length(host) <= 80),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  venue text not null check (char_length(venue) between 2 and 120),
  url text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 500)),
  summary text check (summary is null or char_length(summary) <= 400),
  status text not null default 'pending' check (status in ('pending', 'published', 'declined', 'archived')),
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_events_live_idx on public.calendar_events (community_id, starts_at) where status = 'published';
create index calendar_events_pending_idx on public.calendar_events (community_id, created_at) where status = 'pending';
create index calendar_events_author_idx on public.calendar_events (submitted_by, created_at desc);
alter table public.calendar_events enable row level security;
-- Read and write through the functions below.

create function public.community_zone(p_community uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select time_zone from public.communities where id = p_community), 'America/Chicago')
$$;

-- Upcoming and happening-now events. An event with no end time counts as
-- three hours long, then drops off.
create function public.calendar_for(p_community uuid)
returns table (
  id uuid, title text, host text, starts_at timestamptz, ends_at timestamptz, venue text, url text,
  summary text, time_zone text
)
language plpgsql stable security definer set search_path = '' as $$
declare tz text := public.community_zone(p_community);
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select e.id, e.title, e.host, e.starts_at, e.ends_at, e.venue, e.url, e.summary, tz
    from public.calendar_events e
    where e.community_id = p_community and e.status = 'published'
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now()
    order by e.starts_at, e.title;
end;
$$;

create function public.clean_event_fields(
  p_title text, p_host text, p_starts timestamp, p_ends timestamp, p_venue text, p_url text, p_summary text
) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Give it a name.' using errcode = '22023';
  end if;
  if p_starts is null then raise exception 'When does it start?' using errcode = '22023'; end if;
  if p_ends is not null and p_ends <= p_starts then
    raise exception 'It has to end after it starts.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_venue, ''))) < 2 then
    raise exception 'Where is it?' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_url, '')), '') is not null and trim(p_url) !~ '^https://[^\s]+\.[^\s]+$' then
    raise exception 'Links need to start with https://' using errcode = '22023';
  end if;
end;
$$;

-- A member sends an event in. It waits for an admin.
create function public.submit_event(
  p_community uuid, p_title text, p_host text, p_starts timestamp, p_ends timestamp,
  p_venue text, p_url text, p_summary text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  tz text := public.community_zone(p_community);
  link text := nullif(trim(coalesce(p_url, '')), '');
  recent integer;
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  perform public.clean_event_fields(p_title, p_host, p_starts, p_ends, p_venue, p_url, p_summary);
  if (p_starts at time zone tz) < now() - interval '1 day' then
    raise exception 'That one already happened.' using errcode = '22023';
  end if;
  if link is not null and exists (
    select 1 from public.calendar_events e
    where e.community_id = p_community and e.status in ('pending', 'published')
      and regexp_replace(lower(e.url), '^https?://(www\.)?|/+$', '', 'g')
        = regexp_replace(lower(link), '^https?://(www\.)?|/+$', '', 'g')
  ) then return 'known'; end if;
  select count(*) into recent from public.calendar_events
    where submitted_by = auth.uid() and created_at > now() - interval '1 day';
  if recent >= 10 then raise exception 'That''s plenty for today. Thank you!' using errcode = 'P0429'; end if;
  insert into public.calendar_events
    (community_id, title, host, starts_at, ends_at, venue, url, summary, status, submitted_by)
    values (
      p_community, trim(p_title), left(nullif(trim(coalesce(p_host, '')), ''), 80), p_starts at time zone tz,
      p_ends at time zone tz, left(trim(p_venue), 120), link, left(nullif(trim(coalesce(p_summary, '')), ''), 400),
      'pending', auth.uid()
    );
  return 'added';
end;
$$;

-- Admins: add (p_id null) or edit an event, or approve a pending one.
-- Saving always publishes.
create function public.save_event(
  p_id uuid, p_community uuid, p_title text, p_host text, p_starts timestamp, p_ends timestamp,
  p_venue text, p_url text, p_summary text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tz text := public.community_zone(p_community);
  out_id uuid;
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  perform public.clean_event_fields(p_title, p_host, p_starts, p_ends, p_venue, p_url, p_summary);
  if p_id is not null then
    update public.calendar_events set
      title = trim(p_title), host = nullif(trim(coalesce(p_host, '')), ''),
      starts_at = p_starts at time zone tz, ends_at = p_ends at time zone tz, venue = trim(p_venue),
      url = nullif(trim(coalesce(p_url, '')), ''), summary = nullif(trim(coalesce(p_summary, '')), ''),
      status = 'published', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
      where id = p_id and community_id = p_community
      returning id into out_id;
    if out_id is null then raise exception 'That event is gone.' using errcode = 'P0002'; end if;
  else
    insert into public.calendar_events
      (community_id, title, host, starts_at, ends_at, venue, url, summary, status, submitted_by, reviewed_by, reviewed_at)
      values (
        p_community, trim(p_title), nullif(trim(coalesce(p_host, '')), ''), p_starts at time zone tz,
        p_ends at time zone tz, trim(p_venue), nullif(trim(coalesce(p_url, '')), ''),
        nullif(trim(coalesce(p_summary, '')), ''), 'published', auth.uid(), auth.uid(), now()
      )
      returning id into out_id;
  end if;
  return out_id;
end;
$$;

-- For the editor and the review list: times come back as wall-clock times in
-- the community's zone, ready for the form.
create function public.event_detail(p_event uuid)
returns table (
  id uuid, title text, host text, starts_local timestamp, ends_local timestamp, venue text, url text,
  summary text, status text, submitted_by uuid, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.calendar_events where calendar_events.id = p_event;
  if not found then return; end if;
  if not public.is_admin(cid) then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select e.id, e.title, e.host, e.starts_at at time zone public.community_zone(cid),
      e.ends_at at time zone public.community_zone(cid), e.venue, e.url, e.summary, e.status, e.submitted_by, e.created_at
    from public.calendar_events e where e.id = p_event;
end;
$$;

create function public.event_review(p_community uuid)
returns table (
  id uuid, title text, host text, starts_at timestamptz, ends_at timestamptz, venue text, url text,
  summary text, submitted_by uuid, created_at timestamptz, time_zone text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select e.id, e.title, e.host, e.starts_at, e.ends_at, e.venue, e.url, e.summary, e.submitted_by, e.created_at,
      public.community_zone(p_community)
    from public.calendar_events e
    where e.community_id = p_community and e.status = 'pending'
    order by e.created_at;
end;
$$;

-- Decline a pending event, or take down a published one.
create function public.remove_event(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.calendar_events where id = p_event;
  if not found then return; end if;
  if not public.is_admin(cid) then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.calendar_events
    set status = case status when 'pending' then 'declined' else 'archived' end,
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_event and status in ('pending', 'published');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'community_zone(uuid)', 'calendar_for(uuid)',
    'clean_event_fields(text, text, timestamp, timestamp, text, text, text)',
    'submit_event(uuid, text, text, timestamp, timestamp, text, text, text)',
    'save_event(uuid, uuid, text, text, timestamp, timestamp, text, text, text)',
    'event_detail(uuid)', 'event_review(uuid)', 'remove_event(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
