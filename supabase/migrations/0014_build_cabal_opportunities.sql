-- Build Cabal (one shared product board) and Opportunities (curated per city
-- or everywhere). Ideas are the existing feedback rows made public; bug
-- reports stay private exactly as before.

create extension if not exists pg_trgm with schema extensions;

-- Anyone active in at least one community. The product board is shared by
-- every city, so it's gated on being a Cabal member anywhere.
create function public.is_any_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members m
    where m.user_id = auth.uid() and m.banned_at is null
  )
$$;

-- People who run the product board. Today that's any community admin; one
-- function so it can become its own list later without touching callers.
create function public.is_maintainer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_members m
    where m.user_id = auth.uid() and m.role = 'admin' and m.banned_at is null
  )
$$;

revoke execute on function public.is_any_member(), public.is_maintainer() from public, anon;
grant execute on function public.is_any_member(), public.is_maintainer() to authenticated;

-- ---------------------------------------------------------------------------
-- Ideas = public feedback
-- ---------------------------------------------------------------------------

alter table public.feedback
  add column title text,
  add column on_board boolean not null default false,
  add column status text not null default 'requested' check (status in ('requested', 'building', 'shipped')),
  add column status_at timestamptz,
  add column github_url text check (github_url is null or github_url ~ '^https://github\.com/[^\s]+$'),
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null;

alter table public.feedback alter column body drop not null;
alter table public.feedback drop constraint feedback_body_check;
alter table public.feedback add constraint feedback_body_length check (body is null or char_length(body) between 1 and 2000);
alter table public.feedback add constraint feedback_bug_has_body check (kind <> 'bug' or body is not null);
alter table public.feedback add constraint feedback_public_idea check (
  not on_board or (kind = 'idea' and title is not null and char_length(title) between 3 and 120)
);

create index feedback_board_idx on public.feedback (created_at desc) where on_board;
create index feedback_title_trgm on public.feedback using gin (lower(title) extensions.gin_trgm_ops) where on_board;

create policy feedback_board_select on public.feedback for select to authenticated
  using (on_board and (hidden_at is null and public.is_any_member() or public.is_maintainer()));

