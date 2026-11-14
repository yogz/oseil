-- Delete my account (spec 2026-11-12-supprimer-mon-compte-design.md).
-- A signed-in person deletes their own account. Every table that holds their data
-- (vaults, documents, vault_passkeys, update_reminders) references auth.users with
-- "on delete cascade", so removing the user removes it all. The authentication audit
-- entries that carry the account id are purged first, so no trace of the person is kept.

create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  delete from auth.audit_log_entries where payload->>'actor_id' = auth.uid()::text;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
