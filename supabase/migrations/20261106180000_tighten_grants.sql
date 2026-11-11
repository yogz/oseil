-- Supabase's default privileges also give TRUNCATE, REFERENCES and TRIGGER to
-- authenticated (and may give some to anon). Row-level security does not cover
-- TRUNCATE, so keep only what the application needs.
revoke all on table public.vaults, public.documents from anon, authenticated;
grant select, insert, update, delete on table public.vaults, public.documents to authenticated;
