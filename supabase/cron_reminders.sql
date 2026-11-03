-- =========================================================
-- NopeQ: run the reminder job every 10 minutes (Supabase pg_cron)
-- 1) Replace YOUR-SITE and YOUR_CRON_SECRET below (same value as CRON_SECRET in Vercel)
-- 2) Run in Supabase → SQL Editor
-- =========================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('nopeq-reminders') where exists (select 1 from cron.job where jobname = 'nopeq-reminders');

select cron.schedule(
  'nopeq-reminders',
  '*/10 * * * *',
  $$ select net.http_get(
       url := 'https://YOUR-SITE/api/cron/reminders',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
     ); $$
);
