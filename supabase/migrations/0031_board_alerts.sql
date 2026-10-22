-- Opportunities and Calendar behave like channels in the sidebar: a count of
-- what's new since you last looked, and a bell to mute them. Everyone starts
-- "caught up", so nothing old shows up as new.
alter table public.user_settings
  add column opportunities_seen_at timestamptz not null default now(),
  add column calendar_seen_at timestamptz not null default now(),
  add column opportunities_muted boolean not null default false,
  add column calendar_muted boolean not null default false;

-- Seen times are only moved by mark_board_seen() (server clock).
grant update (opportunities_muted, calendar_muted) on public.user_settings to authenticated;

-- When an event first went up on the calendar. Editing it later doesn't make it new again.
alter table public.calendar_events add column published_at timestamptz;
update public.calendar_events set published_at = coalesce(reviewed_at, created_at) where status = 'published';

create function public.stamp_event_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger calendar_events_published
  before insert or update on public.calendar_events
  for each row execute function public.stamp_event_published();

-- The lists also say when each item was added and whether it's yours, so the
-- page can tag what's new. Same rows and order as before.
drop function public.opportunities_for(uuid);
create function public.opportunities_for(p_community uuid)
returns table(
  id uuid, community_id uuid, kind text, title text, provider text, summary text, eligibility text, place text,
  deadline date, url text, audiences text[], verified_at date, saved boolean, added_at timestamptz, mine boolean
)
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select o.id, o.community_id, o.kind, o.title, o.provider, o.summary, o.eligibility, o.place, o.deadline,
      o.url, o.audiences, o.verified_at,
      exists (select 1 from public.opportunity_saves s where s.opportunity_id = o.id and s.user_id = auth.uid()),
      o.created_at,
      coalesce(o.created_by = auth.uid(), false)
    from public.opportunities o
    where o.status = 'published'
      and (o.community_id is null or o.community_id = p_community)
      and (o.deadline is null or o.deadline >= (now() at time zone 'America/Chicago')::date)
    order by o.deadline nulls last, o.verified_at desc;
end;
$$;

drop function public.calendar_for(uuid);
create function public.calendar_for(p_community uuid)
returns table(
  id uuid, title text, host text, starts_at timestamptz, ends_at timestamptz, venue text, url text, summary text,
  time_zone text, added_at timestamptz, mine boolean
)
language plpgsql
stable security definer
set search_path = ''
as $$
declare tz text := public.community_zone(p_community);
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select e.id, e.title, e.host, e.starts_at, e.ends_at, e.venue, e.url, e.summary, tz,
      e.published_at,
      coalesce(e.submitted_by = auth.uid(), false)
    from public.calendar_events e
    where e.community_id = p_community and e.status = 'published'
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now()
    order by e.starts_at, e.title;
end;
$$;

-- How many things went up since you last looked (not counting your own).
create function public.board_news(p_community uuid)
returns table(new_opportunities int, new_events int)
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  opp_seen timestamptz;
  cal_seen timestamptz;
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  select s.opportunities_seen_at, s.calendar_seen_at into opp_seen, cal_seen
    from public.user_settings s where s.user_id = auth.uid();
  return query select
    (select count(*)::int from public.opportunities_for(p_community) o
      where not o.mine and o.added_at > coalesce(opp_seen, now())),
    (select count(*)::int from public.calendar_for(p_community) e
      where not e.mine and e.added_at > coalesce(cal_seen, now()));
end;
$$;

create function public.mark_board_seen(p_board text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_board = 'opportunities' then
    update public.user_settings set opportunities_seen_at = now() where user_id = auth.uid();
  elsif p_board = 'calendar' then
    update public.user_settings set calendar_seen_at = now() where user_id = auth.uid();
  else
    raise exception 'Unknown board' using errcode = '22023';
  end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['opportunities_for(uuid)', 'calendar_for(uuid)', 'board_news(uuid)', 'mark_board_seen(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
