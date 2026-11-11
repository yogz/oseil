-- Encrypted vault: the server only ever stores opaque packets, one set per user,
-- isolated by row-level security. Plus a heartbeat touched daily to keep the
-- free-tier project from pausing.

create table public.vaults (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kdf jsonb not null,
  wrapped_by_password jsonb not null,
  wrapped_by_recovery jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('profile', 'snapshot', 'draft', 'goals', 'settings')),
  iv text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_kind on public.documents (user_id, kind);

-- No access for anonymous visitors; signed-in users only reach their own rows.
revoke all on public.vaults from anon;
revoke all on public.documents from anon;
grant select, insert, update, delete on public.vaults to authenticated;
grant select, insert, update, delete on public.documents to authenticated;

alter table public.vaults enable row level security;
alter table public.documents enable row level security;

create policy vaults_select on public.vaults for select to authenticated
  using (user_id = (select auth.uid()));
create policy vaults_insert on public.vaults for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy vaults_update on public.vaults for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy vaults_delete on public.vaults for delete to authenticated
  using (user_id = (select auth.uid()));

create policy documents_select on public.documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy documents_insert on public.documents for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy documents_delete on public.documents for delete to authenticated
  using (user_id = (select auth.uid()));

-- Heartbeat: one row, no policy (so no direct access); only keep_alive() touches it.
create table public.heartbeat (
  id int primary key check (id = 1),
  seen_at timestamptz not null
);
alter table public.heartbeat enable row level security;
revoke all on public.heartbeat from anon, authenticated;

insert into public.heartbeat (id, seen_at) values (1, now());

create function public.keep_alive() returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.heartbeat set seen_at = now() where id = 1 returning seen_at;
$$;

revoke all on function public.keep_alive() from public;
revoke all on function public.keep_alive() from authenticated;
grant execute on function public.keep_alive() to anon;
