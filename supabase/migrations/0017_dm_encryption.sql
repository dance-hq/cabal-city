-- End-to-end encrypted direct messages.
--
-- Each person has one active key pair. The private half is made on their
-- device and never leaves their devices; only the public half is stored here.
-- Direct messages are sealed on the sender's device for exactly the two keys
-- of that conversation (lib/e2ee/crypto.ts). The database checks a sealed
-- message is well formed and points at the right two keys, and can't read it.
--
-- New devices get the keys from a device you already use (approved on that
-- device after comparing a code on both screens) or from a backup that only
-- your recovery key can open.
--
-- This migration only adds things: plain direct messages still work, so the
-- current app keeps running. 0018 refuses them once the new app is live.

-- ---------------------------------------------------------------------------
-- Public keys
-- ---------------------------------------------------------------------------

create table public.e2ee_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Raw P-256 public key, base64.
  public_key text not null check (public_key ~ '^[A-Za-z0-9+/]{87}=$'),
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create unique index e2ee_keys_one_active on public.e2ee_keys (user_id) where retired_at is null;
create index e2ee_keys_user_idx on public.e2ee_keys (user_id, created_at desc);

-- Keys of people in your community, and of anyone you've had a direct message
-- with (so old conversations stay readable after someone leaves).
create function public.e2ee_can_see_key(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid()
    or public.shares_community(owner)
    or exists (
      select 1 from public.dm_participants a
      join public.dm_participants b on b.channel_id = a.channel_id
      where a.user_id = auth.uid() and b.user_id = owner
    )
$$;

alter table public.e2ee_keys enable row level security;
create policy e2ee_keys_select on public.e2ee_keys for select to authenticated
  using (public.e2ee_can_see_key(user_id));

-- Your keys, locked with your recovery key. Only you can read the row, and
-- only your recovery key can open it.
create table public.e2ee_backups (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  key_id uuid not null references public.e2ee_keys (id) on delete cascade,
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  keyring text not null check (char_length(keyring) between 24 and 20000),
  updated_at timestamptz not null default now()
);

alter table public.e2ee_backups enable row level security;
create policy e2ee_backups_select on public.e2ee_backups for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Unlocking a new device from one you already use
-- ---------------------------------------------------------------------------
-- 1. The new device posts a one-time public key and a commitment to a nonce.
-- 2. A device you already use answers with its own one-time key and nonce.
-- 3. The new device reveals its nonce. Both screens now show the same code,
--    computed from all four values. Nobody in the middle could have picked
--    theirs to make the codes match, because each side committed first.
-- 4. Once you confirm the codes match, the old device seals your keys to the
--    new device's one-time key.

create table public.e2ee_device_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  request_key text not null check (request_key ~ '^[A-Za-z0-9+/]{87}=$'),
  commitment text not null check (commitment ~ '^[A-Za-z0-9+/]{43}=$'),
  approver_key text check (approver_key ~ '^[A-Za-z0-9+/]{87}=$'),
  approver_nonce text check (approver_nonce ~ '^[A-Za-z0-9+/]{22}==$'),
  reveal_nonce text check (reveal_nonce ~ '^[A-Za-z0-9+/]{22}==$'),
  sealed_iv text check (sealed_iv ~ '^[A-Za-z0-9+/]{16}$'),
  sealed_keyring text check (char_length(sealed_keyring) between 24 and 20000),
  status text not null default 'waiting'
    check (status in ('waiting', 'comparing', 'revealed', 'approved', 'declined')),
  created_at timestamptz not null default now()
);

create index e2ee_device_requests_user_idx on public.e2ee_device_requests (user_id, created_at desc);

alter table public.e2ee_device_requests enable row level security;
create policy e2ee_device_requests_select on public.e2ee_device_requests for select to authenticated
  using (user_id = auth.uid());
create policy e2ee_device_requests_delete on public.e2ee_device_requests for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.e2ee_device_requests;

-- ---------------------------------------------------------------------------
-- Writes (all through these functions; there are no insert/update policies)
-- ---------------------------------------------------------------------------

