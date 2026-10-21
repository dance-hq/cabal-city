-- Bug reports and suggestions about Cabal itself (not reports about people,
-- which live in public.reports). Written only by /api/feedback with the
-- service role; admins read and resolve them, authors can see their own.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea')),
  body text not null check (char_length(body) between 1 and 2000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create index feedback_open_idx on public.feedback (community_id, created_at desc) where resolved_at is null;
create index feedback_author_recent_idx on public.feedback (author_id, created_at desc);

alter table public.feedback enable row level security;

create policy feedback_select on public.feedback for select to authenticated
  using (author_id = auth.uid() or public.is_admin(community_id));

create function public.resolve_feedback(p_feedback uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  select community_id into cid from public.feedback where id = p_feedback;
  if cid is null or not public.is_admin(cid) then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.feedback set resolved_at = now(), resolved_by = auth.uid() where id = p_feedback and resolved_at is null;
end;
$$;

revoke execute on function public.resolve_feedback(uuid) from public, anon;
grant execute on function public.resolve_feedback(uuid) to authenticated;
