-- Work sessions: from "Start session" on the welcome screen until you end it
-- or quit the desktop app. Private to you; nobody else can see them. They let
-- the timer survive a reload and stay the same in the browser and the app.

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint work_sessions_order check (ended_at is null or ended_at >= started_at)
);

create unique index work_sessions_one_open on public.work_sessions (user_id) where ended_at is null;
create index work_sessions_by_user on public.work_sessions (user_id, started_at desc);

alter table public.work_sessions enable row level security;
create policy "work sessions: read your own" on public.work_sessions
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.work_sessions from anon, authenticated;
grant select on public.work_sessions to authenticated;

-- The running session's start, or null. One nobody ended (laptop closed,
-- crash) counts as over after 12 hours.
create function public.current_work_session() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  s public.work_sessions;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into s from public.work_sessions where user_id = auth.uid() and ended_at is null;
  if not found then
    return null;
  end if;
  if s.started_at < now() - interval '12 hours' then
    update public.work_sessions set ended_at = s.started_at + interval '12 hours' where id = s.id;
    return null;
  end if;
  return s.started_at;
end $$;

-- Starting always begins fresh: any session still open is ended first.
create function public.start_work_session() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.work_sessions set ended_at = now() where user_id = auth.uid() and ended_at is null;
  insert into public.work_sessions (user_id) values (auth.uid()) returning started_at into v;
  return v;
end $$;

-- Ends the running session and returns how long it lasted in seconds (null if none).
create function public.end_work_session() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.work_sessions set ended_at = now()
    where user_id = auth.uid() and ended_at is null
    returning started_at into v;
  if v is null then
    return null;
  end if;
  return extract(epoch from now() - v)::integer;
end $$;

revoke execute on function public.current_work_session() from public, anon;
revoke execute on function public.start_work_session() from public, anon;
revoke execute on function public.end_work_session() from public, anon;
grant execute on function public.current_work_session() to authenticated;
grant execute on function public.start_work_session() to authenticated;
grant execute on function public.end_work_session() to authenticated;
