-- Lock in without the babysitting.
--
-- Short gaps (under 5 minutes without a check-in) keep counting. A longer
-- gap (laptop closed, app quit, crash) isn't counted, and the session picks
-- back up on its own the next time Cabal is open, as long as that's within
-- 3 hours. Past 3 hours it closes itself, saved with the time it really ran,
-- and the next Lock in starts fresh. Only a pause you pressed yourself waits
-- for you to Resume, and that closes after 3 hours too.
--
-- Additive for clients that haven't reloaded: same function names, and
-- pause_lock_in() with no arguments still means "I paused".

alter table public.work_sessions
  add column paused_by text check (paused_by in ('you', 'away'));

update public.work_sessions set paused_by = 'away' where ended_at is null and paused_at is not null;

create or replace function public.lock_in_state(s public.work_sessions) returns jsonb
language sql stable set search_path = '' as $$
  select case when s.id is null then null else jsonb_build_object(
    'started_at', s.started_at,
    'running_since', s.running_since,
    'worked_seconds', s.worked_seconds,
    'paused_at', s.paused_at,
    'paused_by', s.paused_by,
    'focus', s.focus,
    'shared', s.shared,
    'now', now()
  ) end
$$;

-- Brings the open session up to date: pauses one that went quiet (at its
-- last check-in plus a minute), and closes one paused for over 3 hours.
create or replace function public.settle_work_session(p_user uuid) returns public.work_sessions
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
          paused_at = v_at,
          paused_by = 'away'
      where id = s.id
      returning * into s;
  end if;
  if s.paused_at is not null and s.paused_at < now() - interval '3 hours' then
    update public.work_sessions set ended_at = greatest(s.started_at, s.paused_at), running_since = null where id = s.id;
    return null;
  end if;
  return s;
end $$;

-- Cabal is open right now: settle, pick a session that paused while you were
-- away back up, and record the check-in. `away_seconds` is set only when it
-- just picked back up, so the app can say how long the gap was.
create function public.wake_work_session(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_away integer;
begin
  s := public.settle_work_session(p_user);
  if s.id is null then
    return null;
  end if;
  if s.paused_at is not null and coalesce(s.paused_by, 'away') = 'away' then
    v_away := greatest(0, extract(epoch from now() - s.paused_at)::integer);
    update public.work_sessions
      set running_since = now(), paused_at = null, paused_by = null, last_beat = now()
      where id = s.id
      returning * into s;
    return public.lock_in_state(s) || jsonb_build_object('away_seconds', v_away);
  end if;
  if s.paused_at is null then
    update public.work_sessions set last_beat = now() where id = s.id returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

create or replace function public.my_lock_in() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.wake_work_session(auth.uid());
end $$;

create or replace function public.lock_in_beat() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return public.wake_work_session(auth.uid());
end $$;

-- p_away: Cabal is closing (picks back up on its own); otherwise you paused it.
drop function public.pause_lock_in();
create function public.pause_lock_in(p_away boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_by text := case when coalesce(p_away, false) then 'away' else 'you' end;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  s := public.settle_work_session(auth.uid());
  if s.id is null then
    return null;
  end if;
  if s.paused_at is null then
    update public.work_sessions
      set worked_seconds = s.worked_seconds + extract(epoch from now() - coalesce(s.running_since, s.started_at))::integer,
          running_since = null,
          paused_at = now(),
          paused_by = v_by
      where id = s.id
      returning * into s;
  elsif v_by = 'you' then
    update public.work_sessions set paused_by = 'you' where id = s.id returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

create or replace function public.resume_lock_in() returns jsonb
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
      set running_since = now(), paused_at = null, paused_by = null, last_beat = now()
      where id = s.id
      returning * into s;
  end if;
  return public.lock_in_state(s);
end $$;

revoke execute on function public.wake_work_session(uuid) from public, anon, authenticated;
revoke execute on function public.pause_lock_in(boolean) from public, anon;
grant execute on function public.pause_lock_in(boolean) to authenticated;

notify pgrst, 'reload schema';
