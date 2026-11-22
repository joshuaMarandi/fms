-- Timesheets are recorded, not approved. Shifts are day (06:00-14:00), noon (14:00-22:00) and
-- night (22:00-06:00), each with a one-hour rest. A day can be recorded as absent, and each day can
-- carry an allowance.

-- ---------------------------------------------------------------------------
-- No approval: every timesheet is a record.
-- ---------------------------------------------------------------------------
drop trigger if exists timesheets_status on public.timesheets;
update public.timesheets set status = 'completed' where status is distinct from 'completed';
alter table public.timesheets alter column status set default 'completed';
update public.table_resources set is_request = false where table_name = 'timesheets';
update public.resources set is_request = false where key = 'expenses.timesheet';
delete from public.notifications where link like '/expenses/timesheet/%' and read_at is null and title like '%awaiting approval%';

-- ---------------------------------------------------------------------------
-- Shifts, absence and allowance on the days.
-- ---------------------------------------------------------------------------
alter table public.timesheet_days drop constraint if exists timesheet_days_shift_check;
alter table public.timesheet_days add constraint timesheet_days_shift_check check (shift in ('day', 'noon', 'night'));
alter table public.timesheet_days drop constraint if exists timesheet_days_day_type_check;
alter table public.timesheet_days add constraint timesheet_days_day_type_check check (day_type in ('work', 'rest', 'leave', 'public_holiday', 'sick', 'absent'));
alter table public.timesheet_days add column if not exists allowance_tzs numeric(14,2) not null default 0;
create index if not exists timesheet_days_work_date_idx on public.timesheet_days (company_id, work_date) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Pending approvals no longer count timesheets.
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
      (select count(*) from public.leave_requests where deleted_at is null and status = 'submitted')),
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
