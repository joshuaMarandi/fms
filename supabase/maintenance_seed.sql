-- Maintenance seed: sample maintenance and repair records for EVERY vehicle of the company, one of
-- each per month for the last 12 months (12 per vehicle in each tab):
--
--   Work orders       numbered WO-YYYY-NNNN, with the provider's email (example.com); older ones
--                     marked as sent (no email is actually sent).
--   Job cards         Preventive (PPM) and corrective in turn, with date in and out of the garage,
--                     km in and out, the work carried out and the labour cost.
--   Spare parts       parts, unit price and cost.
--   Invoices          labour plus parts, with an invoice attachment record. Older months approved by
--                     the fleet manager and the HOD; last month at the HOD; this month waiting for
--                     the fleet manager; one rejected.
--   Purchase orders   numbered PO-YYYY-NNNN: older months paid, last month partly paid, this month not paid.
--
-- Run after migrations (scripts/migrate.sh). It uses the company named in fms.seed_company, else the
-- company with the most vehicles, and that company's own users for each approval step.
-- Sample records only: every row is listed in fms_seed.maintenance_rows, so running it again first
-- removes the last sample, and supabase/maintenance_seed_remove.sql removes it for good. Approval
-- emails and SMS from the sample are marked skipped, so nobody is messaged. Attachments are records
-- only (no file behind them).
--
-- Server:
--   bash scripts/migrate.sh --maintenance-seed
-- or
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/maintenance_seed.sql

begin;

create schema if not exists fms_seed;
revoke all on schema fms_seed from public;
create table if not exists fms_seed.maintenance_rows (
  table_name text not null,
  row_id uuid not null,
  primary key (table_name, row_id)
);

-- ---------------------------------------------------------------------------
-- Helpers (this session only)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.mseed_remove() returns integer language plpgsql as $$
declare
  t text;
  n integer := 0;
  c integer;
begin
  update public.message_outbox m set status = 'skipped', last_error = 'Sample data removed'
  where m.id in (select row_id from fms_seed.maintenance_rows where table_name = 'message_outbox') and m.status in ('pending', 'failed');
  foreach t in array array['attachments', 'approval_signoffs', 'approval_events', 'approval_links', 'notifications',
    'maintenance_invoices', 'maintenance_purchase_orders', 'maintenance_spare_parts', 'maintenance_work_orders', 'maintenance_costs'] loop
    execute format('delete from public.%I where id in (select row_id from fms_seed.maintenance_rows where table_name = %L)', t, t);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  delete from fms_seed.maintenance_rows where table_name <> 'message_outbox';
  return n;
end;
$$;

create or replace function pg_temp.mseed_act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
$$;

-- A user of the company who may do p_action on p_resource; people in p_avoid only if nobody else can.
create or replace function pg_temp.mseed_user(p_company uuid, p_resource text, p_action text, p_avoid uuid[] default '{}')
returns uuid language sql stable as $$
  select p.id from public.profiles p
  where p.company_id = p_company and (to_jsonb(p) ->> 'deleted_at') is null
    and public.permission_scope_for(p.id, p_resource, p_action::public.permission_action) is not null
  order by (p.id = any(coalesce(p_avoid, '{}'))),
    (public.permission_scope_for(p.id, p_resource, p_action::public.permission_action)::text = 'own'),
    p.full_name
  limit 1;
$$;

-- Who records maintenance: someone who may create it, preferably not the fleet manager.
create or replace function pg_temp.mseed_requester(p_company uuid)
returns uuid language sql stable as $$
  select p.id from public.profiles p
  where p.company_id = p_company and (to_jsonb(p) ->> 'deleted_at') is null
    and public.permission_scope_for(p.id, 'expenses.maintenance.costs', 'create') is not null
  order by (public.permission_scope_for(p.id, 'expenses.maintenance.costs', 'approve') is not null), p.full_name
  limit 1;
$$;

-- Take the next p_times approval steps of a submitted invoice. Returns the steps taken.
create or replace function pg_temp.mseed_approve(p_id uuid, p_times integer, p_company uuid, p_requester uuid)
returns integer language plpgsql as $$
declare
  i integer := 0;
  v_step text;
  v_resource text;
  v_user uuid;
  v_used uuid[] := array[p_requester];
begin
  while i < p_times loop
    select coalesce(approval_step, 'approval') into v_step from public.maintenance_invoices where id = p_id and status = 'submitted';
    exit when v_step is null;
    select s.resource into v_resource from public.staged_steps('maintenance_invoices') s where s.step = v_step;
    v_user := pg_temp.mseed_user(p_company, v_resource, 'approve', v_used);
    if v_user is null then
      raise notice 'Nobody holds % (approve); invoice % waits there', v_resource, p_id;
      exit;
    end if;
    perform pg_temp.mseed_act(v_user);
    perform public.approve_request('maintenance_invoices', p_id, null, '{}'::jsonb);
    v_used := v_used || v_user;
    i := i + 1;
  end loop;
  return i;
end;
$$;

select pg_temp.mseed_remove() as "previous maintenance sample rows removed";

