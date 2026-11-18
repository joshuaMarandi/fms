-- 34: (1) A vehicle's status follows its problems: an open anomaly marked "Immediately" on an
-- inspection, or a maintenance or repair request that says the vehicle cannot be used, takes it out
-- of service; when the last such problem is closed it comes back into service (only if the system
-- took it out). (2) Mandatory training can have no expiry (N/A). (3) Menu order and the maintenance
-- pages move as agreed. (4) The database works in East Africa Time.

-- ---------------------------------------------------------------------------
-- (4) East Africa Time for dates such as current_date
-- ---------------------------------------------------------------------------
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Africa/Dar_es_Salaam');
end $$;
set timezone to 'Africa/Dar_es_Salaam';

-- ---------------------------------------------------------------------------
-- (1) Vehicle status from its problems
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists status_source text;
alter table public.maintenance_requests add column if not exists takes_out_of_service boolean not null default false;

-- A person changing the status by hand takes over from the system.
create or replace function public.vehicles_status_reason()
returns trigger language plpgsql as $$
begin
  if new.status = 'in_service' then
    new.status_reason := null;
    new.status_work_order_id := null;
    new.status_source := null;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and coalesce(current_setting('fms.vehicle_auto', true), 'off') <> 'on' then
    new.status_source := null;
  end if;
  return new;
end;
$$;

