-- Lock in hours: what you've put in today, this week and all time, a weekly
-- board you can choose to be on, and an optional note on what you got done.
--
-- Rules:
-- - Time counts while the session runs, whether or not you're using Cabal.
--   Minimized or in another app still checks in; only a closed app, a closed
--   tab or a sleeping computer stops the clock (see 0009/0010).
-- - One session counts for at most 8 hours. A timer left running past that is
--   saved at 8 hours and closed, so nobody racks up 40 by forgetting it.
-- - Hours land in the week a session ENDS, in the community's own time zone.
--   The week starts Monday 00:00 local. Sessions under a minute don't count.
-- - The board ranks only finished sessions, so a running timer can't hold the
--   top spot. Being on it is opt-in; your own numbers are always yours.
--
-- Additive: no existing function changes its arguments.

alter table public.communities
  add column time_zone text not null default 'America/Chicago';

alter table public.work_sessions
  add column note text check (note is null or char_length(note) <= 280);

alter table public.user_settings
  -- Show my running session (and what I'm on) in "Locked in now".
  add column lock_in_live boolean not null default true,
  -- Show my weekly hours on the board and my Lock in numbers on my profile.
  add column lock_in_board boolean not null default false;

grant update (lock_in_live, lock_in_board) on public.user_settings to authenticated;

create index work_sessions_finished on public.work_sessions (ended_at) where ended_at is not null;

-- Monday 00:00 (or midnight, for 'day') in a time zone, as an instant.
create function public.lock_in_period_start(p_tz text, p_unit text, p_at timestamptz default now())
returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc(p_unit, p_at at time zone p_tz) at time zone p_tz
$$;

-- Same as 0010, plus the 8-hour limit.
create or replace function public.settle_work_session(p_user uuid) returns public.work_sessions
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
  v_at timestamptz;
  v_since timestamptz;
  v_limit constant integer := 8 * 3600;
  v_total integer;
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

  v_since := coalesce(s.running_since, s.started_at);
  v_total := s.worked_seconds
    + case when s.paused_at is null then extract(epoch from now() - v_since)::integer else 0 end;
  if v_total >= v_limit then
    v_at := case
      when s.paused_at is null then v_since + make_interval(secs => greatest(0, v_limit - s.worked_seconds))
      else s.paused_at
    end;
    update public.work_sessions
      set ended_at = greatest(s.started_at, v_at),
          worked_seconds = least(v_total, v_limit),
          running_since = null
      where id = s.id;
    return null;
  end if;

  if s.paused_at is not null and s.paused_at < now() - interval '3 hours' then
    update public.work_sessions set ended_at = greatest(s.started_at, s.paused_at), running_since = null where id = s.id;
    return null;
  end if;
  return s;
end $$;

-- Lock in from any device without making a second session: a running one is
-- returned as it is, a paused one picks back up. Two devices racing both get
-- the same session (the one-open-session index decides).
create or replace function public.lock_in(p_focus text default null, p_shared boolean default false) returns jsonb
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
    if s.paused_at is not null then
      update public.work_sessions
        set running_since = now(), paused_at = null, paused_by = null, last_beat = now()
        where id = s.id
        returning * into s;
    end if;
    return public.lock_in_state(s);
  end if;
  begin
    insert into public.work_sessions (user_id, focus, shared)
      values (auth.uid(), v_focus, coalesce(p_shared, false))
      returning * into s;
  exception when unique_violation then
    select * into s from public.work_sessions where user_id = auth.uid() and ended_at is null;
  end;
  return public.lock_in_state(s);
end $$;

-- Ends the open session. Returns its id and the seconds it counted, so the
-- app can offer to add a note.
create function public.finish_lock_in() returns jsonb
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
  v_total := least(8 * 3600, s.worked_seconds
    + case when s.paused_at is null then extract(epoch from now() - coalesce(s.running_since, s.started_at))::integer else 0 end);
  update public.work_sessions
    set ended_at = coalesce(s.paused_at, now()), worked_seconds = v_total, running_since = null, paused_at = null
    where id = s.id;
  return jsonb_build_object('id', s.id, 'worked_seconds', v_total);
end $$;

-- What you got done, on one of your own finished sessions. Empty removes it.
create function public.note_lock_in(p_session uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if char_length(v_note) > 280 then
    raise exception 'Keep it under 280 characters' using errcode = '22001';
  end if;
  update public.work_sessions set note = v_note
    where id = p_session and user_id = auth.uid() and ended_at is not null;
  if not found then
    raise exception 'No such session' using errcode = '42501';
  end if;
end $$;

-- "Locked in now" now also respects the person's own setting.
create or replace function public.community_lock_ins(p_community uuid)
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
      and coalesce(us.lock_in_live, true)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = w.user_id)
           or (b.blocker_id = w.user_id and b.blocked_id = auth.uid())
      );
end $$;

