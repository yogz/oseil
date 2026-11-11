-- The date on which the person said they put their recovery key aside. Empty means
-- "never confirmed": the next sign-in then replaces the key with a new one.
alter table public.vaults add column recovery_confirmed_at timestamptz;

-- Decision 4 (6 November 2026): the one vault that exists, created that day, belongs to
-- Nicolas, who confirmed having noted his key. It is marked confirmed so he is not shown
-- a new key. Limited to vaults created before 7 November 2026: any later vault starts
-- unconfirmed.
update public.vaults set recovery_confirmed_at = created_at
  where recovery_confirmed_at is null and created_at < '2026-11-07';