create or replace function public.vehicle_problem_sync(p_vehicle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_anomaly text;
  v_repair text;
  v_reason text;
begin
  select * into v from public.vehicles where id = p_vehicle;
  if v.id is null then return; end if;

  select a.description into v_anomaly from public.inspection_anomalies a
  where a.vehicle_id = p_vehicle and a.deleted_at is null and a.status = 'open' and a.when_to_act = 'immediately'
  order by a.date_opened desc, a.created_at desc limit 1;

  select coalesce(nullif(m.fault_details, ''), array_to_string(m.faults, ', '), m.reason) into v_repair from public.maintenance_requests m
  where m.vehicle_id = p_vehicle and m.deleted_at is null and m.takes_out_of_service and m.status in ('submitted', 'approved')
  order by m.request_date desc, m.created_at desc limit 1;

  v_reason := case
    when v_anomaly is not null then 'Inspection found a problem: ' || v_anomaly
    when v_repair is not null then 'Under maintenance or repair: ' || v_repair
  end;

  perform set_config('fms.vehicle_auto', 'on', true);
  if v_reason is not null then
    if v.status = 'in_service' then
      update public.vehicles set status = 'out_of_service', status_reason = v_reason, status_source = 'auto' where id = p_vehicle;
    elsif v.status_source = 'auto' and v.status_reason is distinct from v_reason then
      update public.vehicles set status_reason = v_reason where id = p_vehicle;
    end if;
  elsif v.status = 'out_of_service' and v.status_source = 'auto' then
    update public.vehicles set status = 'in_service' where id = p_vehicle;
  end if;
  perform set_config('fms.vehicle_auto', 'off', true);
end;
$$;

create or replace function public.inspection_anomalies_vehicle_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.vehicle_problem_sync(coalesce(new.vehicle_id, old.vehicle_id));
  return null;
end;
$$;
drop trigger if exists inspection_anomalies_vehicle_status on public.inspection_anomalies;
create trigger inspection_anomalies_vehicle_status after insert or update or delete on public.inspection_anomalies
  for each row execute function public.inspection_anomalies_vehicle_status();

create or replace function public.maintenance_requests_vehicle_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.vehicle_problem_sync(coalesce(new.vehicle_id, old.vehicle_id));
  return null;
end;
$$;
drop trigger if exists maintenance_requests_vehicle_status on public.maintenance_requests;
create trigger maintenance_requests_vehicle_status after insert or update of status, takes_out_of_service, deleted_at on public.maintenance_requests
  for each row execute function public.maintenance_requests_vehicle_status();

-- Bring existing vehicles in line with their open problems.
do $$
declare r record;
begin
  for r in select id from public.vehicles where deleted_at is null loop
    perform public.vehicle_problem_sync(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (2) Mandatory training without an expiry
-- ---------------------------------------------------------------------------
alter table public.mandatory_trainings add column if not exists no_expiry boolean not null default false;

-- ---------------------------------------------------------------------------
-- (3) Menu: Dashboard, Fleet database, Driver details, Vehicle operations, Fleet safety,
-- Fleet administration, Fleet expenses, Fleet data reports, Travel coordination.
-- ---------------------------------------------------------------------------
update public.resources set sort_order = 0 where key = 'dashboard';
update public.resources set sort_order = 100 where key = 'fleet';
update public.resources set sort_order = 200 where key = 'drivers';
update public.resources set sort_order = 300, label_prefix = '3' where key = 'daily_use';
update public.resources set sort_order = 400, label_prefix = '4' where key = 'fleet_safety';
update public.resources set sort_order = 500, label_prefix = '5' where key = 'expenses.admin';
update public.resources set sort_order = 600, label_prefix = '6' where key = 'expenses';
update public.resources set sort_order = 700, label_prefix = '7' where key = 'expenses.reports';
update public.resources set sort_order = 800, label_prefix = '8' where key = 'expenses.travel';

-- Vehicle operations: ... Fuel log, then Maintenance and repair requests and records.
update public.resources set parent_key = 'daily_use', name = 'Maintenance and repair requests', sort_order = 405 where key = 'expenses.maintenance.requests';
update public.resources set parent_key = 'daily_use', name = 'Maintenance and repair records', sort_order = 406 where key = 'expenses.maintenance.costs';
update public.resources set path = null where key = 'expenses.maintenance';

-- Fleet expenses: Fuel cost, Maintenance cost, Repair cost, Tyres, Car washing, Miscellaneous expenses.
-- (Keys under the records' key, so whoever may see the records sees the costs.)
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.maintenance.costs.maintenance', 'expenses', 'Maintenance cost', null, '/expenses/maintenance-cost', 'wrench', 602, false, false),
  ('expenses.maintenance.costs.repairs', 'expenses', 'Repair cost', null, '/expenses/repair-cost', 'wrench', 603, false, false)
on conflict (key) do update set parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, sort_order = excluded.sort_order;
update public.resources set sort_order = 601 where key = 'expenses.fuel';
update public.resources set sort_order = 604 where key = 'expenses.tyres';
update public.resources set sort_order = 605 where key = 'expenses.washing';
update public.resources set sort_order = 606 where key = 'expenses.misc';

-- ---------------------------------------------------------------------------
-- Totals per vehicle over any dates, for the vehicle lists (km log, fuel requests, fuel log).
-- Runs with the caller's permissions, so each person only counts what they may see.
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_totals(p_kind text, p_from date default null, p_to date default null)
returns table (vehicle_id uuid, records bigint, trips numeric, km numeric, litres numeric, cost numeric, pending bigint, first_date date, last_date date)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_kind = 'km_log' then
    return query
      select l.vehicle_id, count(*), coalesce(sum(l.trip_count), 0)::numeric, coalesce(sum(l.total_km), 0)::numeric, 0::numeric, 0::numeric, 0::bigint, min(l.log_date), max(l.log_date)
      from public.km_logs l
      where l.deleted_at is null and (p_from is null or l.log_date >= p_from) and (p_to is null or l.log_date <= p_to)
      group by l.vehicle_id;
  elsif p_kind = 'fuel_requests' then
    return query
      select r.vehicle_id, count(*), 0::numeric, coalesce(sum(r.current_odometer - r.previous_odometer) filter (where r.current_odometer >= r.previous_odometer), 0)::numeric,
             coalesce(sum(coalesce(r.approved_l, r.fuel_required_l)), 0)::numeric, 0::numeric, count(*) filter (where r.status = 'submitted'), min(r.request_date), max(r.request_date)
      from public.fuel_requests r
      where r.deleted_at is null and (p_from is null or r.request_date >= p_from) and (p_to is null or r.request_date <= p_to)
      group by r.vehicle_id;
  elsif p_kind = 'fuel_issues' then
    return query
      select i.vehicle_id, count(*), 0::numeric, coalesce(sum(i.km_run), 0)::numeric, coalesce(sum(i.fuel_issued_l), 0)::numeric, coalesce(sum(i.total_cost_tzs), 0)::numeric, 0::bigint, min(i.issue_date), max(i.issue_date)
      from public.fuel_issues i
      where i.deleted_at is null and (p_from is null or i.issue_date >= p_from) and (p_to is null or i.issue_date <= p_to)
      group by i.vehicle_id;
  end if;
end;
$$;
grant execute on function public.vehicle_totals(text, date, date) to authenticated;
