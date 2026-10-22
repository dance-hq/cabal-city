-- System notices ("Ada Park (@ada) joined.") have no author. The old check,
-- `m.author_id = auth.uid() and …`, came out NULL for them instead of false,
-- so `not (…)` never raised and anyone could delete one. Authorship now has to
-- be a real match; admins can still remove anything in a room, notices included.

create or replace function public.delete_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.channels;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into m from public.messages where id = p_message;
  if m.id is null then raise exception 'Message not found' using errcode = 'P0002'; end if;
  select * into c from public.channels where id = m.channel_id;
  if not coalesce(
    (m.author_id is not null and m.author_id = me and public.can_read_channel(c.id))
    or (c.kind = 'room' and public.is_admin(c.community_id)),
    false
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

revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;
