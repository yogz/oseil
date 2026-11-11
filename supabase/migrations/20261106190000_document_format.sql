-- The format number is written in clear on each document: it says nothing about a
-- person's situation, and lets the device set aside a packet it does not understand.
alter table public.documents
  add column format smallint not null default 1 check (format >= 1);

-- One profile, one settings document and one draft per person; snapshots and goals
-- may be many.
create unique index documents_one_per_person on public.documents (user_id, kind)
  where kind in ('profile', 'settings', 'draft');
