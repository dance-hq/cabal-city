-- Photos and videos in conversations.
--
--   Rooms and teams  each file is stored in the private `attachments` bucket.
--                    Photos are redrawn on the sender's device first, which
--                    drops location and camera details. People who can read
--                    the conversation open them through short-lived links.
--   Direct messages  each file is encrypted on the sender's device before it
--                    is uploaded, under its own key from the conversation;
--                    its name, type and dimensions are sealed in
--                    message_files.sealed. The server stores bytes it can't read.
--
-- `messages.files` says how many files a message has. send_message_with_files()
-- writes the message and its files in one transaction, and a deferred trigger
-- refuses a message whose files didn't all arrive.
--
-- Additive: older apps keep working and just show the text.

alter table public.messages add column files smallint not null default 0;

alter table public.messages add constraint messages_files_shape check (
  files = 0 or (files between 1 and 6 and kind = 'user' and not long_text)
);

-- Text is optional when a message carries files.
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (
  (sealed is null and (char_length(body) between 1 and 4000 or (files > 0 and body = '')))
  or (sealed is not null and body = '')
);

create table public.message_files (
  id uuid primary key,
  message_id uuid not null references public.messages (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  position smallint not null check (position between 0 and 5),
  path text not null unique,
  -- Set from the stored object, never from the client.
  bytes bigint not null,
  kind text check (kind in ('image', 'video')),
  mime text,
  name text,
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000),
  sealed jsonb,
  created_at timestamptz not null default now(),
  unique (message_id, position),
  constraint message_files_content check (
    (sealed is null and kind is not null and mime is not null and name is not null and char_length(name) between 1 and 200)
    or (sealed is not null and kind is null and mime is null and name is null and width is null and height is null
        and octet_length(sealed::text) <= 4000)
  )
);

create index message_files_message_idx on public.message_files (message_id, position);
create index message_files_author_created_idx on public.message_files (author_id, created_at desc);

alter table public.message_files enable row level security;

-- Readable by whoever can read the conversation, until the message is deleted.
create policy message_files_select on public.message_files for select to authenticated
  using (
    public.can_read_channel(channel_id)
    and exists (select 1 from public.messages m where m.id = message_id and m.deleted_at is null)
  );

-- Only for your own message, written in the same moment as it (the trigger checks the rest).
create policy message_files_insert on public.message_files for insert to authenticated
  with check (author_id = auth.uid());

grant select, insert on public.message_files to authenticated;

-- --- Storage ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  52428864,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Objects are named <conversation>/<message>/<file>. You may upload into a
-- conversation you can read; it only becomes visible once a message claims it.
create or replace function public.attachment_channel(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare
  head text := split_part(p_name, '/', 1);
begin
  if head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return head::uuid;
end;
$$;

create or replace function public.can_read_attachment(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.message_files f
    join public.messages m on m.id = f.message_id
    where f.path = p_name and m.deleted_at is null and public.can_read_channel(f.channel_id)
  );
$$;

revoke all on function public.can_read_attachment(text) from public, anon;
grant execute on function public.can_read_attachment(text) to authenticated;

create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.attachment_channel(name) is not null
    and public.can_read_channel(public.attachment_channel(name))
  );

create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (owner_id = auth.uid()::text or public.can_read_attachment(name))
  );

create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = auth.uid()::text);

-- --- Checks -------------------------------------------------------------------

create or replace function public.guard_message_file() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  obj storage.objects;
  stored_mime text;
  recent int;
  recent_bytes bigint;
begin
  new.created_at := now();
  select * into m from public.messages where id = new.message_id;
  if m.id is null or m.files = 0 or m.channel_id <> new.channel_id or m.author_id is distinct from auth.uid()
    or m.deleted_at is not null or m.created_at < now() - interval '1 minute' then
    raise exception 'That file doesn''t belong to a message you just sent' using errcode = '22023';
  end if;
  if new.position >= m.files then
    raise exception 'That message has fewer files' using errcode = '22023';
  end if;
  if new.path <> m.channel_id::text || '/' || m.id::text || '/' || new.id::text then
    raise exception 'That file is in the wrong place' using errcode = '22023';
  end if;

  select * into obj from storage.objects
    where bucket_id = 'attachments' and name = new.path and owner_id = auth.uid()::text;
  if obj.id is null then
    raise exception 'A file didn''t finish uploading. Try sending again.' using errcode = '22023';
  end if;
  new.bytes := coalesce((obj.metadata ->> 'size')::bigint, 0);
  stored_mime := obj.metadata ->> 'mimetype';
  if new.bytes < 1 then
    raise exception 'A file didn''t finish uploading. Try sending again.' using errcode = '22023';
  end if;

  if m.sealed is not null then
    -- Encrypted: the bytes are opaque, and the description is sealed with this message's keys.
    if new.sealed is null
      or stored_mime is distinct from 'application/octet-stream'
      or new.bytes > 52428864
      or jsonb_typeof(new.sealed) <> 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(new.sealed) as k) <> array['ct', 'iv', 'rk', 'sk', 'v']
      or new.sealed -> 'v' <> '1'::jsonb
      or coalesce(new.sealed ->> 'iv', '') !~ '^[A-Za-z0-9+/]{16}$'
      or coalesce(new.sealed ->> 'ct', '') !~ '^[A-Za-z0-9+/]{24,}={0,2}$'
      or new.sealed ->> 'sk' is distinct from m.sealed ->> 'sk'
      or new.sealed ->> 'rk' is distinct from m.sealed ->> 'rk' then
      raise exception 'That file wasn''t encrypted properly. Reload Cabal and try again.' using errcode = '22023';
    end if;
  else
    if new.sealed is not null
      or stored_mime is distinct from new.mime
      or new.kind is distinct from (case when new.mime like 'image/%' then 'image' when new.mime like 'video/%' then 'video' end)
      or new.mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime')
      or (new.kind = 'image' and new.bytes > 15728640)
      or (new.kind = 'video' and new.bytes > 52428800) then
      raise exception 'That file isn''t a photo or video Cabal can share.' using errcode = '22023';
    end if;
    new.name := btrim(new.name);
  end if;

  -- Files are for sharing work, not filling the disk: a separate hourly budget.
  select count(*), coalesce(sum(bytes), 0) into recent, recent_bytes
    from public.message_files
    where author_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 120 or recent_bytes + new.bytes > 2147483648 then
    raise exception 'You''ve shared a lot of files this hour. Try again a little later.' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_message_file() from public, anon, authenticated;

