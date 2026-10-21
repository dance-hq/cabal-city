-- Long messages: paste a huge prompt, spec or log and press Send.
--
-- A message over the inline size keeps a short preview in `messages` (so
-- conversation lists, Realtime, notifications and reports stay light) and its
-- full text, exactly as typed, in `message_texts`, fetched only when someone
-- opens it. Both rows are written in one transaction by send_long_message().
--
--   Rooms and teams  messages.body = preview, messages.long_chars = length,
--                    message_texts.body = the full text.
--   Direct messages  messages.sealed = the preview + length, sealed;
--                    message_texts.sealed = the full text, sealed with the same
--                    per-message key under its own label. The server never
--                    sees either, or the exact length.
--
-- Additive: older apps keep working and just show the preview.

alter table public.messages
  add column long_text boolean not null default false,
  add column long_chars int;

alter table public.messages add constraint messages_long_shape check (
  (not long_text and long_chars is null)
  or (long_text and kind = 'user' and sealed is not null and long_chars is null)
  or (long_text and kind = 'user' and sealed is null and long_chars between 1 and 200000)
);

create table public.message_texts (
  message_id uuid primary key references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  body text,
  sealed jsonb,
  created_at timestamptz not null default now(),
  constraint message_texts_content check (
    (sealed is null and body is not null and char_length(body) between 1 and 200000 and octet_length(body) <= 800000)
    or (sealed is not null and body is null and octet_length(sealed::text) <= 1100000)
  )
);

create index message_texts_created_idx on public.message_texts (created_at desc);

alter table public.message_texts enable row level security;

-- Readable by whoever can read the conversation, until the message is deleted.
create policy message_texts_select on public.message_texts for select to authenticated
  using (
    public.can_read_channel(channel_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.deleted_at is null)
  );

-- Only for your own long message, written in the same moment as it.
create policy message_texts_insert on public.message_texts for insert to authenticated
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.channel_id = message_texts.channel_id
        and m.author_id = auth.uid()
        and m.long_text
        and m.deleted_at is null
        and m.created_at > now() - interval '1 minute'
    )
  );

create or replace function public.guard_message_text() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  recent int;
  recent_bytes bigint;
begin
  new.created_at := now();
  select * into m from public.messages where id = new.message_id;
  if m.id is null or not m.long_text or m.channel_id <> new.channel_id then
    raise exception 'That message isn''t a long message' using errcode = '22023';
  end if;

  if m.sealed is not null then
    if new.sealed is null
      or jsonb_typeof(new.sealed) <> 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(new.sealed) as k) <> array['ct', 'iv', 'rk', 'sk', 'v']
      or new.sealed -> 'v' <> '1'::jsonb
      or coalesce(new.sealed ->> 'iv', '') !~ '^[A-Za-z0-9+/]{16}$'
      or coalesce(new.sealed ->> 'ct', '') !~ '^[A-Za-z0-9+/]{24,}={0,2}$'
      or new.sealed ->> 'sk' is distinct from m.sealed ->> 'sk'
      or new.sealed ->> 'rk' is distinct from m.sealed ->> 'rk' then
      raise exception 'That message wasn''t encrypted properly. Reload Cabal and try again.' using errcode = '22023';
    end if;
  elsif new.sealed is not null or char_length(new.body) is distinct from m.long_chars then
    raise exception 'That message didn''t arrive whole. Try sending it again.' using errcode = '22023';
  end if;

  -- Long messages are for sharing work, not flooding: a separate hourly budget.
  select count(*), coalesce(sum(coalesce(octet_length(t.body), 0) + coalesce(octet_length(t.sealed::text), 0)), 0)
    into recent, recent_bytes
    from public.message_texts t
    join public.messages mm on mm.id = t.message_id
    where mm.author_id = m.author_id and t.created_at > now() - interval '1 hour';
  if recent >= 40 or recent_bytes > 12000000 then
    raise exception 'You''ve sent a lot of long messages this hour. Try again a little later.' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_message_text() from public, anon, authenticated;

create trigger message_texts_guard before insert on public.message_texts
  for each row execute function public.guard_message_text();

-- A long message never exists without its text: checked when the transaction commits.
create or replace function public.require_message_text() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.long_text and not exists (select 1 from public.message_texts where message_id = new.id) then
    raise exception 'That message didn''t arrive whole. Try sending it again.' using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke all on function public.require_message_text() from public, anon, authenticated;

create constraint trigger messages_long_text_present after insert on public.messages
  deferrable initially deferred
  for each row when (new.long_text)
  execute function public.require_message_text();

-- One call writes both rows. SECURITY INVOKER: the caller's own insert policies
-- and the usual message trigger (clock, trimming, rate limit, envelope checks) apply.
create or replace function public.send_long_message(
  p_id uuid,
  p_channel uuid,
  p_preview text,
  p_preview_sealed jsonb,
  p_chars int,
  p_text text,
  p_text_sealed jsonb
) returns setof public.messages
language plpgsql security invoker set search_path = '' as $$
declare
  sent public.messages;
begin
  insert into public.messages (id, channel_id, author_id, body, sealed, long_text, long_chars)
    values (
      p_id,
      p_channel,
      auth.uid(),
      case when p_preview_sealed is null then p_preview else '' end,
      p_preview_sealed,
      true,
      case when p_preview_sealed is null then p_chars else null end
    )
    returning * into sent;
  insert into public.message_texts (message_id, channel_id, body, sealed)
    values (p_id, p_channel, case when p_text_sealed is null then p_text else null end, p_text_sealed);
  return next sent;
end;
$$;

revoke all on function public.send_long_message(uuid, uuid, text, jsonb, int, text, jsonb) from public, anon;
grant execute on function public.send_long_message(uuid, uuid, text, jsonb, int, text, jsonb) to authenticated;
grant select, insert on public.message_texts to authenticated;

-- Deleting a long message deletes its full text too.
create or replace function public.delete_message(p_message uuid) returns void
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
  delete from public.message_texts where message_id = p_message;
  update public.messages
    set deleted_at = now(), body = 'deleted', sealed = null, long_text = false, long_chars = null
    where id = p_message;
end;
$$;
