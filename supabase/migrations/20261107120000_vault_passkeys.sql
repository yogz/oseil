-- Face ID: a third lock on the vault's data key. Each row is one passkey (WebAuthn
-- with the PRF extension) and the data key wrapped by the secret that passkey derives.
-- The server only stores the opaque { iv, ciphertext } packet. No update: a passkey
-- is added or removed, never edited.

create table public.vault_passkeys (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  credential_id text not null,
  passkey_id uuid not null,
  wrapped jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, credential_id),
  unique (user_id, passkey_id)
);

revoke all on table public.vault_passkeys from anon, authenticated;
grant select, insert, delete on table public.vault_passkeys to authenticated;

alter table public.vault_passkeys enable row level security;

create policy vault_passkeys_select on public.vault_passkeys for select to authenticated
  using (user_id = (select auth.uid()));
create policy vault_passkeys_insert on public.vault_passkeys for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy vault_passkeys_delete on public.vault_passkeys for delete to authenticated
  using (user_id = (select auth.uid()));
