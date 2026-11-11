-- Update reminder (spec 2026-11-11-rappel-mise-a-jour-design.md, « Le stockage »).
-- One row per account, created on demand: whether the e-mail reminder is switched off,
-- when the last one was sent, and a random token for the unsubscribe link. Nothing here
-- describes the person's situation (validated by Nicolas on 11 November 2026).

create table public.update_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_off boolean not null default false,
  last_sent_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique
);

-- No policy and no privilege: nobody reads or writes the table directly. Only the
-- security-definer functions below (and the sending functions of a later migration) touch it.
alter table public.update_reminders enable row level security;
revoke all on public.update_reminders from anon, authenticated, public;

-- Is my e-mail reminder on? True unless my row says it is off (no row means on).
create function public.my_reminder_email() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select not r.email_off from public.update_reminders r where r.user_id = auth.uid()),
    true
  );
$$;

revoke all on function public.my_reminder_email() from public;
revoke all on function public.my_reminder_email() from anon;
grant execute on function public.my_reminder_email() to authenticated;

-- Switches my e-mail reminder on or off. Creates my row if needed; touches only email_off.
create function public.set_my_reminder_email(enabled boolean) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.update_reminders (user_id, email_off)
  values (auth.uid(), not set_my_reminder_email.enabled)
  on conflict (user_id) do update set email_off = excluded.email_off;
$$;

revoke all on function public.set_my_reminder_email(boolean) from public;
revoke all on function public.set_my_reminder_email(boolean) from anon;
grant execute on function public.set_my_reminder_email(boolean) to authenticated;

-- The unsubscribe link: switches off the account whose token matches. Returns nothing,
-- whether a row matched or not, so the page never tells whether an account exists.
create function public.stop_reminder(token uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.update_reminders
  set email_off = true
  where unsubscribe_token = stop_reminder.token;
$$;

revoke all on function public.stop_reminder(uuid) from public;
grant execute on function public.stop_reminder(uuid) to anon, authenticated;