create trigger message_files_guard before insert on public.message_files
  for each row execute function public.guard_message_file();

-- A message with files never exists without all of them: checked when the transaction commits.
create or replace function public.require_message_files() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.message_files where message_id = new.id) <> new.files then
    raise exception 'A file didn''t finish uploading. Try sending again.' using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke all on function public.require_message_files() from public, anon, authenticated;

create constraint trigger messages_files_present after insert on public.messages
  deferrable initially deferred
  for each row when (new.files > 0)
  execute function public.require_message_files();

-- Same as 0017, except a message may be only files.
create or replace function public.guard_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recent int;
  other uuid;
begin
  new.created_at := now();
  new.deleted_at := null;
  if new.sealed is not null then
    if new.kind <> 'user' or not exists (select 1 from public.channels where id = new.channel_id and kind = 'dm') then
      raise exception 'Only direct messages are end-to-end encrypted' using errcode = '22023';
    end if;
    if jsonb_typeof(new.sealed) <> 'object'
      or (select array_agg(k order by k) from jsonb_object_keys(new.sealed) as k) <> array['ct', 'iv', 'rk', 'sk', 'v']
      or new.sealed -> 'v' <> '1'::jsonb
      or coalesce(new.sealed ->> 'iv', '') !~ '^[A-Za-z0-9+/]{16}$'
      or coalesce(new.sealed ->> 'ct', '') !~ '^[A-Za-z0-9+/]{24,}={0,2}$'
      or coalesce(new.sealed ->> 'sk', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(new.sealed ->> 'rk', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That message wasn''t encrypted properly. Reload Cabal and try again.' using errcode = '22023';
    end if;
    select user_id into other from public.dm_participants
      where channel_id = new.channel_id and user_id <> new.author_id
      limit 1;
    if not exists (
        select 1 from public.e2ee_keys
        where id = (new.sealed ->> 'sk')::uuid and user_id = new.author_id and retired_at is null
      ) or not exists (
        select 1 from public.e2ee_keys
        where id = (new.sealed ->> 'rk')::uuid and user_id = other and retired_at is null
      ) then
      raise exception 'An encryption key changed. Try sending again.' using errcode = 'P0409';
    end if;
    new.body := '';
  else
    new.body := btrim(new.body);
    if char_length(new.body) = 0 and new.files = 0 then
      raise exception 'Message is empty' using errcode = '22023';
    end if;
  end if;
  if new.kind = 'user' then
    select count(*) into recent from public.messages
      where author_id = new.author_id and created_at > now() - interval '20 seconds';
    if recent >= 15 then
      raise exception 'You are sending messages too quickly. Wait a moment.' using errcode = 'P0429';
    end if;
  end if;
  return new;
end;
$$;

-- One call writes the message and its files. SECURITY INVOKER: the caller's own
-- insert policies and the usual message trigger apply.
create or replace function public.send_message_with_files(
  p_id uuid,
  p_channel uuid,
  p_body text,
  p_sealed jsonb,
  p_files jsonb
) returns setof public.messages
language plpgsql security invoker set search_path = '' as $$
declare
  sent public.messages;
  n int := case when jsonb_typeof(p_files) = 'array' then jsonb_array_length(p_files) else 0 end;
begin
  if n < 1 or n > 6 then
    raise exception 'A message holds one to six files' using errcode = '22023';
  end if;
  insert into public.messages (id, channel_id, author_id, body, sealed, files)
    values (p_id, p_channel, auth.uid(), case when p_sealed is null then coalesce(p_body, '') else '' end, p_sealed, n)
    returning * into sent;
  insert into public.message_files (id, message_id, channel_id, author_id, position, path, bytes, kind, mime, name, width, height, sealed)
    select
      (f ->> 'id')::uuid,
      p_id,
      p_channel,
      auth.uid(),
      (ord - 1)::smallint,
      f ->> 'path',
      0,
      f ->> 'kind',
      f ->> 'mime',
      f ->> 'name',
      (f ->> 'width')::int,
      (f ->> 'height')::int,
      case when jsonb_typeof(f -> 'sealed') = 'object' then f -> 'sealed' end
    from jsonb_array_elements(p_files) with ordinality as t(f, ord);
  return next sent;
end;
$$;

revoke all on function public.send_message_with_files(uuid, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.send_message_with_files(uuid, uuid, text, jsonb, jsonb) to authenticated;

-- Deleting a message hides its files at once (their links stop working).
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
  delete from public.message_files where message_id = p_message;
  update public.messages
    set deleted_at = now(), body = 'deleted', sealed = null, long_text = false, long_chars = null, files = 0
    where id = p_message;
end;
$$;