-- ---------------------------------------------------------------------------
-- The sample
-- ---------------------------------------------------------------------------
do $mseed$
declare
  v_company uuid := nullif(current_setting('fms.seed_company', true), '')::uuid;
  v_req uuid;
  v record;
  i integer := 0;
  m integer;
  v_month date;
  v_day date;
  v_km numeric;
  v_type text;
  v_provider text;
  v_email text;
  v_labour numeric;
  v_qty numeric;
  v_price numeric;
  v_part text;
  v_id uuid;
  v_steps integer;
  v_providers text[] := array['Toyota Tanzania Service Centre', 'CFAO Motors workshop', 'Mwanza Auto Garage', 'Kahama Diesel Works', 'Arusha Motor Clinic'];
  v_emails text[] := array['service@toyota-tz.example.com', 'workshop@cfao.example.com', 'info@mwanzaauto.example.com', 'jobs@kahamadiesel.example.com', 'clinic@arushamotor.example.com'];
  v_ppm text[] := array['PPM 5,000 km: engine oil, oil filter, general check', 'PPM 10,000 km: oil, oil and air filters, brake check', 'PPM 15,000 km: oil, fuel filter, greasing, tyre rotation', 'PPM 20,000 km: oil, all filters, coolant, brake fluid'];
  v_cr text[] := array['Replace front brake pads and discs', 'Repair alternator and replace drive belt', 'Replace rear shock absorbers', 'Fix radiator leak and replace hoses', 'Replace clutch kit', 'Rewire tail lights and indicators', 'Replace wheel bearing (front left)', 'Repair power steering leak'];
  v_wo text[] := array['Scheduled service and general check', 'Brakes squeal at low speed', 'Engine warning light on', 'Vibration at high speed', 'Air conditioning not cooling', 'Oil leak under the engine'];
  v_parts text[] := array['Engine oil 5W-30 (litres)', 'Oil filter', 'Air filter', 'Fuel filter', 'Brake pads (set)', 'Shock absorber', 'Drive belt', 'Wheel bearing', 'Radiator hose', 'Clutch kit'];
  v_part_price numeric[] := array[18000, 25000, 35000, 42000, 95000, 160000, 55000, 120000, 30000, 480000];
