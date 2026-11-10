-- MDV Fleet Management System
-- Migration 5: daily job calls the email Edge Function after reminders are processed.
-- Requires pg_cron and pg_net (both available on Supabase). No-op elsewhere.
-- Set the function URL and service key once per environment:
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/send-reminder-emails', 'fms_email_function_url');
--   select vault.create_secret('<service role key>', 'fms_service_role_key');

create or replace function public.call_email_function()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fms_email_function_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'fms_service_role_key' limit 1;
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := '{}'::jsonb
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  end if;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('fms-send-reminder-emails', '15 6 * * *', $cmd$select public.call_email_function();$cmd$);
  end if;
end $$;