-- Publishes your key and its backup. Refuses when you already have a key,
-- unless you're resetting (p_replace), which retires the old one. The device
-- picks the id, because the backup it locks up already names the key.
create function public.e2ee_publish_key(
  p_id uuid, p_public_key text, p_backup_iv text, p_backup text, p_replace boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  kid uuid;
  recent int;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('e2ee:' || auth.uid()::text));
  if exists (select 1 from public.e2ee_keys where user_id = auth.uid() and retired_at is null) then
    if not p_replace then
      raise exception 'Encrypted messages are already set up on another device' using errcode = 'P0409';
    end if;
    select count(*) into recent from public.e2ee_keys
      where user_id = auth.uid() and created_at > now() - interval '1 day';
    if recent >= 5 then
      raise exception 'You''ve reset encrypted messages a lot today. Try again tomorrow.' using errcode = 'P0429';
    end if;
    update public.e2ee_keys set retired_at = now() where user_id = auth.uid() and retired_at is null;
  end if;
  insert into public.e2ee_keys (id, user_id, public_key) values (p_id, auth.uid(), p_public_key) returning id into kid;
  insert into public.e2ee_backups (user_id, key_id, iv, keyring)
    values (auth.uid(), kid, p_backup_iv, p_backup)
    on conflict (user_id) do update
      set key_id = excluded.key_id, iv = excluded.iv, keyring = excluded.keyring, updated_at = now();
  -- Anything waiting for approval would get the old keys.
  delete from public.e2ee_device_requests where user_id = auth.uid();
  return kid;
end;
$$;

