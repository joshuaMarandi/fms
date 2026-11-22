-- New seed: sample records for the features added lately, on a database that already has its
-- migrations applied (run scripts/migrate.sh first).
--
--   Timesheets            this month and the two before, day / noon / night shifts with the
--                         one-hour rest, Saturday overtime, public holidays (special overtime),
--                         absent, sick and leave days, allowance on night shifts. Recorded by the
--                         coordinator: the oldest month approved by the fleet manager and the HOD,
--                         last month waiting for the HOD, this month for the fleet manager.
--   Leave plan            planned months, 28 entitled days, days carried forward, leave dates.
--   Leave requests        one at each step: fleet manager, HR, HOD, approved, rejected by HR.
--   Outstation allowance  allowance and other expenses, one at each step: fleet manager, HOD,
--                         approved (finance emailed), rejected; two trips for the same driver.
--   Petty cash            requests at each step, money given with proof of payment, and spending
--                         transactions (each with its receipt) at each step.
--   Maintenance           per vehicle, the last three months: job cards (PPM and corrective, with
--                         the garage stay), work orders, spare parts, invoices (one at each
--                         approval step) and purchase orders (not paid, partly paid, paid).
--
-- It works on the company named in fms.seed_company, else on the company with the most drivers,
-- using that company's own drivers, vehicles and users (each approval step is taken by a user who
-- holds that step's permission; a step nobody holds is left waiting).
--
-- Sample records only: real records are not changed. Every row it makes is listed in
-- fms_seed.rows, so running it again first removes the last sample, and
-- supabase/new_seed_remove.sql removes it for good. Approval emails and SMS from the sample are
-- marked skipped, so nobody is messaged. Attached proofs of payment and receipts are records only
-- (no file behind them).
--
-- Server:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/new_seed.sql
-- For a chosen company:
--   docker exec -i -e PGOPTIONS='-c fms.seed_company=<company uuid>' supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/new_seed.sql

begin;

create schema if not exists fms_seed;
revoke all on schema fms_seed from public;
create table if not exists fms_seed.rows (
  table_name text not null,
  row_id uuid not null,
  primary key (table_name, row_id)
);

-- ---------------------------------------------------------------------------
-- Helpers (this session only)
-- ---------------------------------------------------------------------------

-- Remove the sample made last time (children first).
create or replace function pg_temp.seed_remove() returns integer language plpgsql as $$
declare
  t text;
  n integer := 0;
  c integer;
begin
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
  delete from fms_seed.rows where table_name <> 'message_outbox';
  return n;
end;
$$;