begin
  if v_company is null then
    select c.id into v_company from public.companies c
    where (to_jsonb(c) ->> 'deleted_at') is null
    order by (select count(*) from public.vehicles x where x.company_id = c.id and x.deleted_at is null) desc, c.name
    limit 1;
  end if;
  if v_company is null or not exists (select 1 from public.vehicles where company_id = v_company and deleted_at is null) then
    raise exception 'No company with vehicles found. Add vehicles first, or set fms.seed_company.';
  end if;
  raise notice 'Maintenance sample for company % (%)', (select name from public.companies where id = v_company), v_company;
  v_req := pg_temp.mseed_requester(v_company);

  for v in select x.id, x.odometer_km from public.vehicles x where x.company_id = v_company and x.deleted_at is null order by x.registration loop
    i := i + 1;
    for m in 0..11 loop
      v_month := (date_trunc('month', current_date) - make_interval(months => m))::date;
      -- A day in that month (not after today).
      v_day := least(v_month + ((i * 3 + m) % 20) + 2, current_date);
      if v_day < v_month then v_day := v_month; end if;
      v_km := greatest(coalesce(v.odometer_km, 90000) - 2500 * m - 300, 0);
      v_provider := v_providers[1 + ((i + m) % 5)];
      v_email := v_emails[1 + ((i + m) % 5)];
      v_type := case when (i + m) % 2 = 0 then 'maintenance' else 'repairs' end;
      v_labour := case when v_type = 'maintenance' then 120000 + ((i + m) % 4) * 40000 else 180000 + ((i * 7 + m) % 6) * 55000 end;
      v_qty := case when (i + m) % 10 = 0 then 7 else 1 + ((i + m) % 3) end;
      v_part := v_parts[1 + ((i + m) % 10)];
      v_price := v_part_price[1 + ((i + m) % 10)];

      perform pg_temp.mseed_act(v_req);

      -- Work order (before the garage visit).
      insert into public.maintenance_work_orders (company_id, vehicle_id, order_date, description, service_provider, provider_email, created_by)
      values (v_company, v.id, greatest(v_day - 1, v_month),
        case when v_type = 'maintenance' then 'Scheduled service (PPM) at ' || trim(to_char(v_km, 'FM999,999,990')) || ' km' else v_wo[1 + ((i + m) % 6)] end,
        v_provider, v_email, v_req)
      returning id into v_id;
      if m >= 1 then
        update public.maintenance_work_orders set emailed_at = (greatest(v_day - 1, v_month))::timestamptz + interval '9 hours', emailed_to = v_email where id = v_id;
      end if;

      -- Job card: the garage stay and the work carried out.
      insert into public.maintenance_costs (company_id, vehicle_id, cost_date, odometer_km, work_type, service_provider, activities, cost_tzs, date_in, date_out, km_in, km_out, created_by)
      values (v_company, v.id, v_day, v_km, v_type, v_provider,
        case when v_type = 'maintenance' then v_ppm[1 + ((i + m) % 4)] else v_cr[1 + ((i + m) % 8)] end,
        v_labour, greatest(v_day - (1 + (i + m) % 3), v_month), v_day, v_km, v_km + 4 + ((i + m) % 9), v_req);

      -- Spare parts used.
      insert into public.maintenance_spare_parts (company_id, vehicle_id, part_date, description, quantity, unit_price_tzs, created_by)
      values (v_company, v.id, v_day, v_part, v_qty, v_price, v_req);

      -- Purchase order: older months paid, last month partly paid, this month not paid.
      insert into public.maintenance_purchase_orders (company_id, vehicle_id, po_date, service_provider, amount_tzs, payment_status, created_by)
      values (v_company, v.id, greatest(v_day - 1, v_month), v_provider, v_labour + v_qty * v_price,
        case when m = 0 then 'unpaid' when m = 1 then 'partly_paid' else 'paid' end, v_req);

      -- Invoice: labour plus parts, through the approval steps.
      begin
        insert into public.maintenance_invoices (company_id, vehicle_id, invoice_number, invoice_date, service_provider, labour_tzs, parts_tzs, status, created_by)
        values (v_company, v.id, upper(left(regexp_replace(v_provider, '[^A-Za-z]', '', 'g'), 4)) || '-' || to_char(v_day, 'YYMM') || '-' || lpad(i::text, 3, '0'),
          v_day, v_provider, v_labour, v_qty * v_price, 'submitted', v_req)
        returning id into v_id;
        insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name, mime_type, size_bytes)
        values (v_company, 'maintenance_invoices', v_id, 'expenses.maintenance.costs', 'forms', v_company || '/maintenance_invoices/' || v_id || '/sample_invoice.pdf', 'Invoice', 'invoice.pdf', 'application/pdf', 51234);
        -- This month: waits for the fleet manager; last month: at the HOD; older: approved.
        v_steps := case when m = 0 then 0 when m = 1 then 1 else 2 end;
        perform pg_temp.mseed_approve(v_id, v_steps, v_company, v_req);
      exception when others then
        raise notice 'Invoice for vehicle % month % skipped: %', v.id, v_month, sqlerrm;
      end;
    end loop;
  end loop;

  -- One rejected invoice, for the record: the first vehicle's invoice of this month, by the fleet manager.
  select id into v_id from public.maintenance_invoices
  where company_id = v_company and created_at = now() and status = 'submitted' and coalesce(approval_step, 'approval') = 'approval'
  order by invoice_date limit 1;
  if v_id is not null then
    begin
      perform pg_temp.mseed_act(pg_temp.mseed_user(v_company, 'expenses.maintenance.costs', 'approve', array[v_req]));
      perform public.reject_request('maintenance_invoices', v_id, 'Labour charge is higher than the quotation; please send a corrected invoice.');
    exception when others then
      raise notice 'Rejected invoice skipped: %', sqlerrm;
    end;
  end if;
  perform pg_temp.mseed_act(null);

  -- List every row made by this run (all share this transaction's time), and silence its messages.
  insert into fms_seed.maintenance_rows (table_name, row_id)
  select x.t, x.id from (
    select 'maintenance_costs' t, id from public.maintenance_costs where company_id = v_company and created_at = now()
    union all select 'maintenance_work_orders', id from public.maintenance_work_orders where company_id = v_company and created_at = now()
    union all select 'maintenance_spare_parts', id from public.maintenance_spare_parts where company_id = v_company and created_at = now()
    union all select 'maintenance_invoices', id from public.maintenance_invoices where company_id = v_company and created_at = now()
    union all select 'maintenance_purchase_orders', id from public.maintenance_purchase_orders where company_id = v_company and created_at = now()
    union all select 'attachments', id from public.attachments where company_id = v_company and created_at = now() and table_name = 'maintenance_invoices'
    union all select 'approval_signoffs', id from public.approval_signoffs where company_id = v_company and created_at = now() and table_name = 'maintenance_invoices'
    union all select 'approval_events', id from public.approval_events where company_id = v_company and created_at = now() and table_name = 'maintenance_invoices'
    union all select 'approval_links', id from public.approval_links where company_id = v_company and created_at = now() and table_name = 'maintenance_invoices'
    union all select 'notifications', id from public.notifications where company_id = v_company and created_at = now() and link like '%/maintenance%'
  ) x
  on conflict do nothing;

  with sample_msg as (
    select mo.id from public.message_outbox mo
    where mo.created_at >= now() and mo.status = 'pending' and (mo.company_id = v_company or mo.company_id is null)
      and exists (select 1 from fms_seed.maintenance_rows s where s.table_name = 'maintenance_invoices' and mo.data ->> 'record_id' = s.row_id::text)
  ), marked as (
    update public.message_outbox mo set status = 'skipped', last_error = 'Sample data'
    from sample_msg s where mo.id = s.id returning mo.id
  )
  insert into fms_seed.maintenance_rows (table_name, row_id) select 'message_outbox', id from marked on conflict do nothing;
end
$mseed$;

select table_name as "maintenance sample table", count(*) as "rows" from fms_seed.maintenance_rows group by table_name order by table_name;

commit;