-- A new recovery key: replaces the backup, only for your current key, so an
-- out-of-date device can't overwrite a newer one.
create function public.e2ee_save_backup(p_key uuid, p_iv text, p_backup text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.e2ee_backups set iv = p_iv, keyring = p_backup, updated_at = now()
    where user_id = auth.uid() and key_id = p_key
      and exists (select 1 from public.e2ee_keys k where k.id = p_key and k.user_id = auth.uid() and k.retired_at is null);
  if not found then
    raise exception 'This device is out of date. Unlock it again first.' using errcode = 'P0409';
  end if;
end;
$$;

create function public.e2ee_request_device(p_label text, p_key text, p_commitment text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
  recent int;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.e2ee_keys where user_id = auth.uid() and retired_at is null) then
    raise exception 'Encrypted messages aren''t set up on any device yet' using errcode = 'P0002';
  end if;
  select count(*) into recent from public.e2ee_device_requests
    where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'Too many unlock requests. Try again later, or use your recovery key.' using errcode = 'P0429';
  end if;
  delete from public.e2ee_device_requests where user_id = auth.uid() and created_at < now() - interval '1 day';
  insert into public.e2ee_device_requests (user_id, label, request_key, commitment)
    values (auth.uid(), left(btrim(p_label), 80), p_key, p_commitment)
    returning id into rid;
  return rid;
end;
$$;

-- Step 2, from a device you already use.
create function public.e2ee_claim_device(p_request uuid, p_key text, p_nonce text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.e2ee_device_requests
    set approver_key = p_key, approver_nonce = p_nonce, status = 'comparing'
    where id = p_request and user_id = auth.uid() and status = 'waiting'
      and created_at > now() - interval '10 minutes';
  if not found then
    raise exception 'That request expired or another device answered it' using errcode = 'P0002';
  end if;
end;
$$;

-- Step 3, from the new device. The nonce must match what it committed to.
create function public.e2ee_reveal_device(p_request uuid, p_nonce text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.e2ee_device_requests
    set reveal_nonce = p_nonce, status = 'revealed'
    where id = p_request and user_id = auth.uid() and status = 'comparing'
      and created_at > now() - interval '10 minutes'
      and commitment = encode(sha256(decode(p_nonce, 'base64')), 'base64');
  if not found then
    raise exception 'That request expired. Start again.' using errcode = 'P0002';
  end if;
end;
$$;

-- Step 4, from the device that answered, once you've compared the codes.
create function public.e2ee_approve_device(p_request uuid, p_iv text, p_keyring text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.e2ee_device_requests
    set sealed_iv = p_iv, sealed_keyring = p_keyring, status = 'approved'
    where id = p_request and user_id = auth.uid() and status = 'revealed'
      and created_at > now() - interval '10 minutes';
  if not found then
    raise exception 'That request expired. Start again on the new device.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.e2ee_decline_device(p_request uuid) returns void
language sql security definer set search_path = '' as $$
  update public.e2ee_device_requests set status = 'declined'
    where id = p_request and user_id = auth.uid() and status in ('waiting', 'comparing', 'revealed')
$$;

-- ---------------------------------------------------------------------------
-- Sealed messages
-- ---------------------------------------------------------------------------
-- A sealed message keeps an empty body; the envelope is
-- { v: 1, sk: sender key id, rk: recipient key id, iv, ct }.

alter table public.messages add column sealed jsonb;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (
  (sealed is null and char_length(body) between 1 and 4000)
  or (sealed is not null and body = '')
);
alter table public.messages add constraint messages_sealed_size check (
  sealed is null or octet_length(sealed::text) <= 24000
);

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
    if char_length(new.body) = 0 then
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
  update public.messages set deleted_at = now(), body = 'deleted', sealed = null where id = p_message;
end;
$$;

-- Nobody but the two people can read a sealed message, so reporting one goes
-- through /api/reports/sealed: the reporter hands over the key for that one
-- message, the server checks it really opens the stored message, and only
-- then files the report with the text.
create or replace function public.report_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.channels;
  recent int;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null or not public.can_read_channel(m.channel_id) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  if m.sealed is not null then
    raise exception 'Reload Cabal to report this message.' using errcode = '22023';
  end if;
  select count(*) into recent from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many reports. Try again later.' using errcode = 'P0429'; end if;
  select * into c from public.channels where id = m.channel_id;
  insert into public.reports (community_id, reporter_id, reported_user_id, message_id, message_excerpt, reason)
    values (c.community_id, auth.uid(), m.author_id, m.id, left(m.body, 500), left(btrim(p_reason), 500));
end;
$$;

create function public.report_sealed_message(p_reporter uuid, p_message uuid, p_reason text, p_excerpt text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.channels;
  recent int;
begin
  select * into m from public.messages where id = p_message;
  if m.id is null or m.sealed is null or m.deleted_at is not null or m.author_id = p_reporter
    or not exists (select 1 from public.dm_participants where channel_id = m.channel_id and user_id = p_reporter) then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;
  select count(*) into recent from public.reports where reporter_id = p_reporter and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'Too many reports. Try again later.' using errcode = 'P0429'; end if;
  select * into c from public.channels where id = m.channel_id;
  insert into public.reports (community_id, reporter_id, reported_user_id, message_id, message_excerpt, reason)
    values (c.community_id, p_reporter, m.author_id, m.id, left(p_excerpt, 500), left(btrim(p_reason), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.e2ee_can_see_key(uuid) from public, anon;
revoke all on function public.e2ee_publish_key(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.e2ee_save_backup(uuid, text, text) from public, anon;
revoke all on function public.e2ee_request_device(text, text, text) from public, anon;
revoke all on function public.e2ee_claim_device(uuid, text, text) from public, anon;
revoke all on function public.e2ee_reveal_device(uuid, text) from public, anon;
revoke all on function public.e2ee_approve_device(uuid, text, text) from public, anon;
revoke all on function public.e2ee_decline_device(uuid) from public, anon;
grant execute on function public.e2ee_can_see_key(uuid) to authenticated;
grant execute on function public.e2ee_publish_key(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.e2ee_save_backup(uuid, text, text) to authenticated;
grant execute on function public.e2ee_request_device(text, text, text) to authenticated;
grant execute on function public.e2ee_claim_device(uuid, text, text) to authenticated;
grant execute on function public.e2ee_reveal_device(uuid, text) to authenticated;
grant execute on function public.e2ee_approve_device(uuid, text, text) to authenticated;
grant execute on function public.e2ee_decline_device(uuid) to authenticated;

-- Only the server's report route, after it has checked the message key.
revoke all on function public.report_sealed_message(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_sealed_message(uuid, uuid, text, text) to service_role;
