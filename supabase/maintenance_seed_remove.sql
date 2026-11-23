-- Remove the sample made by supabase/maintenance_seed.sql (only the rows listed in fms_seed.maintenance_rows).
--   bash scripts/migrate.sh --remove-maintenance-seed

begin;

do $remove$
declare
  t text;
  n integer := 0;
  c integer;
begin
  if to_regclass('fms_seed.maintenance_rows') is null then
    raise notice 'No maintenance sample to remove.';
    return;
  end if;
  update public.message_outbox m set status = 'skipped', last_error = 'Sample data removed'
  where m.id in (select row_id from fms_seed.maintenance_rows where table_name = 'message_outbox') and m.status in ('pending', 'failed');
  foreach t in array array['attachments', 'approval_signoffs', 'approval_events', 'approval_links', 'notifications',
    'maintenance_invoices', 'maintenance_purchase_orders', 'maintenance_spare_parts', 'maintenance_work_orders', 'maintenance_costs'] loop
    execute format('delete from public.%I where id in (select row_id from fms_seed.maintenance_rows where table_name = %L)', t, t);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  delete from fms_seed.maintenance_rows;
  raise notice 'Maintenance sample rows removed: %', n;
end
$remove$;

commit;
