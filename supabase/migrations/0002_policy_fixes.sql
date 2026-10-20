-- teams_select: "id" inside the subquery resolved to team_invites.id, so
-- invitees could not read the team they were invited to.
drop policy teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (
    public.is_team_member(teams.id)
    or exists (select 1 from public.team_invites i where i.team_id = teams.id and i.user_id = auth.uid())
  );

-- Avatars may only point at Cabal's own avatar bucket (no tracking pixels).
alter table public.profiles add constraint profiles_avatar_own_bucket
  check (avatar_url is null or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]+$');
