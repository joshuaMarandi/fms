-- 23: Remove first aid inspection, equipment and accessories and works orders completely; split
-- "Fleet expenses and administration" into Fleet expenses, Fleet administration, Toolbox talks,
-- Toolbox matrix and Safety (each on the first level of the menu); add Fleet roster, Outstation
-- allowance, Petty cash reconciliation and toolbox talk attendance.
--
-- Resource keys stay the same (permissions and row security use them); only names, parents, paths
-- and order change. New keys start with "expenses." so existing grants and packages cover them.

-- ---------------------------------------------------------------------------
-- First aid kit inspection: gone, with its data.
-- ---------------------------------------------------------------------------
drop view public.v_vehicle_activity;
create view public.v_vehicle_activity with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  di.inspection_date as last_inspection_date,
  di.remark as last_inspection_remark,
  (select count(*) from public.daily_inspections d
    where d.vehicle_id = v.id and d.deleted_at is null and d.inspection_date >= date_trunc('month', current_date)::date) as inspections_this_month,
  (select count(*) from public.inspection_anomalies a where a.vehicle_id = v.id and a.deleted_at is null and a.status = 'open') as open_actions,
  (select max(t.renewal_date) from public.third_party_inspections t where t.vehicle_id = v.id and t.deleted_at is null) as third_party_next,
  (select max(l.log_date) from public.km_logs l where l.vehicle_id = v.id and l.deleted_at is null) as last_km_log_date,
  (select count(*) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as km_logs_this_month,
  (select coalesce(sum(l.total_km), 0) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as km_this_month,
  (select coalesce(sum(l.trip_count), 0) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as trips_this_month,
  (select t.km_end from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
    where l.vehicle_id = v.id and l.deleted_at is null and t.deleted_at is null and t.km_end is not null
    order by l.log_date desc, t.km_end desc limit 1) as last_km_end,
  fr.request_date as last_fuel_date,
  fr.current_odometer as last_fuel_odometer,
  (select count(*) from public.fuel_requests r
    where r.vehicle_id = v.id and r.deleted_at is null and r.request_date >= date_trunc('month', current_date)::date) as fuel_requests_this_month,
  (select count(*) from public.fuel_requests r where r.vehicle_id = v.id and r.deleted_at is null and r.status = 'submitted') as fuel_pending,
  (select coalesce(sum(i.fuel_issued_l), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date) as fuel_l_this_month,
  (select coalesce(sum(i.total_cost_tzs), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date) as fuel_cost_this_month,
  (select coalesce(sum(i.km_run), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date and i.fuel_issued_l > 0) as fuel_km_this_month,
  li.issue_date as last_issue_date,
  li.fuel_issued_l as last_issue_l,
  li.balance_l as last_issue_balance_l,
  li.km_run as last_issue_km_run,
  coalesce(li.fuel_issued_l, (select r.approved_l from public.fuel_requests r
    where r.vehicle_id = v.id and r.deleted_at is null and r.approved_l is not null
    order by r.request_date desc, r.created_at desc limit 1)) as last_fuel_filled,
  (select t.destination from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
    where l.vehicle_id = v.id and l.deleted_at is null and t.deleted_at is null and t.km_end is not null
    order by l.log_date desc, t.km_end desc limit 1) as last_km_destination
from public.vehicles v
left join lateral (
  select d.inspection_date, d.remark from public.daily_inspections d
  where d.vehicle_id = v.id and d.deleted_at is null
  order by d.inspection_date desc, d.created_at desc limit 1
) di on true
left join lateral (
  select r.request_date, r.current_odometer from public.fuel_requests r
  where r.vehicle_id = v.id and r.deleted_at is null and r.current_odometer is not null
  order by r.request_date desc, r.created_at desc limit 1
) fr on true
left join lateral (
  select i.issue_date, i.fuel_issued_l, i.balance_l, i.km_run from public.fuel_issues i
  where i.vehicle_id = v.id and i.deleted_at is null
  order by i.issue_date desc, i.created_at desc limit 1
) li on true
where v.deleted_at is null;

grant select on public.v_vehicle_activity to authenticated;

delete from public.table_resources where table_name in ('first_aid_items', 'first_aid_inspections');
delete from public.resources where key = 'inspections.first_aid';
drop table if exists public.first_aid_items cascade;
drop table if exists public.first_aid_inspections cascade;

-- ---------------------------------------------------------------------------
-- Equipment and accessories: gone, with its data.
-- ---------------------------------------------------------------------------
delete from public.table_resources where table_name = 'vehicle_equipment';
delete from public.resources where key = 'expenses.equipment';
drop table if exists public.vehicle_equipment cascade;

-- ---------------------------------------------------------------------------
-- Works orders: gone, with their data. Vehicles are taken out of service from Fleet database.
-- ---------------------------------------------------------------------------
delete from public.table_resources where table_name = 'work_orders';
delete from public.resources where key = 'expenses.maintenance.work_orders';
alter table public.maintenance_costs drop column if exists work_order_id;
update public.vehicles set status_work_order_id = null where status_work_order_id is not null;
drop table if exists public.work_orders cascade;
drop function if exists public.work_orders_vehicle_status();

-- Reports without works orders.
create or replace function public.generate_report(p_type text, p_filters jsonb default '{}'::jsonb)
returns setof jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  d_from date := coalesce((p_filters ->> 'from')::date, (current_date - interval '12 months')::date);
  d_to date := coalesce((p_filters ->> 'to')::date, current_date);
  v_vehicle uuid := nullif(p_filters ->> 'vehicle_id', '')::uuid;
  v_driver uuid := nullif(p_filters ->> 'driver_id', '')::uuid;
  v_resource text;
begin
  v_resource := case p_type
    when 'fuel' then 'expenses.fuel'
    when 'fleet_cost' then 'expenses'
    when 'maintenance' then 'expenses.maintenance'
    when 'compliance' then 'fleet'
    when 'training' then 'expenses.trainings'
    when 'leave' then 'expenses.leave'
    when 'timesheet' then 'expenses.timesheet'
    when 'incidents' then 'expenses.safety'
    else null end;
  if v_resource is null then
    raise exception 'Unknown report type %', p_type using errcode = '22023';
  end if;
  if not public.has_permission(v_resource, 'view') then
    raise exception 'No access to this report' using errcode = '42501', hint = 'permission_denied';
  end if;

  if p_type = 'fuel' then
    return query
      select jsonb_build_object('date', f.expense_date, 'vehicle', v.registration, 'km_run', f.km_run, 'litres', f.fuel_consumed_l,
        'target_km_per_l', f.target_km_per_l, 'attained_km_per_l', f.attained_km_per_l, 'price_per_litre', f.price_per_litre, 'amount_tzs', f.amount_tzs)
      from public.fuel_expenses f join public.vehicles v on v.id = f.vehicle_id
      where f.deleted_at is null and f.expense_date between d_from and d_to and (v_vehicle is null or f.vehicle_id = v_vehicle)
      order by f.expense_date desc;
  elsif p_type = 'fleet_cost' then
    return query
      select jsonb_build_object('month', m.month, 'vehicle', m.registration, 'category', m.category, 'amount_tzs', m.amount)
      from (
        select date_trunc('month', expense_date)::date as month, v.registration, 'fuel' as category, sum(amount_tzs) as amount
          from public.fuel_expenses f join public.vehicles v on v.id = f.vehicle_id
          where f.deleted_at is null and expense_date between d_from and d_to and (v_vehicle is null or f.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', cost_date)::date, v.registration, 'maintenance', sum(cost_tzs)
          from public.maintenance_costs c join public.vehicles v on v.id = c.vehicle_id
          where c.deleted_at is null and cost_date between d_from and d_to and (v_vehicle is null or c.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', request_date)::date, v.registration, 'tyres', sum(total_cost_tzs)
          from public.tyre_requests t join public.vehicles v on v.id = t.vehicle_id
          where t.deleted_at is null and t.status in ('approved', 'completed') and request_date between d_from and d_to and (v_vehicle is null or t.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', request_date)::date, v.registration, 'washing', sum(cost_tzs)
          from public.wash_requests w join public.vehicles v on v.id = w.vehicle_id
          where w.deleted_at is null and w.status in ('approved', 'completed') and request_date between d_from and d_to and (v_vehicle is null or w.vehicle_id = v_vehicle)
          group by 1, 2
      ) m order by m.month desc, m.registration, m.category;
  elsif p_type = 'maintenance' then
    return query
      select jsonb_build_object('date', c.cost_date, 'vehicle', v.registration, 'work_type', c.work_type, 'provider', c.service_provider,
        'activities', c.activities, 'cost_tzs', c.cost_tzs)
      from public.maintenance_costs c join public.vehicles v on v.id = c.vehicle_id
      where c.deleted_at is null and c.cost_date between d_from and d_to and (v_vehicle is null or c.vehicle_id = v_vehicle)
      order by c.cost_date desc;
  elsif p_type = 'compliance' then
    return query
      select jsonb_build_object('type', r.reminder_type, 'title', r.title, 'due_date', r.due_date, 'due_km', r.due_km,
        'vehicle', v.registration, 'driver', d.full_name,
        'state', case when r.due_date is null then 'valid' when r.due_date < current_date then 'overdue'
                      when r.due_date <= current_date + 30 then 'due_soon' else 'valid' end)
      from public.reminders r left join public.vehicles v on v.id = r.vehicle_id left join public.drivers d on d.id = r.driver_id
      where r.deleted_at is null and r.status <> 'done' and (v_vehicle is null or r.vehicle_id = v_vehicle) and (v_driver is null or r.driver_id = v_driver)
      order by r.due_date nulls last;
  elsif p_type = 'training' then
    return query
      select jsonb_build_object('driver', d.full_name, 'courses', t.courses, 'date_completed', t.date_completed, 'trainer', t.trainer,
        'cost_tzs', t.cost_tzs, 'refresher_date', t.refresher_date)
      from public.mandatory_trainings t join public.drivers d on d.id = t.driver_id
      where t.deleted_at is null and (v_driver is null or t.driver_id = v_driver)
        and (t.date_completed is null or t.date_completed between d_from and d_to)
      order by t.date_completed desc nulls last;
  elsif p_type = 'leave' then
    return query
      select jsonb_build_object('employee', coalesce(d.full_name, p.full_name), 'category', c.name, 'from', l.date_from, 'to', l.date_to,
        'days', l.total_days, 'status', l.status)
      from public.leave_requests l left join public.drivers d on d.id = l.driver_id left join public.profiles p on p.id = l.employee_id
      left join public.leave_categories c on c.id = l.category_id
      where l.deleted_at is null and l.date_from between d_from and d_to and (v_driver is null or l.driver_id = v_driver)
      order by l.date_from desc;
  elsif p_type = 'timesheet' then
    return query
      select jsonb_build_object('employee', t.employee_name, 'month', t.period_month, 'normal_hours', t.total_normal_hours,
        'overtime_hours', t.total_overtime_hours, 'status', t.status)
      from public.timesheets t
      where t.deleted_at is null and t.period_month between date_trunc('month', d_from)::date and d_to and (v_driver is null or t.driver_id = v_driver)
      order by t.period_month desc, t.employee_name;
  elsif p_type = 'incidents' then
    return query
      select jsonb_build_object('occurred_at', i.occurred_at, 'region', i.region, 'district', i.district, 'road', i.road_name,
        'driver', i.driver_name, 'injuries', i.injuries_count, 'fatalities', i.fatalities_count, 'status', i.status, 'description', i.description)
      from public.incidents i
      where i.deleted_at is null and i.occurred_at::date between d_from and d_to and (v_driver is null or i.driver_id = v_driver)
      order by i.occurred_at desc;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
update public.resources set name = 'Fleet expenses' where key = 'expenses';
update public.resources set name = 'Fuel' where key = 'expenses.fuel';
update public.resources set name = 'Maintenance and repair' where key = 'expenses.maintenance';
update public.resources set sort_order = 503 where key = 'expenses.maintenance.requests';
update public.resources set sort_order = 504 where key = 'expenses.maintenance.costs';

-- Fleet administration (first level).
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.admin', null, 'Fleet administration', '6', '/administration', 'building', 550, false, true),
  ('expenses.admin.roster', 'expenses.admin', 'Fleet roster', null, '/administration/roster', null, 551, false, false),
  ('expenses.admin.outstation', 'expenses.admin', 'Outstation allowance', null, '/administration/outstation', null, 556, false, false),
  ('expenses.admin.petty_cash', 'expenses.admin', 'Petty cash reconciliation', null, '/administration/petty-cash', null, 557, false, false)
on conflict (key) do update set parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, icon = excluded.icon, sort_order = excluded.sort_order;

update public.resources set parent_key = 'expenses.admin', sort_order = 552, label_prefix = null where key = 'expenses.timesheet';
update public.resources set parent_key = 'expenses.admin', sort_order = 553 where key = 'expenses.leave.plan';
update public.resources set parent_key = 'expenses.admin', sort_order = 554 where key = 'expenses.leave.requests';
update public.resources set parent_key = 'expenses.admin', sort_order = 555 where key = 'expenses.leave.balances';
-- The old groups keep their permissions (they cover the pages under them) but leave the menu.
update public.resources set parent_key = 'expenses.admin', path = null, sort_order = 559 where key = 'expenses.leave';
update public.resources set path = null where key in ('expenses.trainings', 'expenses.trainings.mandatory');

-- Toolbox talks, Toolbox matrix and Safety (first level).
update public.resources set parent_key = null, name = 'Toolbox talks', label_prefix = '7', icon = 'message-square', sort_order = 560 where key = 'expenses.trainings.toolbox';
update public.resources set parent_key = null, name = 'Toolbox matrix', label_prefix = '8', icon = 'layout-grid', sort_order = 570 where key = 'expenses.trainings.matrix';
update public.resources set parent_key = null, label_prefix = '9', sort_order = 580 where key = 'expenses.safety';

-- ---------------------------------------------------------------------------
-- New records
-- ---------------------------------------------------------------------------
create table public.fleet_rosters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  roster_date date not null,
  shift text not null default 'day' check (shift in ('day', 'night', 'standby', 'off')),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  site_id uuid references public.sites(id),
  time_from time,
  time_to time,
  notes text
);

create table public.outstation_allowances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  destination text not null,
  purpose text,
  date_from date not null,
  date_to date not null,
  nights integer generated always as (greatest(date_to - date_from, 0)) stored,
  rate_per_night_tzs numeric(14,2) not null default 0,
  amount_tzs numeric(14,2) generated always as (round(greatest(date_to - date_from, 0) * rate_per_night_tzs, 2)) stored,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_on date,
  check (date_to >= date_from)
);

create table public.petty_cash_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  entry_date date not null default current_date,
  kind text not null check (kind in ('received', 'spent')),
  category text,
  description text not null,
  vehicle_id uuid references public.vehicles(id),
  amount_tzs numeric(14,2) not null check (amount_tzs >= 0),
  receipt_number text
);

create table public.toolbox_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  toolbox_plan_id uuid not null references public.toolbox_plans(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  attended boolean not null default true,
  unique (toolbox_plan_id, driver_id)
);

do $$
declare
  t text;
begin
  foreach t in array array['fleet_rosters', 'outstation_allowances', 'petty_cash_entries', 'toolbox_attendance'] loop
    execute format('alter table public.%I
      add column created_at timestamptz not null default now(),
      add column created_by uuid,
      add column updated_at timestamptz not null default now(),
      add column updated_by uuid,
      add column deleted_at timestamptz', t);
    execute format('create index %I on public.%I (company_id) where deleted_at is null', t || '_company_idx', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
    execute format('grant all on public.%I to authenticated, service_role', t);
  end loop;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('fleet_rosters', 'expenses.admin.roster', null, null, false),
  ('outstation_allowances', 'expenses.admin.outstation', null, null, false),
  ('petty_cash_entries', 'expenses.admin.petty_cash', null, null, false),
  ('toolbox_attendance', 'expenses.trainings.matrix', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key;

select public.apply_standard_rls('fleet_rosters', 'expenses.admin.roster');
select public.apply_standard_rls('outstation_allowances', 'expenses.admin.outstation');
select public.apply_standard_rls('petty_cash_entries', 'expenses.admin.petty_cash');
select public.apply_standard_rls('toolbox_attendance', 'expenses.trainings.matrix');

create index fleet_rosters_date_idx on public.fleet_rosters (company_id, roster_date desc) where deleted_at is null;
create index petty_cash_entries_date_idx on public.petty_cash_entries (company_id, entry_date desc) where deleted_at is null;
