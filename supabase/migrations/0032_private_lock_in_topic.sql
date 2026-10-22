-- The "someone locked in, look again" ping used a public realtime topic, which
-- anyone holding the public anon key could join and send to without signing
-- in. It becomes a private topic like typing: only active members of that
-- community can listen or send. The ping still carries no data.
create or replace function public.can_use_topic(topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic like 'chan:%' then
    return public.can_read_channel(substring(topic from 6)::uuid);
  end if;
  if topic like 'lock-ins:%' then
    return public.is_member(substring(topic from 10)::uuid);
  end if;
  return false;
exception when others then
  return false;
end;
$$;