create or replace function pg_temp.seed_act(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
$$;

-- A user of the company who may do p_action on p_resource; people in p_avoid only if nobody else can.
create or replace function pg_temp.seed_user(p_company uuid, p_resource text, p_action text, p_avoid uuid[] default '{}')
returns uuid language sql stable as $$
  select p.id from public.profiles p
  where p.company_id = p_company and (to_jsonb(p) ->> 'deleted_at') is null
    and public.permission_scope_for(p.id, p_resource, p_action::public.permission_action) is not null
  order by (p.id = any(coalesce(p_avoid, '{}'))),
    (public.permission_scope_for(p.id, p_resource, p_action::public.permission_action)::text = 'own'),
    p.full_name
  limit 1;
$$;

-- Who sends a request: someone who may create it, preferably not its first approver.
create or replace function pg_temp.seed_requester(p_company uuid, p_resource text)
returns uuid language sql stable as $$
  select p.id from public.profiles p
  where p.company_id = p_company and (to_jsonb(p) ->> 'deleted_at') is null
    and public.permission_scope_for(p.id, p_resource, 'create') is not null
  order by (public.permission_scope_for(p.id, p_resource, 'approve') is not null), p.full_name
  limit 1;
$$;

-- Take the next p_times approval steps of a submitted request. Returns the steps taken.
create or replace function pg_temp.seed_approve(p_table text, p_id uuid, p_times integer, p_company uuid, p_requester uuid, p_extra jsonb default '{}')
returns integer language plpgsql as $$
declare
  i integer := 0;
  v_step text;
  v_resource text;
  v_user uuid;
  v_used uuid[] := array[p_requester];
begin
  while i < p_times loop
    execute format('select coalesce(approval_step, ''approval'') from public.%I where id = $1 and status = ''submitted''', p_table) into v_step using p_id;
    exit when v_step is null;
    select s.resource into v_resource from public.staged_steps(p_table) s where s.step = v_step;
    v_user := pg_temp.seed_user(p_company, v_resource, 'approve', v_used);
    if v_user is null then
      raise notice 'Nobody holds % (approve); % % waits there', v_resource, p_table, p_id;
      exit;
    end if;
    perform pg_temp.seed_act(v_user);
    perform public.approve_request(p_table, p_id, null, p_extra);
    v_used := v_used || v_user;
    i := i + 1;
  end loop;
  return i;
end;
$$;

-- Reject a submitted request at its current step.
create or replace function pg_temp.seed_reject(p_table text, p_id uuid, p_company uuid, p_requester uuid, p_reason text)
returns boolean language plpgsql as $$
declare
  v_step text;
  v_resource text;
  v_user uuid;
begin
  execute format('select coalesce(approval_step, ''approval'') from public.%I where id = $1 and status = ''submitted''', p_table) into v_step using p_id;
  if v_step is null then return false; end if;
  select s.resource into v_resource from public.staged_steps(p_table) s where s.step = v_step;
  v_user := pg_temp.seed_user(p_company, v_resource, 'approve', array[p_requester]);
  if v_user is null then return false; end if;
  perform pg_temp.seed_act(v_user);
  perform public.reject_request(p_table, p_id, p_reason);
  return true;
end;
$$;

create or replace function pg_temp.seed_attach(p_company uuid, p_table text, p_id uuid, p_resource text, p_label text, p_file text)
returns void language sql as $$
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name, mime_type, size_bytes)
  values (p_company, p_table, p_id, p_resource, 'forms', p_company || '/' || p_table || '/' || p_id || '/sample_' || p_file, p_label, p_file, 'application/pdf', 48213);
$$;

select pg_temp.seed_remove() as "previous sample rows removed";

-- ---------------------------------------------------------------------------
-- The sample
-- ---------------------------------------------------------------------------
do $seed$
declare
  v_company uuid := nullif(current_setting('fms.seed_company', true), '')::uuid;
  v_year integer := extract(year from current_date)::int;
  v_drivers uuid[];
  v_vehicles uuid[];
  v_n integer;
  v_coord uuid;
  v_req uuid;
  v_cat uuid;
  d public.drivers;
  i integer;
  m integer;
  k integer;
  v_month date;
  v_id uuid;
  v_ids uuid[];
  v_months integer[];
  v_from date;
  v_txn uuid;
  v_mreq uuid;
