-- Optional links on a profile (personal site, X, LinkedIn, GitHub…). Up to
-- four plain https URLs; nothing is required to use Cabal.
create function public.valid_profile_links(links text[]) returns boolean
language sql immutable set search_path = '' as $$
  select links is null or (
    coalesce(array_length(links, 1), 0) <= 4
    and not exists (
      select 1 from unnest(links) as l
      where l is null or char_length(l) > 200 or l !~ '^https?://[^\s<>"'']+$'
    )
  )
$$;

alter table public.profiles
  add column links text[] check (public.valid_profile_links(links));

grant update (links) on public.profiles to authenticated;
