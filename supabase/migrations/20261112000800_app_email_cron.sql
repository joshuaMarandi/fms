-- MDV Fleet Management System
-- Migration 8: emails are sent by the app server (SMTP), not an Edge Function.
-- The daily job now calls the app route /api/cron/notifications with the shared CRON_SECRET.
-- Configure once per environment (Supabase with pg_net and Vault):
--   select vault.create_secret('https://fms.yourdomain.com/api/cron/notifications', 'fms_notifications_url');
--   select vault.create_secret('<same value as CRON_SECRET in the app env>', 'fms_cron_secret');
-- Without pg_net, call the route from the server's crontab instead (see README).

create or replace function public.call_email_function()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fms_notifications_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'fms_cron_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );
end;
$$;
