-- The daily run of the update reminder (spec of the reminder, « L’e-mail (6 mois) »), applied last,
-- once Nicolas had seen a real reminder in his own inbox (11 November 2026). 07:00 UTC: 8 h in Paris
-- in winter, 9 h in summer. At most 20 e-mails a run, one call to Resend (send_due_reminders).
-- To stop it: a new migration with `select cron.unschedule('send-update-reminders');`.

select cron.schedule('send-update-reminders', '0 7 * * *', 'select public.send_due_reminders()');
