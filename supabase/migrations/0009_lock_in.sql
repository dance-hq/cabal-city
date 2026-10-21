-- Lock in: a work session you start on purpose, with an optional note about
-- what you're on that you can show to your community.
--
-- Time only counts while Cabal is open. Quitting the desktop app pauses the
-- session, and one whose app stopped checking in (crash, closed tab, laptop
-- asleep) pauses where it went quiet. Coming back offers Resume or End; a
-- session left paused for 12 hours is over.
--
-- Additive: the old start/current/end functions keep working for clients
-- that haven't reloaded yet.

alter table public.work_sessions
  add column focus text check (focus is null or char_length(focus) <= 120),
  add column shared boolean not null default false,
  add column worked_seconds integer not null default 0 check (worked_seconds >= 0),
  add column running_since timestamptz default now(),
  add column paused_at timestamptz,
  add column last_beat timestamptz not null default now();

update public.work_sessions set running_since = started_at where ended_at is null;
update public.work_sessions set running_since = null where ended_at is not null;

-- Shared, running sessions, looked up by community.
create index work_sessions_open_shared on public.work_sessions (user_id) where ended_at is null and shared;

-- What the app needs to draw the timer. `now` lets it correct for clock skew.
create function public.lock_in_state(s public.work_sessions) returns jsonb
language sql stable set search_path = '' as $$
  select case when s.id is null then null else jsonb_build_object(
    'started_at', s.started_at,
    'running_since', s.running_since,
    'worked_seconds', s.worked_seconds,
    'paused_at', s.paused_at,
    'focus', s.focus,
    'shared', s.shared,
    'now', now()
  ) end
$$;

-- Brings the open session up to date: pauses one that went quiet, ends one
-- that has sat paused too long. Returns it (locked), or null if none is open.
create function public.settle_work_session(p_user uuid) returns public.work_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_at timestamptz;
  v_since timestamptz;
begin
  select * into s from public.work_sessions where user_id = p_user and ended_at is null for update;
  if not found then
    return null;
  end if;
  if s.paused_at is null and s.last_beat < now() - interval '5 minutes' then
    v_since := coalesce(s.running_since, s.started_at);
    v_at := greatest(v_since, least(now(), s.last_beat + interval '1 minute'));
    update public.work_sessions
      set worked_seconds = s.worked_seconds + extract(epoch from v_at - v_since)::integer,
          running_since = null,
          paused_at = v_at
      where id = s.id
      returning * into s;
  end if;
  if s.paused_at is not null and s.paused_at < now() - interval '12 hours' then
    update public.work_sessions set ended_at = s.paused_at where id = s.id;
    return null;
  end if;
  return s;
end $$;

create function public.my_lock_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.lock_in_state(public.settle_work_session(auth.uid()));
end $$;

-- Starting always begins fresh: any session still open is ended first.
create function public.lock_in(p_focus text default null, p_shared boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_focus text := nullif(btrim(coalesce(p_focus, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if char_length(v_focus) > 120 then
    raise exception 'Keep it under 120 characters' using errcode = '22001';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is not null then
    update public.work_sessions
      set ended_at = coalesce(s.paused_at, now()),
          worked_seconds = s.worked_seconds
            + case when s.paused_at is null then extract(epoch from now() - coalesce(s.running_since, s.started_at))::integer else 0 end,
          running_since = null
      where id = s.id;
  end if;
  insert into public.work_sessions (user_id, focus, shared)
    values (auth.uid(), v_focus, coalesce(p_shared, false))
    returning * into s;
  return public.lock_in_state(s);
end $$;

create function public.edit_lock_in(p_focus text, p_shared boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_focus text := nullif(btrim(coalesce(p_focus, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if char_length(v_focus) > 120 then
    raise exception 'Keep it under 120 characters' using errcode = '22001';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is null then
    return null;
  end if;
  update public.work_sessions set focus = v_focus, shared = coalesce(p_shared, false)
    where id = s.id returning * into s;
  return public.lock_in_state(s);
end $$;

-- Called about once a minute while a session runs and Cabal is open.
create function public.lock_in_beat() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is not null and s.paused_at is null then
    update public.work_sessions set last_beat = now() where id = s.id returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

create function public.pause_lock_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is not null and s.paused_at is null then
    update public.work_sessions
      set worked_seconds = s.worked_seconds + extract(epoch from now() - coalesce(s.running_since, s.started_at))::integer,
          running_since = null,
          paused_at = now()
      where id = s.id
      returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

create function public.resume_lock_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is not null and s.paused_at is not null then
    update public.work_sessions
      set running_since = now(), paused_at = null, last_beat = now()
      where id = s.id
      returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

-- Ends the open session (running or paused) and returns the seconds worked.
create or replace function public.end_work_session() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is null then
    return null;
  end if;
  v_total := s.worked_seconds
    + case when s.paused_at is null then extract(epoch from now() - coalesce(s.running_since, s.started_at))::integer else 0 end;
  update public.work_sessions
    set ended_at = coalesce(s.paused_at, now()), worked_seconds = v_total, running_since = null
    where id = s.id;
  return v_total;
end $$;

-- Old clients: the timer's virtual start while running, null otherwise.
create or replace function public.current_work_session() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is null or s.paused_at is not null then
    return null;
  end if;
  return coalesce(s.running_since, s.started_at) - make_interval(secs => s.worked_seconds);
end $$;

-- Who in a community is locked in and chose to show it. Paused sessions,
-- invisible people and anyone you've blocked (or who blocked you) are left out.
create function public.community_lock_ins(p_community uuid)
returns table (user_id uuid, focus text, running_since timestamptz, worked_seconds integer, server_now timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_community) then
    raise exception 'No access' using errcode = '42501';
  end if;
  return query
    select w.user_id, w.focus, w.running_since, w.worked_seconds, now()
    from public.work_sessions w
    join public.community_members m on m.user_id = w.user_id and m.community_id = p_community and m.banned_at is null
    left join public.user_settings us on us.user_id = w.user_id
    where w.ended_at is null
      and w.shared
      and w.paused_at is null
      and w.running_since is not null
      and w.last_beat > now() - interval '5 minutes'
      and coalesce(us.availability, 'online') <> 'invisible'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = w.user_id)
           or (b.blocker_id = w.user_id and b.blocked_id = auth.uid())
      );
end $$;

revoke execute on function public.lock_in_state(public.work_sessions) from public, anon, authenticated;
revoke execute on function public.settle_work_session(uuid) from public, anon, authenticated;
revoke execute on function public.my_lock_in() from public, anon;
revoke execute on function public.lock_in(text, boolean) from public, anon;
revoke execute on function public.edit_lock_in(text, boolean) from public, anon;
revoke execute on function public.lock_in_beat() from public, anon;
revoke execute on function public.pause_lock_in() from public, anon;
revoke execute on function public.resume_lock_in() from public, anon;
revoke execute on function public.community_lock_ins(uuid) from public, anon;
grant execute on function public.my_lock_in() to authenticated;
grant execute on function public.lock_in(text, boolean) to authenticated;
grant execute on function public.edit_lock_in(text, boolean) to authenticated;
grant execute on function public.lock_in_beat() to authenticated;
grant execute on function public.pause_lock_in() to authenticated;
grant execute on function public.resume_lock_in() to authenticated;
grant execute on function public.community_lock_ins(uuid) to authenticated;
