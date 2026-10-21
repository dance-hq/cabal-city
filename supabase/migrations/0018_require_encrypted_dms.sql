-- From here on, every new direct message must be end-to-end encrypted.
--
-- Apply this only once the app that encrypts direct messages (shipped with
-- 0017) is live, or people on the old app can't send DMs. Messages sent
-- before stay as they were; the app marks them "sent before encryption".

create function public.require_sealed_dm() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'user' and new.sealed is null
    and exists (select 1 from public.channels where id = new.channel_id and kind = 'dm') then
    raise exception 'Direct messages are end-to-end encrypted now. Reload Cabal to keep messaging.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.require_sealed_dm() from public, anon, authenticated;

create trigger messages_require_sealed before insert on public.messages
  for each row execute function public.require_sealed_dm();
