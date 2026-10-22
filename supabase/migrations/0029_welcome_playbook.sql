-- A one-time welcome for new members and the Cabal Playbook: a short, optional
-- guide to settling in. Nothing here is required and nothing is rewarded.

alter table public.user_settings
  -- The welcome has been shown (and closed, however it was closed).
  add column welcome_seen boolean not null default false,
  -- Playbook items someone ticked themselves. Short slugs, a handful at most.
  add column playbook_done text[] not null default '{}'
    constraint user_settings_playbook_done_shape check (
      cardinality(playbook_done) <= 20
      and array_to_string(playbook_done, ',') ~ '^[a-z0-9-]*(,[a-z0-9-]+)*$'
      and char_length(array_to_string(playbook_done, ',')) <= 400
    ),
  -- The Playbook card is tucked away on Home (it can still be opened).
  add column playbook_hidden boolean not null default false;

-- Everyone already here has had their welcome; their Home stays as it is.
update public.user_settings set welcome_seen = true, playbook_hidden = true;

grant update (welcome_seen, playbook_done, playbook_hidden) on public.user_settings to authenticated;

-- What the Playbook notices on its own: whether you've posted in #introductions
-- and whether you've ever locked in. Only ever about the caller.
create function public.playbook_progress(p_community uuid)
returns table (introduced boolean, locked_in boolean)
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1
      from public.messages m
      join public.channels ch on ch.id = m.channel_id
      where ch.community_id = p_community
        and ch.kind = 'room'
        and ch.slug = 'introductions'
        and m.author_id = auth.uid()
        and m.kind = 'user'
        and m.deleted_at is null
    ),
    exists (select 1 from public.work_sessions w where w.user_id = auth.uid())
  where auth.uid() is not null and coalesce(public.is_member(p_community), false)
$$;

revoke all on function public.playbook_progress(uuid) from public, anon;
grant execute on function public.playbook_progress(uuid) to authenticated;
