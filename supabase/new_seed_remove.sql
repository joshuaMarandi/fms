-- Remove the sample made by supabase/new_seed.sql (only the rows listed in fms_seed.rows).
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/new_seed_remove.sql

begin;

do $remove$
declare
  t text;
  n integer := 0;
  c integer;
begin
  if to_regclass('fms_seed.rows') is null then
    raise notice 'No sample to remove.';
    return;
  end if;
  update public.message_outbox m set status = 'skipped', last_error = 'Sample data removed'
  where m.id in (select row_id from fms_seed.rows where table_name = 'message_outbox') and m.status in ('pending', 'failed');
  foreach t in array array['attachments', 'approval_signoffs', 'approval_events', 'approval_links', 'notifications',
    'petty_cash_transactions', 'petty_cash_requests', 'outstation_expense_items', 'outstation_requests',
    'leave_requests', 'leave_plan_rows', 'leave_plans', 'leave_balances', 'leave_categories',
    'timesheet_days', 'timesheets', 'maintenance_work_orders', 'maintenance_spare_parts', 'maintenance_invoices', 'maintenance_purchase_orders', 'maintenance_costs'] loop
    execute format('delete from public.%I where id in (select row_id from fms_seed.rows where table_name = %L)', t, t);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  delete from fms_seed.rows;
  raise notice 'Sample rows removed: %', n;
end
$remove$;

commit;