begin
  if v_company is null then
    select c.id into v_company from public.companies c
    where (to_jsonb(c) ->> 'deleted_at') is null
    order by (select count(*) from public.drivers dr where dr.company_id = c.id and dr.deleted_at is null) desc, c.name
    limit 1;
  end if;
  if v_company is null or not exists (select 1 from public.drivers where company_id = v_company and deleted_at is null) then
    raise exception 'No company with drivers found. Add drivers first, or set fms.seed_company.';
  end if;
  raise notice 'Sample for company % (%)', (select name from public.companies where id = v_company), v_company;

  select array_agg(id order by full_name) into v_drivers
  from (select id, full_name from public.drivers where company_id = v_company and deleted_at is null order by full_name limit 6) x;
  select array_agg(id order by registration) into v_vehicles
  from (select id, registration from public.vehicles where company_id = v_company and deleted_at is null order by registration limit 6) x;
  v_n := array_length(v_drivers, 1);
  v_coord := pg_temp.seed_requester(v_company, 'expenses.leave.requests');

  -- -------------------------------------------------------------------------
  -- Timesheets: this month (to today) and the two before, for drivers without one.
  -- -------------------------------------------------------------------------
  perform pg_temp.seed_act(null);
  for i in 1..v_n loop
    select * into d from public.drivers where id = v_drivers[i];
    for m in 0..2 loop
      v_month := (date_trunc('month', current_date) - make_interval(months => m))::date;
      continue when exists (select 1 from public.timesheets t where t.deleted_at is null and t.period_month = v_month
        and (t.driver_id = d.id or (d.profile_id is not null and t.employee_id = d.profile_id)));
      perform pg_temp.seed_act(null);
      insert into public.timesheets (company_id, driver_id, employee_id, employee_name, employer, employment_number, job_title, department, period_month, status, coordinator_name, created_by)
      values (v_company, d.id, d.profile_id, d.full_name, d.employer, d.employment_number, d.job_title, d.department, v_month, 'draft',
        (select full_name from public.profiles where id = v_coord), v_coord)
      returning id into v_id;

      insert into public.timesheet_days (company_id, timesheet_id, work_date, day_type, shift, time_in, break_from, break_to, time_out, allowance_tzs, remarks)
      select v_company, v_id, x.dd, x.kind,
        case when x.kind in ('work', 'public_holiday') then x.shift else 'day' end,
        case when x.kind in ('work', 'public_holiday') then (array['06:00', '14:00', '22:00'])[x.s]::time end,
        case when x.kind in ('work', 'public_holiday') then (array['10:00', '18:00', '02:00'])[x.s]::time end,
        case when x.kind in ('work', 'public_holiday') then (array['11:00', '19:00', '03:00'])[x.s]::time end,
        case when x.kind in ('work', 'public_holiday') then
          ((array['14:00', '22:00', '06:00'])[x.s]::time + case when x.sat then interval '2 hours' else interval '0' end) end,
        case when x.kind = 'public_holiday' then 15000 when x.kind = 'work' and x.shift = 'night' then 10000 else 0 end,
        case when x.kind = 'public_holiday' then 'Worked on a public holiday'
             when x.kind = 'work' and x.sat then 'Two hours overtime'
             when x.kind = 'absent' then 'Did not report'
             when x.kind = 'sick' then 'Sick, clinic note' end
      from (
        select g.dd::date as dd,
          1 + ((extract(week from g.dd)::int + i) % 3) as s,
          (array['day', 'noon', 'night'])[1 + ((extract(week from g.dd)::int + i) % 3)] as shift,
          extract(dow from g.dd) = 6 as sat,
          case
            when extract(dow from g.dd) = 0 then 'rest'
            when to_char(g.dd, 'MM-DD') in ('01-01', '01-12', '04-07', '04-26', '05-01', '07-07', '08-08', '10-14', '12-09', '12-25', '12-26') then 'public_holiday'
            when extract(day from g.dd)::int = 1 + ((5 + i * 3) % 27) then 'absent'
            when i % 3 = 2 and extract(day from g.dd)::int = 14 then 'sick'
            when i % 3 = 1 and m = 1 and extract(day from g.dd)::int between 20 and 22 then 'leave'
            else 'work' end as kind
        from generate_series(v_month, least((v_month + interval '1 month' - interval '1 day')::date, current_date), interval '1 day') g(dd)
      ) x;
      -- Sent by the coordinator; two months ago approved by both, last month at the HOD, this month at the fleet manager.
      begin
        perform pg_temp.seed_act(v_coord);
        update public.timesheets set status = 'submitted' where id = v_id;
        perform pg_temp.seed_approve('timesheets', v_id, m, v_company, v_coord);
      exception when others then
        raise notice 'Timesheet of % (%) left as a draft: %', d.full_name, v_month, sqlerrm;
      end;
    end loop;
  end loop;
  perform pg_temp.seed_act(null);

  -- -------------------------------------------------------------------------
  -- Leave plan for this year, for employees without a plan or balance yet.
  -- -------------------------------------------------------------------------
  select id into v_cat from public.leave_categories
  where company_id = v_company and deleted_at is null and counts_against_balance
  order by (name ilike '%annual%') desc, name limit 1;
  if v_cat is null then
    insert into public.leave_categories (company_id, name, counts_against_balance) values (v_company, 'Annual leave', true) returning id into v_cat;
  end if;

  for i in 1..v_n loop
    select * into d from public.drivers where id = v_drivers[i];
    continue when d.profile_id is null;
    continue when exists (select 1 from public.leave_plans where employee_id = d.profile_id and plan_year = v_year)
      or exists (select 1 from public.leave_balances where employee_id = d.profile_id and balance_year = v_year);
    v_months := array[(array[3, 4, 6, 7, 2, 5])[i], (array[8, 9, 12, 11, 10, 12])[i]];
    insert into public.leave_plans (company_id, driver_id, employee_id, employee_name, employment_number, employer, position, department,
      plan_year, planned_months, entitled_days, carried_forward_days, created_by)
    values (v_company, d.id, d.profile_id, d.full_name, d.employment_number, d.employer, d.job_title, d.department,
      v_year, array[v_months[1]::text, v_months[2]::text], 28, (array[0, 3, 5, 2, 7, 1])[i], v_coord)
    returning id into v_id;
    insert into public.leave_plan_rows (company_id, leave_plan_id, date_from, date_to, category_id, notes) values
      (v_company, v_id, make_date(v_year, v_months[1], 4), make_date(v_year, v_months[1], 17), v_cat, 'Main annual leave'),
      (v_company, v_id, make_date(v_year, v_months[2], 10), make_date(v_year, v_months[2], 16), v_cat, 'Second part');
  end loop;

  -- -------------------------------------------------------------------------
  -- Leave requests (coordinator -> fleet manager -> HR -> HOD), one at each step.
  -- -------------------------------------------------------------------------
  select array_agg(id order by full_name) into v_ids from (
    select dr.id, dr.full_name from public.drivers dr
    join public.leave_balances b on b.employee_id = dr.profile_id and b.balance_year = v_year and b.deleted_at is null
    where dr.company_id = v_company and dr.deleted_at is null and dr.id = any(v_drivers)
    order by dr.full_name limit 5) x;
  if v_coord is null or v_ids is null then
    raise notice 'Leave requests skipped: no one may create them, or no driver with a user account and leave balance.';
  else
    -- With fewer than five employees, some get more than one request (different dates).
    for k in 1..5 loop
      select * into d from public.drivers where id = v_ids[1 + (k - 1) % array_length(v_ids, 1)];
      v_from := case k when 4 then current_date - 40 else current_date + 7 + k * 9 end;
      perform pg_temp.seed_act(v_coord);
      begin
        insert into public.leave_requests (company_id, driver_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
        values (v_company, d.id, d.profile_id, v_cat, v_from, v_from + (array[4, 6, 2, 5, 3])[k],
          (array['Family visit', 'Annual rest', 'Wedding in the family', 'Rest after long-trip rotation', 'Personal matters'])[k], 'submitted', v_coord)
        returning id into v_id;
        -- 1: waits for the fleet manager; 2: at HR; 3: at HOD; 4: approved; 5: rejected by HR.
        perform pg_temp.seed_approve('leave_requests', v_id, (array[0, 1, 2, 3, 1])[k], v_company, v_coord);
        if k = 5 then
          perform pg_temp.seed_reject('leave_requests', v_id, v_company, v_coord, 'Dates clash with the site shutdown; please pick other dates.');
        end if;
      exception when others then
        raise notice 'Leave request for % skipped: %', d.full_name, sqlerrm;
      end;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- Outstation allowance (fleet manager -> HOD -> finance emailed).
  -- -------------------------------------------------------------------------
  v_req := pg_temp.seed_requester(v_company, 'expenses.admin.outstation');
  if v_req is null then
    raise notice 'Outstation allowance skipped: no one may create it.';
  else
    for k in 1..5 loop
      begin
        perform pg_temp.seed_act(v_req);
        v_from := current_date - (array[3, 10, 24, 45, 6])[k];
        insert into public.outstation_requests (company_id, date_from, date_to, return_date, description, driver_id, vehicle_id, location, total_days, dsa_tzs, status, created_by)
        values (v_company, v_from, v_from + (array[3, 4, 2, 5, 1])[k], v_from + (array[3, 4, 2, 5, 1])[k],
          (array['Staff transport to the site', 'Supplies delivery', 'Client visit escort', 'Long trip, project materials', 'Airport transfer and stay'])[k],
          v_drivers[1 + ((k - 1) % least(v_n, 3))],
          case when v_vehicles is not null then v_vehicles[1 + ((k - 1) % array_length(v_vehicles, 1))] end,
          (array['Mwanza', 'Shinyanga', 'Arusha', 'Geita', 'Dodoma'])[k],
          (array[4, 5, 3, 6, 2])[k], (array[80000, 80000, 100000, 80000, 100000])[k], 'draft', v_req)
        returning id into v_id;
        insert into public.outstation_expense_items (company_id, outstation_request_id, seq, description, quantity, unit, unit_price_tzs) values
          (v_company, v_id, 1, 'Accommodation', (array[3, 4, 2, 5, 1])[k], 'night', 60000),
          (v_company, v_id, 2, 'Parking and road fees', 1, 'lot', (array[15000, 20000, 10000, 35000, 8000])[k]);
        if k = 4 then
          insert into public.outstation_expense_items (company_id, outstation_request_id, seq, description, quantity, unit, unit_price_tzs)
          values (v_company, v_id, 3, 'Tyre puncture repair on the way', 1, 'job', 25000);
        end if;
        update public.outstation_requests set status = 'submitted' where id = v_id;
        -- 1: waits for the fleet manager; 2: at HOD; 3 and 4: approved; 5: rejected.
        perform pg_temp.seed_approve('outstation_requests', v_id, (array[0, 1, 2, 2, 0])[k], v_company, v_req);
        if k = 5 then
          perform pg_temp.seed_reject('outstation_requests', v_id, v_company, v_req, 'Trip was covered by the client; no allowance due.');
        end if;
      exception when others then
        raise notice 'Outstation allowance % skipped: %', k, sqlerrm;
      end;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- Petty cash: requests (fleet manager approves the amount -> HOD -> finance emailed), money
  -- given with proof of payment, then each spending transaction (fleet manager -> HOD verifies).
  -- -------------------------------------------------------------------------
  v_req := pg_temp.seed_requester(v_company, 'expenses.admin.petty_cash');
  if v_req is null then
    raise notice 'Petty cash skipped: no one may create it.';
  else
    for k in 1..5 loop
      begin
        perform pg_temp.seed_act(v_req);
        insert into public.petty_cash_requests (company_id, request_date, requester_id, purpose, amount_requested_tzs, status, created_by)
        values (v_company, current_date - (array[1, 4, 20, 9, 12])[k], v_req,
          (array['Office supplies and water', 'Vehicle wash and small spares', 'Site trip expenses', 'Fuel for the generator', 'Courier and printing'])[k],
          (array[150000, 400000, 500000, 250000, 120000])[k], 'submitted', v_req)
        returning id into v_id;
        -- 1: waits for the fleet manager; 2: at HOD (amount cut); 3: money given and spent; 4: approved, waiting for proof of payment; 5: rejected.
        perform pg_temp.seed_approve('petty_cash_requests', v_id, (array[0, 1, 2, 2, 0])[k], v_company, v_req,
          case k when 2 then '{"amount_approved": "350000"}'::jsonb else '{}'::jsonb end);
        if k = 5 then
          perform pg_temp.seed_reject('petty_cash_requests', v_id, v_company, v_req, 'Please use the courier account instead.');
        end if;
        if k = 3 and exists (select 1 from public.petty_cash_requests where id = v_id and status = 'approved') then
          update public.petty_cash_requests set amount_received_tzs = coalesce(amount_approved_tzs, amount_requested_tzs) where id = v_id;
          perform pg_temp.seed_attach(v_company, 'petty_cash_requests', v_id, 'expenses.admin.petty_cash', 'Proof of payment', 'proof_of_payment.pdf');
          -- Spending: 1 and 2 approved, 3 at HOD, 4 waits for the fleet manager, 5 a draft not sent yet.
          for m in 1..5 loop
            perform pg_temp.seed_act(v_req);
            insert into public.petty_cash_transactions (company_id, petty_cash_request_id, seq, txn_date, description, quantity, unit, price_tzs, created_by)
            values (v_company, v_id, m, current_date - (array[18, 16, 12, 8, 2])[m],
              (array['Drinking water for the trip', 'Lunch for the crew', 'Engine oil top-up', 'Parking at the site', 'Phone airtime'])[m],
              (array[4, 6, 2, 3, 1])[m], (array['carton', 'plate', 'litre', 'day', 'voucher'])[m],
              (array[12000, 8000, 25000, 5000, 20000])[m], v_req)
            returning id into v_txn;
            perform pg_temp.seed_attach(v_company, 'petty_cash_transactions', v_txn, 'expenses.admin.petty_cash', 'Receipt', 'receipt_' || m || '.pdf');
            if m < 5 then
              update public.petty_cash_transactions set status = 'submitted' where id = v_txn;
              perform pg_temp.seed_approve('petty_cash_transactions', v_txn, (array[2, 2, 1, 0])[m], v_company, v_req);
            end if;
          end loop;
        end if;
      exception when others then
        raise notice 'Petty cash request % skipped: %', k, sqlerrm;
      end;
    end loop;
  end if;

  -- -------------------------------------------------------------------------
  -- Maintenance: job cards (PPM each month, corrective in some), work orders, spare parts,
  -- invoices and purchase orders, for the last three months.
  -- -------------------------------------------------------------------------
  v_mreq := pg_temp.seed_requester(v_company, 'expenses.maintenance.costs');
  if v_vehicles is not null then
    for i in 1..array_length(v_vehicles, 1) loop
      for m in 0..2 loop
        v_month := (date_trunc('month', current_date) - make_interval(months => m))::date;
        v_from := least(v_month + 2 + i, current_date);
        insert into public.maintenance_costs (company_id, vehicle_id, cost_date, odometer_km, work_type, service_provider, activities, cost_tzs, date_in, date_out, km_in, km_out)
        select v_company, v.id, v_from, greatest(coalesce(v.odometer_km, 60000) - 5000 * m - 400, 0), 'maintenance',
          'Toyota Tanzania Service Centre', (array['PM service: engine oil, oil filter, air filter', 'PM service: oil, filters, brake check', 'PM service: oil, fuel filter, greasing'])[m + 1],
          180000 + ((i + m) % 4) * 65000,
          greatest(v_from - 1, v_month), v_from, greatest(coalesce(v.odometer_km, 60000) - 5000 * m - 400, 0), greatest(coalesce(v.odometer_km, 60000) - 5000 * m - 392, 0)
        from public.vehicles v where v.id = v_vehicles[i];
        -- The work order before it, spare parts, the provider's invoice and a purchase order.
        insert into public.maintenance_work_orders (company_id, vehicle_id, order_date, description, service_provider, provider_email)
        values (v_company, v_vehicles[i], greatest(v_from - 2, v_month), (array['Scheduled service and general check', 'Service; brakes squeal at low speed', 'Service; check the air conditioning'])[m + 1],
          'Toyota Tanzania Service Centre', null);
        insert into public.maintenance_spare_parts (company_id, vehicle_id, part_date, description, quantity, unit_price_tzs) values
          (v_company, v_vehicles[i], v_from, 'Engine oil 5W-30', 7, 18000),
          (v_company, v_vehicles[i], v_from, (array['Oil filter', 'Air filter', 'Fuel filter'])[m + 1], 1, (array[25000, 35000, 42000])[m + 1]);
        insert into public.maintenance_purchase_orders (company_id, vehicle_id, po_date, service_provider, amount_tzs, payment_status)
        values (v_company, v_vehicles[i], greatest(v_from - 1, v_month), 'Toyota Tanzania Service Centre', 180000 + ((i + m) % 4) * 65000 + 151000, (array['unpaid', 'partly_paid', 'paid'])[m + 1]);
        if v_mreq is not null then
          begin
            perform pg_temp.seed_act(v_mreq);
            insert into public.maintenance_invoices (company_id, vehicle_id, invoice_number, invoice_date, service_provider, labour_tzs, parts_tzs, status, created_by)
            values (v_company, v_vehicles[i], 'TTSC-' || to_char(v_from, 'YYMM') || '-' || lpad(i::text, 2, '0'), v_from, 'Toyota Tanzania Service Centre',
              180000 + ((i + m) % 4) * 65000, 7 * 18000 + (array[25000, 35000, 42000])[m + 1], (case when i = 1 and m = 0 then 'draft' else 'submitted' end)::public.request_status, v_mreq)
            returning id into v_id;
            perform pg_temp.seed_attach(v_company, 'maintenance_invoices', v_id, 'expenses.maintenance.costs', 'Invoice', 'invoice.pdf');
            -- Two months ago approved, last month at the HOD, this month at the fleet manager (one still a draft).
            perform pg_temp.seed_approve('maintenance_invoices', v_id, m, v_company, v_mreq);
          exception when others then
            raise notice 'Maintenance invoice skipped: %', sqlerrm;
          end;
          perform pg_temp.seed_act(null);
        end if;
        if (i + m) % 2 = 1 then
          insert into public.maintenance_costs (company_id, vehicle_id, cost_date, odometer_km, work_type, service_provider, activities, cost_tzs)
          select v_company, v.id, least(v_month + 12 + i, current_date), greatest(coalesce(v.odometer_km, 60000) - 5000 * m + 1500, 0), 'repairs',
            (array['Mwanza Auto Garage', 'CFAO Motors workshop', 'Kahama Diesel Works'])[1 + (i % 3)],
            (array['Replace front brake pads and discs', 'Repair alternator and replace belt', 'Replace shock absorbers (rear)', 'Fix radiator leak, replace hose', 'Replace clutch kit', 'Rewire tail lights'])[1 + ((i + m) % 6)],
            (array[320000, 450000, 610000, 210000, 980000, 150000])[1 + ((i + m) % 6)]
          from public.vehicles v where v.id = v_vehicles[i];
        end if;
      end loop;
    end loop;
  end if;

  perform pg_temp.seed_act(null);

  -- -------------------------------------------------------------------------
  -- List every row made by this run (all share this transaction's time), and silence its messages.
  -- -------------------------------------------------------------------------
  insert into fms_seed.rows (table_name, row_id)
  select x.t, x.id from (
    select 'timesheets' t, id from public.timesheets where company_id = v_company and created_at = now()
    union all select 'timesheet_days', id from public.timesheet_days where company_id = v_company and created_at = now()
    union all select 'leave_categories', id from public.leave_categories where company_id = v_company and created_at = now()
    union all select 'leave_plans', id from public.leave_plans where company_id = v_company and created_at = now()
    union all select 'leave_plan_rows', id from public.leave_plan_rows where company_id = v_company and created_at = now()
    union all select 'leave_balances', id from public.leave_balances where company_id = v_company and created_at = now()
    union all select 'leave_requests', id from public.leave_requests where company_id = v_company and created_at = now()
    union all select 'outstation_requests', id from public.outstation_requests where company_id = v_company and created_at = now()
    union all select 'outstation_expense_items', id from public.outstation_expense_items where company_id = v_company and created_at = now()
    union all select 'petty_cash_requests', id from public.petty_cash_requests where company_id = v_company and created_at = now()
    union all select 'petty_cash_transactions', id from public.petty_cash_transactions where company_id = v_company and created_at = now()
    union all select 'attachments', id from public.attachments where company_id = v_company and created_at = now()
    union all select 'maintenance_costs', id from public.maintenance_costs where company_id = v_company and created_at = now()
    union all select 'maintenance_work_orders', id from public.maintenance_work_orders where company_id = v_company and created_at = now()
    union all select 'maintenance_spare_parts', id from public.maintenance_spare_parts where company_id = v_company and created_at = now()
    union all select 'maintenance_invoices', id from public.maintenance_invoices where company_id = v_company and created_at = now()
    union all select 'maintenance_purchase_orders', id from public.maintenance_purchase_orders where company_id = v_company and created_at = now()
    union all select 'approval_signoffs', id from public.approval_signoffs where company_id = v_company and created_at = now()
    union all select 'approval_events', id from public.approval_events where company_id = v_company and created_at = now()
    union all select 'approval_links', id from public.approval_links where company_id = v_company and created_at = now()
    union all select 'notifications', id from public.notifications where company_id = v_company and created_at = now()
  ) x
  on conflict do nothing;

  with sample_msg as (
    select mo.id from public.message_outbox mo
    where mo.created_at >= now() and mo.status = 'pending' and (mo.company_id = v_company or mo.company_id is null)
      and exists (select 1 from fms_seed.rows s where s.table_name in ('leave_requests', 'outstation_requests', 'petty_cash_requests', 'petty_cash_transactions', 'timesheets', 'maintenance_invoices')
        and (mo.data ->> 'record_id' = s.row_id::text or mo.data::text like '%' || s.row_id::text || '%'))
  ), marked as (
    update public.message_outbox mo set status = 'skipped', last_error = 'Sample data'
    from sample_msg s where mo.id = s.id returning mo.id
  )
  insert into fms_seed.rows (table_name, row_id) select 'message_outbox', id from marked on conflict do nothing;
end
$seed$;

select table_name as "sample table", count(*) as "rows" from fms_seed.rows group by table_name order by table_name;

commit;
