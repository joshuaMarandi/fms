-- Maintenance and repair requests are gone, with their data. Maintenance and repair work is recorded
-- in Maintenance and repair records (preventive maintenance and corrective repair), which open by
-- vehicle and month. Functions that read the requests are recreated without them.

-- ---------------------------------------------------------------------------
-- Driver confirmations: fuel requests only.
-- ---------------------------------------------------------------------------
delete from public.driver_confirmations where table_name = 'maintenance_requests';
alter table public.driver_confirmations drop constraint if exists driver_confirmations_table_name_check;
alter table public.driver_confirmations add constraint driver_confirmations_table_name_check check (table_name = 'fuel_requests');
drop policy if exists driver_confirmations_select on public.driver_confirmations;
create policy driver_confirmations_select on public.driver_confirmations for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission('daily_use.fuel_log', 'view'));

-- ---------------------------------------------------------------------------
-- Vehicle status: only an open inspection problem takes a vehicle out of service automatically.
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_problem_sync(p_vehicle uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vehicles;
  v_anomaly text;
  v_reason text;
begin
  select * into v from public.vehicles where id = p_vehicle;
  if v.id is null then return; end if;

  select a.description into v_anomaly from public.inspection_anomalies a
  where a.vehicle_id = p_vehicle and a.deleted_at is null and a.status = 'open' and a.when_to_act = 'immediately'
  order by a.date_opened desc, a.created_at desc limit 1;

  v_reason := case
    when v_anomaly is not null then 'Inspection found a problem: ' || v_anomaly
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

-- ---------------------------------------------------------------------------
-- Counts without maintenance requests.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_kpis(p_from date default (current_date - 30), p_to date default current_date, p_vehicle uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_prev_to date := p_from - 1;
begin
  v := v || jsonb_build_object(
    'vehicles_total', (select count(*) from public.vehicles where deleted_at is null and (p_vehicle is null or id = p_vehicle)),
    'vehicles_in_service', (select count(*) from public.vehicles where deleted_at is null and status = 'in_service' and (p_vehicle is null or id = p_vehicle)),
    'vehicles_in_garage', (select count(*) from public.vehicles where deleted_at is null and status = 'in_garage' and (p_vehicle is null or id = p_vehicle)),
    'pending_approvals', (
      (select count(*) from public.fuel_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.vehicle_requests where deleted_at is null and status = 'submitted') +
      (select count(*) from public.tyre_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.wash_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.leave_requests where deleted_at is null and status = 'submitted') +
      (select count(*) from public.timesheets where deleted_at is null and status = 'submitted')),
    'expiring_30', (select count(*) from public.reminders where deleted_at is null and status <> 'done' and due_date between current_date and current_date + 30 and (p_vehicle is null or vehicle_id = p_vehicle)),
    'overdue', (select count(*) from public.reminders where deleted_at is null and status <> 'done' and due_date < current_date and (p_vehicle is null or vehicle_id = p_vehicle)),
    'open_anomalies', (select count(*) from public.inspection_anomalies where deleted_at is null and status = 'open' and (p_vehicle is null or vehicle_id = p_vehicle)),
    'fuel_cost', (select coalesce(sum(amount_tzs), 0) from public.fuel_expenses where deleted_at is null and expense_date between p_from and p_to and (p_vehicle is null or vehicle_id = p_vehicle)),
    'fuel_cost_prev', (select coalesce(sum(amount_tzs), 0) from public.fuel_expenses where deleted_at is null and expense_date between v_prev_from and v_prev_to and (p_vehicle is null or vehicle_id = p_vehicle)),
    'incidents', (select count(*) from public.incidents where deleted_at is null and occurred_at::date between p_from and p_to),
    'incidents_prev', (select count(*) from public.incidents where deleted_at is null and occurred_at::date between v_prev_from and v_prev_to)
  );
  return v;
end;
$$;

create or replace function public.shell_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid := public.my_company_id();
  v_pending integer := 0;
  v_anomalies integer := 0;
  v_registrations integer := 0;
begin
  if v_uid is null then
    return null;
  end if;

  if v_company is not null then
    if public.has_permission('daily_use.fuel_log', 'approve') then
      v_pending := v_pending + (select count(*) from public.fuel_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('daily_use.trip_requests', 'approve') then
      v_pending := v_pending + (select count(*) from public.vehicle_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('expenses.tyres', 'approve') then
      v_pending := v_pending + (select count(*) from public.tyre_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('expenses.washing', 'approve') then
      v_pending := v_pending + (select count(*) from public.wash_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('expenses.leave.requests', 'approve') then
      v_pending := v_pending + (select count(*) from public.leave_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('expenses.timesheet', 'approve') then
      v_pending := v_pending + (select count(*) from public.timesheets where company_id = v_company and status = 'submitted' and deleted_at is null);
    end if;
    if public.has_permission('inspections', 'view') then
      v_anomalies := (select count(*) from public.inspection_anomalies where company_id = v_company and status = 'open' and deleted_at is null);
    end if;
  end if;

  if public.is_owner() then
    v_registrations := (select count(*) from public.company_registrations where status = 'pending');
  end if;

  return jsonb_build_object(
    'pending_approvals', v_pending,
    'open_anomalies', v_anomalies,
    'pending_registrations', v_registrations,
    'unread', (select count(*) from public.notifications where user_id = v_uid and read_at is null),
    'notifications', coalesce((
      select jsonb_agg(n order by n.created_at desc) from (
        select id, kind, title, body, link, read_at, created_at from public.notifications
        where user_id = v_uid order by created_at desc limit 10
      ) n), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The requests themselves.
-- ---------------------------------------------------------------------------
alter table public.maintenance_costs drop column if exists maintenance_request_id;
delete from public.attachments where table_name = 'maintenance_requests';
delete from public.table_resources where table_name = 'maintenance_requests';
delete from public.resources where key = 'expenses.maintenance.requests';
drop table if exists public.maintenance_requests cascade;
drop function if exists public.maintenance_requests_vehicle_status();

-- Vehicles taken out of service only by a maintenance request go back in service.
do $$
declare r record;
begin
  for r in select id from public.vehicles where deleted_at is null and status_source = 'auto' loop
    perform public.vehicle_problem_sync(r.id);
  end loop;
end $$;