-- The weekly board: finished sessions of members who chose to be on it.
-- p_weeks_ago 0 = this week, 1 = last week, up to a year back.
create function public.lock_in_board(p_community uuid, p_weeks_ago integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_rows jsonb;
begin
  if not public.is_member(p_community) then
    raise exception 'No access' using errcode = '42501';
  end if;
  if p_weeks_ago is null or p_weeks_ago < 0 or p_weeks_ago > 52 then
    raise exception 'Pick a week in the last year' using errcode = '22023';
  end if;
  select time_zone into v_tz from public.communities where id = p_community;
  v_start := public.lock_in_period_start(v_tz, 'week') - make_interval(weeks => p_weeks_ago);
  v_end := public.lock_in_period_start(v_tz, 'week', v_start + interval '8 days');

  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', t.user_id, 'seconds', t.seconds, 'sessions', t.sessions, 'rank', t.rank
    ) order by t.rank, t.user_id), '[]'::jsonb)
    into v_rows
    from (
      select w.user_id, sum(w.worked_seconds)::integer as seconds, count(*)::integer as sessions,
             rank() over (order by sum(w.worked_seconds) desc)::integer as rank
      from public.work_sessions w
      join public.community_members m on m.user_id = w.user_id and m.community_id = p_community and m.banned_at is null
      join public.user_settings us on us.user_id = w.user_id and us.lock_in_board
      where w.ended_at >= v_start and w.ended_at < v_end
        and w.worked_seconds >= 60
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = auth.uid() and b.blocked_id = w.user_id)
             or (b.blocker_id = w.user_id and b.blocked_id = auth.uid())
        )
      group by w.user_id
      order by seconds desc
      limit 50
    ) t;

  return jsonb_build_object(
    'week_start', v_start,
    'week_end', v_end,
    'time_zone', v_tz,
    'joined', coalesce((select lock_in_board from public.user_settings where user_id = auth.uid()), false),
    'rows', v_rows
  );
end $$;

-- Lock in numbers for you, or for a fellow member who shares them.
-- Recent sessions (with notes) are only ever returned to their owner.
create function public.lock_in_stats(p_community uuid, p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user, auth.uid());
  v_self boolean;
  v_tz text;
  v_day timestamptz;
  v_week timestamptz;
  v_board boolean;
  v_out jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_member(p_community) then
    raise exception 'No access' using errcode = '42501';
  end if;
  v_self := v_user = v_me;
  v_board := coalesce((select lock_in_board from public.user_settings where user_id = v_user), false);
  if not v_self then
    if not v_board
      or not exists (select 1 from public.community_members
                     where community_id = p_community and user_id = v_user and banned_at is null)
      or exists (select 1 from public.blocks b
                 where (b.blocker_id = v_me and b.blocked_id = v_user)
                    or (b.blocker_id = v_user and b.blocked_id = v_me)) then
      return null;
    end if;
  end if;

  select time_zone into v_tz from public.communities where id = p_community;
  v_day := public.lock_in_period_start(v_tz, 'day');
  v_week := public.lock_in_period_start(v_tz, 'week');

  select jsonb_build_object(
      'today_seconds', coalesce(sum(w.worked_seconds) filter (where w.ended_at >= v_day), 0),
      'week_seconds', coalesce(sum(w.worked_seconds) filter (where w.ended_at >= v_week), 0),
      'all_seconds', coalesce(sum(w.worked_seconds), 0),
      'sessions', count(*)
    )
    into v_out
    from public.work_sessions w
    where w.user_id = v_user and w.ended_at is not null and w.worked_seconds >= 60;

  v_out := v_out || jsonb_build_object(
    'self', v_self,
    'board', v_board,
    'time_zone', v_tz,
    'week_start', v_week,
    -- Monday..Sunday of this week, seconds per day.
    'days', (
      select jsonb_agg(coalesce(d.seconds, 0) order by g.i)
      from generate_series(0, 6) g(i)
      left join (
        select (extract(isodow from w.ended_at at time zone v_tz)::integer - 1) as i, sum(w.worked_seconds)::integer as seconds
        from public.work_sessions w
        where w.user_id = v_user and w.ended_at >= v_week and w.worked_seconds >= 60
        group by 1
      ) d on d.i = g.i
    )
  );

  if v_self then
    v_out := v_out || jsonb_build_object(
      'live', coalesce((select lock_in_live from public.user_settings where user_id = v_me), true),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', r.id, 'started_at', r.started_at, 'ended_at', r.ended_at,
            'worked_seconds', r.worked_seconds, 'focus', r.focus, 'note', r.note
          ) order by r.ended_at desc)
        from (
          select * from public.work_sessions
          where user_id = v_me and ended_at is not null and worked_seconds >= 60
          order by ended_at desc
          limit 8
        ) r
      ), '[]'::jsonb)
    );
  end if;
  return v_out;
end $$;

revoke execute on function public.lock_in_period_start(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.finish_lock_in() from public, anon;
revoke execute on function public.note_lock_in(uuid, text) from public, anon;
revoke execute on function public.lock_in_board(uuid, integer) from public, anon;
revoke execute on function public.lock_in_stats(uuid, uuid) from public, anon;
grant execute on function public.finish_lock_in() to authenticated;
grant execute on function public.note_lock_in(uuid, text) to authenticated;
grant execute on function public.lock_in_board(uuid, integer) to authenticated;
grant execute on function public.lock_in_stats(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