create table public.idea_votes (
  idea_id uuid not null references public.feedback (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index idea_votes_user_idx on public.idea_votes (user_id);
alter table public.idea_votes enable row level security;
create policy idea_votes_own on public.idea_votes for select to authenticated using (user_id = auth.uid());

create table public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.feedback (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index idea_comments_idea_idx on public.idea_comments (idea_id, created_at);
create index idea_comments_author_recent_idx on public.idea_comments (author_id, created_at desc);
alter table public.idea_comments enable row level security;
-- Read through idea_thread(); no direct table access.

create table public.ships (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  body text check (body is null or char_length(body) between 1 and 1000),
  shipped_at timestamptz not null default now(),
  idea_id uuid references public.feedback (id) on delete set null,
  github_url text check (github_url is null or github_url ~ '^https://github\.com/[^\s]+$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ships_recent_idx on public.ships (shipped_at desc);
alter table public.ships enable row level security;
create policy ships_select on public.ships for select to authenticated using (public.is_any_member());

-- Every public idea with counts and your own vote. Maintainers also get the
-- hidden ones so they can bring them back.
create function public.idea_board()
returns table (
  id uuid, title text, body text, status text, status_at timestamptz, created_at timestamptz,
  author_id uuid, github_url text, hidden boolean, votes integer, comments integer, voted boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare maint boolean := public.is_maintainer();
begin
  if not public.is_any_member() then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select f.id, f.title, f.body, f.status, f.status_at, f.created_at, f.author_id, f.github_url,
      f.hidden_at is not null,
      (select count(*)::int from public.idea_votes v where v.idea_id = f.id),
      (select count(*)::int from public.idea_comments c where c.idea_id = f.id and c.deleted_at is null),
      exists (select 1 from public.idea_votes v where v.idea_id = f.id and v.user_id = auth.uid())
    from public.feedback f
    where f.on_board and (f.hidden_at is null or maint)
    order by f.created_at desc
    limit 500;
end;
$$;

-- Ideas that look like what you're about to suggest.
create function public.similar_ideas(p_text text)
returns table (id uuid, title text, status text, votes integer, voted boolean)
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(coalesce(p_text, '')));
begin
  if not public.is_any_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if char_length(q) < 4 then return; end if;
  return query
    select f.id, f.title, f.status,
      (select count(*)::int from public.idea_votes v where v.idea_id = f.id),
      exists (select 1 from public.idea_votes v where v.idea_id = f.id and v.user_id = auth.uid())
    from public.feedback f
    where f.on_board and f.hidden_at is null
      and (extensions.word_similarity(q, lower(f.title)) > 0.45 or lower(f.title) like '%' || q || '%')
    order by extensions.word_similarity(q, lower(f.title)) desc
    limit 4;
end;
$$;

create function public.suggest_idea(p_community uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t text := trim(coalesce(p_title, ''));
  b text := nullif(trim(coalesce(p_body, '')), '');
  recent integer;
  new_id uuid;
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  if char_length(t) < 3 then raise exception 'Give it a short title.' using errcode = '22023'; end if;
  select count(*) into recent from public.feedback
    where author_id = auth.uid() and on_board and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'That''s a lot of ideas for one hour. Try again a bit later.' using errcode = 'P0429'; end if;
  insert into public.feedback (community_id, author_id, kind, title, body, on_board)
    values (p_community, auth.uid(), 'idea', left(t, 120), left(b, 2000), true)
    returning feedback.id into new_id;
  insert into public.idea_votes (idea_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

create function public.toggle_idea_vote(p_idea uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  if not public.is_any_member() then raise exception 'Members only' using errcode = '42501'; end if;
  select status into st from public.feedback where id = p_idea and on_board and hidden_at is null;
  if st is null then raise exception 'That idea isn''t on the board anymore.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.idea_votes where idea_id = p_idea and user_id = auth.uid()) then
    delete from public.idea_votes where idea_id = p_idea and user_id = auth.uid();
    return false;
  end if;
  if st = 'shipped' then raise exception 'That one already shipped.' using errcode = '22023'; end if;
  insert into public.idea_votes (idea_id, user_id) values (p_idea, auth.uid());
  return true;
end;
$$;

create function public.idea_thread(p_idea uuid)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.feedback f
    where f.id = p_idea and f.on_board and (f.hidden_at is null and public.is_any_member() or public.is_maintainer())
  ) then raise exception 'That idea isn''t on the board anymore.' using errcode = 'P0002'; end if;
  return query
    select c.id, c.author_id, c.body, c.created_at, c.author_id = auth.uid()
    from public.idea_comments c
    where c.idea_id = p_idea and c.deleted_at is null
    order by c.created_at
    limit 300;
end;
$$;

create function public.add_idea_comment(p_idea uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b text := trim(coalesce(p_body, ''));
  recent integer;
  new_id uuid;
begin
  if not public.is_any_member() then raise exception 'Members only' using errcode = '42501'; end if;
  if not exists (select 1 from public.feedback where id = p_idea and on_board and hidden_at is null) then
    raise exception 'That idea isn''t on the board anymore.' using errcode = 'P0002';
  end if;
  if b = '' then raise exception 'Write something first.' using errcode = '22023'; end if;
  select count(*) into recent from public.idea_comments
    where author_id = auth.uid() and created_at > now() - interval '10 minutes';
  if recent >= 20 then raise exception 'Slow down a little.' using errcode = 'P0429'; end if;
  insert into public.idea_comments (idea_id, author_id, body) values (p_idea, auth.uid(), left(b, 2000))
    returning idea_comments.id into new_id;
  return new_id;
end;
$$;

create function public.delete_idea_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.idea_comments set deleted_at = now(), deleted_by = auth.uid()
    where id = p_comment and deleted_at is null and (author_id = auth.uid() or public.is_maintainer());
  if not found then raise exception 'You can only remove your own comments.' using errcode = '42501'; end if;
end;
$$;

-- Moving an idea to Shipped records the ship ("what changed") in the same step.
create function public.set_idea_status(p_idea uuid, p_status text, p_note text default null, p_link text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t text;
  link text := nullif(trim(coalesce(p_link, '')), '');
begin
  if not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  if p_status not in ('requested', 'building', 'shipped') then raise exception 'Unknown status' using errcode = '22023'; end if;
  update public.feedback
    set status = p_status, status_at = now(), github_url = coalesce(link, github_url)
    where id = p_idea and on_board
    returning title into t;
  if t is null then raise exception 'That idea isn''t on the board.' using errcode = 'P0002'; end if;
  if p_status = 'shipped' then
    if not exists (select 1 from public.ships where idea_id = p_idea) then
      insert into public.ships (title, body, idea_id, github_url, created_by)
        values (t, left(nullif(trim(coalesce(p_note, '')), ''), 1000), p_idea, link, auth.uid());
    end if;
  else
    delete from public.ships where idea_id = p_idea;
  end if;
end;
$$;

create function public.set_idea_link(p_idea uuid, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  update public.feedback set github_url = nullif(trim(coalesce(p_link, '')), '') where id = p_idea and on_board;
end;
$$;

create function public.set_idea_hidden(p_idea uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  update public.feedback
    set hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then auth.uid() end
    where id = p_idea and on_board;
end;
$$;

create function public.post_ship(p_title text, p_body text, p_link text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  insert into public.ships (title, body, github_url, created_by)
    values (left(trim(p_title), 120), left(nullif(trim(coalesce(p_body, '')), ''), 1000), nullif(trim(coalesce(p_link, '')), ''), auth.uid())
    returning ships.id into new_id;
  return new_id;
end;
$$;

create function public.delete_ship(p_ship uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  delete from public.ships where id = p_ship;
end;
$$;

-- Ships with whoever suggested the idea behind them, if there was one.
create function public.recent_ships(p_limit integer default 30)
returns table (id uuid, title text, body text, shipped_at timestamptz, github_url text, idea_id uuid, suggested_by uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_any_member() then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select s.id, s.title, s.body, s.shipped_at, s.github_url, s.idea_id,
      case when f.hidden_at is null then f.author_id end
    from public.ships s
    left join public.feedback f on f.id = s.idea_id
    order by s.shipped_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  -- null = shown in every city (national and remote programs).
  community_id uuid references public.communities (id) on delete cascade,
  kind text not null check (kind in ('credits', 'funding', 'hackathon', 'event')),
  title text not null check (char_length(title) between 3 and 120),
  provider text check (provider is null or char_length(provider) <= 80),
  summary text not null check (char_length(summary) between 10 and 400),
  eligibility text check (eligibility is null or char_length(eligibility) <= 400),
  place text not null check (char_length(place) between 2 and 60),
  deadline date,
  url text not null unique check (url ~ '^https://[^\s]+$'),
  audiences text[] not null default '{}' check (audiences <@ array['founder', 'builder', 'investor']),
  verified_at date not null,
  status text not null default 'published' check (status in ('published', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_live_idx on public.opportunities (community_id, deadline) where status = 'published';
alter table public.opportunities enable row level security;
-- Read through opportunities_for().

create table public.opportunity_saves (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);
create index opportunity_saves_user_idx on public.opportunity_saves (user_id);
alter table public.opportunity_saves enable row level security;
create policy opportunity_saves_own on public.opportunity_saves for select to authenticated using (user_id = auth.uid());

create table public.opportunity_submissions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  url text not null check (url ~ '^https?://[^\s]+$' and char_length(url) <= 500),
  note text check (note is null or char_length(note) <= 500),
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  opportunity_id uuid references public.opportunities (id) on delete set null
);
create index opportunity_submissions_new_idx on public.opportunity_submissions (community_id, created_at) where status = 'new';
create index opportunity_submissions_author_idx on public.opportunity_submissions (submitted_by, created_at desc);
alter table public.opportunity_submissions enable row level security;
create policy opportunity_submissions_select on public.opportunity_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.is_admin(community_id));

-- Live entries for a city: its own plus the everywhere ones. Anything whose
-- deadline has passed (Chicago time) drops off by itself.
create function public.opportunities_for(p_community uuid)
returns table (
  id uuid, community_id uuid, kind text, title text, provider text, summary text, eligibility text,
  place text, deadline date, url text, audiences text[], verified_at date, saved boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  return query
    select o.id, o.community_id, o.kind, o.title, o.provider, o.summary, o.eligibility, o.place, o.deadline,
      o.url, o.audiences, o.verified_at,
      exists (select 1 from public.opportunity_saves s where s.opportunity_id = o.id and s.user_id = auth.uid())
    from public.opportunities o
    where o.status = 'published'
      and (o.community_id is null or o.community_id = p_community)
      and (o.deadline is null or o.deadline >= (now() at time zone 'America/Chicago')::date)
    order by o.deadline nulls last, o.verified_at desc;
end;
$$;

create function public.toggle_opportunity_save(p_opportunity uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.opportunities where id = p_opportunity and status = 'published';
  if not found then raise exception 'That opportunity was taken down.' using errcode = 'P0002'; end if;
  if cid is null and not public.is_any_member() or cid is not null and not public.is_member(cid) then
    raise exception 'Members only' using errcode = '42501';
  end if;
  if exists (select 1 from public.opportunity_saves where opportunity_id = p_opportunity and user_id = auth.uid()) then
    delete from public.opportunity_saves where opportunity_id = p_opportunity and user_id = auth.uid();
    return false;
  end if;
  insert into public.opportunity_saves (opportunity_id, user_id) values (p_opportunity, auth.uid());
  return true;
end;
$$;

-- 'added' when it's new to us, 'known' when it's already listed or waiting.
create function public.submit_opportunity(p_community uuid, p_url text, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u text := trim(coalesce(p_url, ''));
  bare text;
  recent integer;
begin
  if not public.is_member(p_community) then raise exception 'Members only' using errcode = '42501'; end if;
  if u !~ '^https?://[^\s]+\.[^\s]+$' or char_length(u) > 500 then
    raise exception 'That doesn''t look like a link.' using errcode = '22023';
  end if;
  bare := regexp_replace(lower(u), '^https?://(www\.)?|/+$', '', 'g');
  if exists (
    select 1 from public.opportunities o where regexp_replace(lower(o.url), '^https?://(www\.)?|/+$', '', 'g') = bare
  ) or exists (
    select 1 from public.opportunity_submissions s
    where s.status = 'new' and regexp_replace(lower(s.url), '^https?://(www\.)?|/+$', '', 'g') = bare
  ) then return 'known'; end if;
  select count(*) into recent from public.opportunity_submissions
    where submitted_by = auth.uid() and created_at > now() - interval '1 day';
  if recent >= 10 then raise exception 'That''s plenty for today. Thank you!' using errcode = 'P0429'; end if;
  insert into public.opportunity_submissions (community_id, url, note, submitted_by)
    values (p_community, u, left(nullif(trim(coalesce(p_note, '')), ''), 500), auth.uid());
  return 'added';
end;
$$;

create function public.opportunity_review(p_community uuid)
returns table (id uuid, url text, note text, submitted_by uuid, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select s.id, s.url, s.note, s.submitted_by, s.created_at
    from public.opportunity_submissions s
    where s.community_id = p_community and s.status = 'new'
    order by s.created_at;
end;
$$;

create function public.dismiss_opportunity_submission(p_submission uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.opportunity_submissions where id = p_submission;
  if cid is null or not public.is_admin(cid) then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.opportunity_submissions set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission and status = 'new';
end;
$$;

-- Add (p_id null) or edit an entry. City entries need that city's admin;
-- everywhere entries need a maintainer. Saving always re-stamps the check date,
-- so only save after looking at the source.
create function public.save_opportunity(
  p_id uuid, p_community uuid, p_everywhere boolean, p_kind text, p_title text, p_provider text,
  p_summary text, p_eligibility text, p_place text, p_deadline date, p_url text, p_audiences text[],
  p_submission uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := case when p_everywhere then null else p_community end;
  old_cid uuid;
  out_id uuid;
begin
  if not public.is_admin(p_community) then raise exception 'Admins only' using errcode = '42501'; end if;
  if cid is null and not public.is_maintainer() then raise exception 'Maintainers only' using errcode = '42501'; end if;
  if p_id is not null then
    select community_id into old_cid from public.opportunities where id = p_id;
    if not found then raise exception 'That opportunity is gone.' using errcode = 'P0002'; end if;
    if old_cid is not null and not public.is_admin(old_cid) then raise exception 'Admins only' using errcode = '42501'; end if;
    update public.opportunities set
      community_id = cid, kind = p_kind, title = trim(p_title), provider = nullif(trim(coalesce(p_provider, '')), ''),
      summary = trim(p_summary), eligibility = nullif(trim(coalesce(p_eligibility, '')), ''), place = trim(p_place),
      deadline = p_deadline, url = trim(p_url), audiences = coalesce(p_audiences, '{}'),
      verified_at = (now() at time zone 'America/Chicago')::date, updated_at = now(), status = 'published'
      where id = p_id returning id into out_id;
  else
    insert into public.opportunities
      (community_id, kind, title, provider, summary, eligibility, place, deadline, url, audiences, verified_at, created_by)
      values (cid, p_kind, trim(p_title), nullif(trim(coalesce(p_provider, '')), ''), trim(p_summary),
        nullif(trim(coalesce(p_eligibility, '')), ''), trim(p_place), p_deadline, trim(p_url),
        coalesce(p_audiences, '{}'), (now() at time zone 'America/Chicago')::date, auth.uid())
      returning id into out_id;
  end if;
  if p_submission is not null then
    update public.opportunity_submissions
      set status = 'added', reviewed_by = auth.uid(), reviewed_at = now(), opportunity_id = out_id
      where id = p_submission and community_id = p_community;
  end if;
  return out_id;
end;
$$;

-- For the editor: the stored row, including archived ones.
create function public.opportunity_detail(p_opportunity uuid)
returns setof public.opportunities
language plpgsql stable security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.opportunities where id = p_opportunity;
  if not found then return; end if;
  if cid is null and not public.is_maintainer() or cid is not null and not public.is_admin(cid) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query select * from public.opportunities where id = p_opportunity;
end;
$$;

create function public.archive_opportunity(p_opportunity uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.opportunities where id = p_opportunity;
  if not found then return; end if;
  if cid is null and not public.is_maintainer() or cid is not null and not public.is_admin(cid) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.opportunities set status = 'archived', updated_at = now() where id = p_opportunity;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'idea_board()', 'similar_ideas(text)', 'suggest_idea(uuid, text, text)', 'toggle_idea_vote(uuid)',
    'idea_thread(uuid)', 'add_idea_comment(uuid, text)', 'delete_idea_comment(uuid)',
    'set_idea_status(uuid, text, text, text)', 'set_idea_link(uuid, text)', 'set_idea_hidden(uuid, boolean)',
    'post_ship(text, text, text)', 'delete_ship(uuid)', 'recent_ships(integer)',
    'opportunities_for(uuid)', 'toggle_opportunity_save(uuid)', 'submit_opportunity(uuid, text, text)',
    'opportunity_review(uuid)', 'dismiss_opportunity_submission(uuid)',
    'save_opportunity(uuid, uuid, boolean, text, text, text, text, text, text, date, text, text[], uuid)',
    'opportunity_detail(uuid)', 'archive_opportunity(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
