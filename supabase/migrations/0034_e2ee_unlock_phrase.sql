-- An unlock phrase: a second backup of your keys, locked with a phrase you
-- choose, so any device you sign in on can unlock direct messages by typing it
-- (or letting a password manager fill it), without another device being on.
--
-- The phrase never leaves your device. It's stretched with PBKDF2-SHA256
-- (the salt and iteration count are stored here) into the AES-GCM key that
-- locks the backup (lib/e2ee/crypto.ts). Like the recovery-key backup, only
-- you can read your row, and the server can't open it.

create table public.e2ee_phrase_backups (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  key_id uuid not null references public.e2ee_keys (id) on delete cascade,
  salt text not null check (salt ~ '^[A-Za-z0-9+/]{22}==$'),
  iterations int not null check (iterations between 600000 and 5000000),
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  keyring text not null check (char_length(keyring) between 24 and 20000),
  updated_at timestamptz not null default now()
);

alter table public.e2ee_phrase_backups enable row level security;
create policy e2ee_phrase_backups_select on public.e2ee_phrase_backups for select to authenticated
  using (user_id = auth.uid());

-- Only for your current key, so an out-of-date device can't save old keys.
create function public.e2ee_save_phrase(p_key uuid, p_salt text, p_iterations int, p_iv text, p_backup text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not coalesce(exists (
    select 1 from public.e2ee_keys k where k.id = p_key and k.user_id = auth.uid() and k.retired_at is null
  ), false) then
    raise exception 'This device is out of date. Unlock it again first.' using errcode = 'P0409';
  end if;
  insert into public.e2ee_phrase_backups (user_id, key_id, salt, iterations, iv, keyring)
    values (auth.uid(), p_key, p_salt, p_iterations, p_iv, p_backup)
    on conflict (user_id) do update
      set key_id = excluded.key_id, salt = excluded.salt, iterations = excluded.iterations,
          iv = excluded.iv, keyring = excluded.keyring, updated_at = now();
end;
$$;

create function public.e2ee_remove_phrase() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  delete from public.e2ee_phrase_backups where user_id = auth.uid();
end;
$$;

-- Starting over retires the key a phrase backup holds. Drop the backup so no
-- device is offered one that can only give it out-of-date keys.
create function public.e2ee_drop_stale_phrase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.e2ee_phrase_backups where key_id = new.id;
  return null;
end;
$$;

create trigger e2ee_keys_drop_stale_phrase
  after update of retired_at on public.e2ee_keys
  for each row when (old.retired_at is null and new.retired_at is not null)
  execute function public.e2ee_drop_stale_phrase();

revoke all on function public.e2ee_save_phrase(uuid, text, int, text, text) from public, anon;
revoke all on function public.e2ee_remove_phrase() from public, anon;
revoke all on function public.e2ee_drop_stale_phrase() from public, anon, authenticated;
grant execute on function public.e2ee_save_phrase(uuid, text, int, text, text) to authenticated;
grant execute on function public.e2ee_remove_phrase() to authenticated;
