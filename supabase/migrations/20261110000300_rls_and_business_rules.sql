-- MDV Fleet Management System
-- Migration 3: row-level security on every data table and the business triggers
-- (status transitions, calculated totals, odometer, vehicle status, wash prices, anomalies).

-- ---------------------------------------------------------------------------
-- Table -> resource mapping (also used by the RPC layer)
-- ---------------------------------------------------------------------------
create table public.table_resources (
  table_name text primary key,
  resource_key text not null references public.resources(key),
  parent_table text,            -- for child tables: the table that carries ownership
  parent_fk text,               -- column on the child that points at the parent
  is_request boolean not null default false
);
alter table public.table_resources enable row level security;
create policy table_resources_select on public.table_resources for select to authenticated using (true);

-- Resources are seeded in seed.sql, but RLS policies reference keys only as text,
-- so we insert the keys needed by the FK here (names are refreshed by the seed).
insert into public.resources (key, parent_key, name, sort_order) values
  ('dashboard', null, 'Dashboard', 0),
  ('fleet', null, 'Fleet database', 100),
  ('fleet.details', 'fleet', 'Vehicle details', 101),
  ('fleet.inspection_status', 'fleet', 'Inspection status', 102),
  ('fleet.insurance', 'fleet', 'Insurance', 103),
  ('fleet.maintenance_schedule', 'fleet', 'Maintenance schedule', 104),
  ('fleet.documents', 'fleet', 'Documents', 105),
  ('fleet.remarks', 'fleet', 'Remarks', 106),
  ('drivers', null, 'Driver details', 200),
  ('drivers.personal', 'drivers', 'Personal', 201),
  ('drivers.training', 'drivers', 'Professional training', 202),
  ('drivers.licence', 'drivers', 'Licence', 203),
  ('drivers.osha', 'drivers', 'OSHA fit-for-work', 204),
  ('drivers.documents', 'drivers', 'Documents', 205),
  ('inspections', null, 'Inspections', 300),
  ('inspections.daily', 'inspections', 'Daily (pre-trip) inspection', 301),
  ('inspections.third_party', 'inspections', 'Third-party inspection', 302),
  ('inspections.first_aid', 'inspections', 'First aid kit inspection', 303),
  ('daily_use', null, 'Vehicle daily use', 400),
  ('daily_use.km_log', 'daily_use', 'Daily kilometre log', 401),
  ('daily_use.fuel_log', 'daily_use', 'Fuel log', 402),
  ('daily_use.trip_requests', 'daily_use', 'Daily vehicle use requests', 403),
  ('daily_use.trip_requests.short', 'daily_use.trip_requests', 'Short or town trip', 404),
  ('daily_use.trip_requests.long', 'daily_use.trip_requests', 'Long trip', 405),
  ('daily_use.trip_requests.jmp_hse', 'daily_use.trip_requests', 'JMP: HSE manager sign-off', 406),
  ('daily_use.trip_requests.jmp_control_room', 'daily_use.trip_requests', 'JMP: control room review', 407),
  ('daily_use.trip_requests.jmp_erc', 'daily_use.trip_requests', 'JMP: emergency response review', 408),
  ('expenses', null, 'Fleet expenses and administration', 500),
  ('expenses.fuel', 'expenses', 'Fuel', 501),
  ('expenses.maintenance', 'expenses', 'Maintenance', 502),
  ('expenses.maintenance.requests', 'expenses.maintenance', 'Maintenance requests', 503),
  ('expenses.maintenance.work_orders', 'expenses.maintenance', 'Works orders', 504),
  ('expenses.maintenance.costs', 'expenses.maintenance', 'Maintenance cost', 505),
  ('expenses.tyres', 'expenses', 'Tyres', 506),
  ('expenses.washing', 'expenses', 'Car washing', 507),
  ('expenses.equipment', 'expenses', 'Equipment and accessories', 508),
  ('expenses.trainings', 'expenses', 'Trainings', 509),
  ('expenses.trainings.mandatory', 'expenses.trainings', 'Mandatory training records', 510),
  ('expenses.trainings.toolbox', 'expenses.trainings', 'Toolbox talks', 511),
  ('expenses.trainings.matrix', 'expenses.trainings', 'Training matrix', 512),
  ('expenses.timesheet', 'expenses', 'Timesheet', 513),
  ('expenses.leave', 'expenses', 'Annual leave', 514),
  ('expenses.leave.plan', 'expenses.leave', 'Leave plan', 515),
  ('expenses.leave.requests', 'expenses.leave', 'Leave requests and records', 516),
  ('expenses.leave.balances', 'expenses.leave', 'Leave balances', 517),
  ('expenses.safety', 'expenses', 'Safety', 518),
  ('expenses.safety.incidents', 'expenses.safety', 'Incident and accident records', 519),
  ('expenses.safety.reports', 'expenses.safety', 'Safety reports', 520),
  ('expenses.reports', 'expenses', 'Fleet data reports', 521),
  ('settings', null, 'Settings', 900),
  ('settings.users', 'settings', 'Users', 901),
  ('settings.roles', 'settings', 'Roles and access', 902),
  ('settings.company', 'settings', 'Company', 903),
  ('settings.reminders', 'settings', 'Reminders', 904),
  ('settings.audit', 'settings', 'Audit log', 905)
on conflict (key) do nothing;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('vehicles', 'fleet.details', null, null, false),
  ('vehicle_inspections', 'fleet.inspection_status', null, null, false),
  ('vehicle_insurance', 'fleet.insurance', null, null, false),
  ('service_schedules', 'fleet.maintenance_schedule', null, null, false),
  ('vehicle_remarks', 'fleet.remarks', null, null, false),
  ('drivers', 'drivers.personal', null, null, false),
  ('driver_courses', 'drivers.training', null, null, false),
  ('driver_licences', 'drivers.licence', null, null, false),
  ('driver_osha', 'drivers.osha', null, null, false),
  ('daily_inspections', 'inspections.daily', null, null, false),
  ('third_party_inspections', 'inspections.third_party', null, null, false),
  ('inspection_anomalies', 'inspections', null, null, false),
  ('first_aid_inspections', 'inspections.first_aid', null, null, false),
  ('first_aid_items', 'inspections.first_aid', 'first_aid_inspections', 'inspection_id', false),
  ('km_logs', 'daily_use.km_log', null, null, false),
  ('km_log_trips', 'daily_use.km_log', 'km_logs', 'km_log_id', false),
  ('fuel_requests', 'daily_use.fuel_log', null, null, true),
  ('fuel_issues', 'daily_use.fuel_log', null, null, false),
  ('vehicle_requests', 'daily_use.trip_requests', null, null, true),
  ('vehicle_assignments', 'daily_use.trip_requests', 'vehicle_requests', 'vehicle_request_id', false),
  ('jmp_reviews', 'daily_use.trip_requests', 'vehicle_requests', 'vehicle_request_id', false),
  ('fuel_expenses', 'expenses.fuel', null, null, false),
  ('maintenance_requests', 'expenses.maintenance.requests', null, null, true),
  ('work_orders', 'expenses.maintenance.work_orders', null, null, false),
  ('maintenance_costs', 'expenses.maintenance.costs', null, null, false),
  ('tyre_requests', 'expenses.tyres', null, null, true),
  ('wash_requests', 'expenses.washing', null, null, true),
  ('vehicle_equipment', 'expenses.equipment', null, null, false),
  ('mandatory_trainings', 'expenses.trainings.mandatory', null, null, false),
  ('toolbox_plans', 'expenses.trainings.toolbox', null, null, false),
  ('timesheets', 'expenses.timesheet', null, null, true),
  ('timesheet_days', 'expenses.timesheet', 'timesheets', 'timesheet_id', false),
  ('leave_plans', 'expenses.leave.plan', null, null, false),
  ('leave_plan_rows', 'expenses.leave.plan', 'leave_plans', 'leave_plan_id', false),
  ('leave_balances', 'expenses.leave.balances', null, null, false),
  ('leave_requests', 'expenses.leave.requests', null, null, true),
  ('incidents', 'expenses.safety.incidents', null, null, false),
  ('incident_vehicles', 'expenses.safety.incidents', 'incidents', 'incident_id', false),
  ('incident_people', 'expenses.safety.incidents', 'incidents', 'incident_id', false);

-- ---------------------------------------------------------------------------
-- Policy generator
-- ---------------------------------------------------------------------------
create or replace function public.apply_standard_rls(p_table text, p_resource text)
returns void language plpgsql as $$
declare
  has_driver boolean;
  has_dept boolean;
  has_employee boolean;
  drv text;
  dept text;
  own_check text;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'driver_id') into has_driver;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'department') into has_dept;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'employee_id') into has_employee;
  -- On the drivers table the row itself is the driver.
  drv := case when p_table = 'drivers' then 'id' when has_driver then 'driver_id' else 'null::uuid' end;
  dept := case when has_dept then 'department' else 'null::text' end;
  -- Rows that belong to the user through employee_id (timesheets, leave) are "own" too.
  own_check := case when has_employee then ' or employee_id = auth.uid()' else '' end;

  execute format('alter table public.%I enable row level security', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_select', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (
       deleted_at is null and (public.row_access(%L, ''view'', company_id, created_by, %s, %s)%s)
     )', p_table || '_select', p_table, p_resource, drv, dept,
     case when has_employee then format(' or (company_id = public.my_company_id() and public.has_permission(%L, ''view'') and employee_id = auth.uid())', p_resource) else '' end);

  execute format(
    'create policy %I on public.%I for insert to authenticated with check (
       company_id = public.my_company_id()
       and public.has_permission(%L, ''create'')
       and (public.permission_scope(%L, ''create'') <> ''own'' or %s is null or %s = public.my_driver_id()%s)
     )', p_table || '_insert', p_table, p_resource, p_resource, drv, drv, own_check);

  execute format(
    'create policy %I on public.%I for update to authenticated using (
       deleted_at is null and (
         public.row_access(%L, ''edit'', company_id, created_by, %s, %s)
         or public.row_access(%L, ''delete'', company_id, created_by, %s, %s)
         or public.row_access(%L, ''approve'', company_id, created_by, %s, %s)%s
       )
     ) with check (company_id = public.my_company_id())',
     p_table || '_update', p_table, p_resource, drv, dept, p_resource, drv, dept, p_resource, drv, dept,
     case when has_employee then format(' or (company_id = public.my_company_id() and public.has_permission(%L, ''edit'') and employee_id = auth.uid())', p_resource) else '' end);

  execute format('create policy %I on public.%I for delete to authenticated using (public.is_owner())', p_table || '_hard_delete', p_table);

  execute format('create trigger %I before update on public.%I for each row execute function public.guard_soft_delete(%L)',
    p_table || '_soft_delete_guard', p_table, p_resource);
end;
$$;

create or replace function public.apply_child_rls(p_table text, p_resource text, p_parent text, p_fk text)
returns void language plpgsql as $$
declare
  has_driver boolean;
  has_employee boolean;
  drv text;
  emp text;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_parent and column_name = 'driver_id') into has_driver;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_parent and column_name = 'employee_id') into has_employee;
  drv := case when has_driver then 'p.driver_id' else 'null::uuid' end;
  emp := case when has_employee then format(' or (public.has_permission(%L, ''view'') and p.employee_id = auth.uid())', p_resource) else '' end;

  execute format('alter table public.%I enable row level security', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (
       deleted_at is null and exists (
         select 1 from public.%I p where p.id = %I.%I and p.deleted_at is null
           and (public.row_access(%L, ''view'', p.company_id, p.created_by, %s)%s)
       )
     )', p_table || '_select', p_table, p_parent, p_table, p_fk, p_resource, drv, emp);

  execute format(
    'create policy %I on public.%I for insert to authenticated with check (
       company_id = public.my_company_id() and exists (
         select 1 from public.%I p where p.id = %I.%I and p.deleted_at is null
           and (public.row_access(%L, ''edit'', p.company_id, p.created_by, %s)
                or (public.has_permission(%L, ''create'') and p.created_by = auth.uid())%s)
       )
     )', p_table || '_insert', p_table, p_parent, p_table, p_fk, p_resource, drv, p_resource,
     replace(emp, '''view''', '''edit'''));

  execute format(
    'create policy %I on public.%I for update to authenticated using (
       deleted_at is null and exists (
         select 1 from public.%I p where p.id = %I.%I and p.deleted_at is null
           and (public.row_access(%L, ''edit'', p.company_id, p.created_by, %s)
                or public.row_access(%L, ''delete'', p.company_id, p.created_by, %s)
                or public.row_access(%L, ''approve'', p.company_id, p.created_by, %s)%s)
       )
     ) with check (company_id = public.my_company_id())',
     p_table || '_update', p_table, p_parent, p_table, p_fk, p_resource, drv, p_resource, drv, p_resource, drv,
     replace(emp, '''view''', '''edit'''));

  -- Child rows may be removed outright by anyone who can edit the parent (they are form rows, not records).
  execute format(
    'create policy %I on public.%I for delete to authenticated using (
       exists (
         select 1 from public.%I p where p.id = %I.%I
           and (public.row_access(%L, ''edit'', p.company_id, p.created_by, %s)%s)
       )
     )', p_table || '_delete', p_table, p_parent, p_table, p_fk, p_resource, drv, replace(emp, '''view''', '''edit'''));
end;
$$;

do $$
declare r record;
begin
  for r in select * from public.table_resources loop
    if r.parent_table is null then
      perform public.apply_standard_rls(r.table_name, r.resource_key);
    else
      perform public.apply_child_rls(r.table_name, r.resource_key, r.parent_table, r.parent_fk);
    end if;
  end loop;
end $$;

-- Reference tables readable by anyone who can see the module that uses them.
alter table public.wash_prices enable row level security;
create policy wash_prices_select on public.wash_prices for select to authenticated
  using (deleted_at is null and company_id = public.my_company_id()
    and (public.has_permission('expenses.washing', 'view') or public.has_permission('settings.company', 'view')));
create policy wash_prices_write on public.wash_prices for all to authenticated
  using (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'))
  with check (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'));

alter table public.leave_categories enable row level security;
create policy leave_categories_select on public.leave_categories for select to authenticated
  using (deleted_at is null and company_id = public.my_company_id()
    and (public.has_permission('expenses.leave', 'view') or public.has_permission('settings.company', 'view')));
create policy leave_categories_write on public.leave_categories for all to authenticated
  using (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'))
  with check (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'));

alter table public.reminder_settings enable row level security;
create policy reminder_settings_select on public.reminder_settings for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission('settings.reminders', 'view'));
create policy reminder_settings_write on public.reminder_settings for all to authenticated
  using (company_id = public.my_company_id() and public.has_permission('settings.reminders', 'edit'))
  with check (company_id = public.my_company_id() and public.has_permission('settings.reminders', 'edit'));

-- Attachments: governed by the resource they belong to; sensitive files need drivers.documents.
alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select to authenticated
  using (deleted_at is null and company_id = public.my_company_id()
    and public.has_permission(resource_key, 'view')
    and (not is_sensitive or public.has_permission('drivers.documents', 'view')));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (company_id = public.my_company_id()
    and (public.has_permission(resource_key, 'create') or public.has_permission(resource_key, 'edit')));
create policy attachments_update on public.attachments for update to authenticated
  using (company_id = public.my_company_id() and public.has_permission(resource_key, 'edit'))
  with check (company_id = public.my_company_id());
create policy attachments_delete on public.attachments for delete to authenticated
  using (company_id = public.my_company_id() and (public.has_permission(resource_key, 'delete') or created_by = auth.uid()));

-- Reminders: visible to anyone who may view the source resource; written by triggers.
alter table public.reminders enable row level security;
create policy reminders_select on public.reminders for select to authenticated
  using (deleted_at is null and company_id = public.my_company_id()
    and (public.has_permission(resource_key, 'view') or (driver_id is not null and driver_id = public.my_driver_id())));
create policy reminders_update on public.reminders for update to authenticated
  using (company_id = public.my_company_id() and public.has_permission(resource_key, 'edit'))
  with check (company_id = public.my_company_id());

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.report_presets enable row level security;
create policy report_presets_all on public.report_presets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and company_id = public.my_company_id());

-- ---------------------------------------------------------------------------
-- Notification helpers (security definer so triggers can write for other users)
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_company uuid default null, p_reminder uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (company_id, user_id, kind, title, body, link, reminder_id)
  values (coalesce(p_company, (select company_id from public.profiles where id = p_user)), p_user, p_kind, p_title, p_body, p_link, p_reminder);
end;
$$;

create or replace function public.notify_approvers(p_company uuid, p_resource text, p_title text, p_body text, p_link text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  p record;
  n integer := 0;
begin
  for p in select id from public.profiles where company_id = p_company and is_active loop
    if public.permission_scope_for(p.id, p_resource, 'approve') is not null then
      perform public.notify_user(p.id, 'approval', p_title, p_body, p_link, p_company);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Request status transitions
-- ---------------------------------------------------------------------------
create or replace function public.request_status_guard()
returns trigger language plpgsql as $$
declare
  v_resource text := tg_argv[0];
  v_link text := tg_argv[1];
  v_approving boolean := coalesce(current_setting('fms.approving', true), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'A new request must start as draft or submitted' using errcode = '23514', hint = 'illegal_transition';
    end if;
    if new.status = 'submitted' then
      perform public.notify_approvers(new.company_id, v_resource,
        format('%s awaiting approval', (select name from public.resources where key = v_resource)),
        'A request was submitted and needs a decision.', v_link || '/' || new.id);
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if new.status in ('approved', 'rejected') and not v_approving then
    raise exception 'Approvals and rejections must go through approve_request or reject_request'
      using errcode = '42501', hint = 'use_rpc';
  end if;

  if not (
       (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'draft'))
    or (old.status = 'approved' and new.status = 'completed')
    or (old.status = 'rejected' and new.status in ('draft', 'submitted'))
  ) then
    raise exception 'Illegal status change from % to %', old.status, new.status using errcode = '23514', hint = 'illegal_transition';
  end if;

  if new.status = 'rejected' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;

  if new.status = 'submitted' then
    perform public.notify_approvers(new.company_id, v_resource,
      format('%s awaiting approval', (select name from public.resources where key = v_resource)),
      'A request was submitted and needs a decision.', v_link || '/' || new.id);
  end if;
  return new;
end;
$$;

create trigger fuel_requests_status before insert or update on public.fuel_requests
  for each row execute function public.request_status_guard('daily_use.fuel_log', '/daily-use/fuel-log');
create trigger vehicle_requests_status before insert or update on public.vehicle_requests
  for each row execute function public.request_status_guard('daily_use.trip_requests', '/daily-use/trip-requests');
create trigger maintenance_requests_status before insert or update on public.maintenance_requests
  for each row execute function public.request_status_guard('expenses.maintenance.requests', '/expenses/maintenance/requests');
create trigger tyre_requests_status before insert or update on public.tyre_requests
  for each row execute function public.request_status_guard('expenses.tyres', '/expenses/tyres');
create trigger wash_requests_status before insert or update on public.wash_requests
  for each row execute function public.request_status_guard('expenses.washing', '/expenses/washing');
create trigger timesheets_status before insert or update on public.timesheets
  for each row execute function public.request_status_guard('expenses.timesheet', '/expenses/timesheet');
create trigger leave_requests_status before insert or update on public.leave_requests
  for each row execute function public.request_status_guard('expenses.leave.requests', '/expenses/leave/requests');

-- ---------------------------------------------------------------------------
-- Km log totals and vehicle odometer
-- ---------------------------------------------------------------------------
create or replace function public.km_log_trips_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_log_id uuid := coalesce(new.km_log_id, old.km_log_id);
  v_vehicle uuid;
  v_max_km numeric;
begin
  update public.km_logs l set
    total_km = coalesce((select sum(trip_km) from public.km_log_trips t where t.km_log_id = l.id and t.deleted_at is null), 0),
    trip_count = coalesce((select count(*) from public.km_log_trips t where t.km_log_id = l.id and t.deleted_at is null), 0)
  where l.id = v_log_id
  returning vehicle_id into v_vehicle;

  select max(km_end) into v_max_km from public.km_log_trips t where t.km_log_id = v_log_id and t.deleted_at is null;
  if v_vehicle is not null and v_max_km is not null then
    update public.vehicles set odometer_km = greatest(odometer_km, v_max_km) where id = v_vehicle;
  end if;
  return null;
end;
$$;
create trigger km_log_trips_after after insert or update or delete on public.km_log_trips
  for each row execute function public.km_log_trips_after();

-- Any saved odometer reading moves the vehicle mileage forward.
create or replace function public.bump_vehicle_odometer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_km numeric;
  j jsonb := to_jsonb(new);
begin
  v_km := coalesce((j ->> 'current_odometer')::numeric, (j ->> 'odometer_km')::numeric, (j ->> 'mileage_km')::numeric, (j ->> 'km_end')::numeric);
  if v_km is not null then
    update public.vehicles set odometer_km = greatest(odometer_km, v_km) where id = new.vehicle_id;
  end if;
  return null;
end;
$$;
create trigger daily_inspections_odometer after insert or update on public.daily_inspections for each row execute function public.bump_vehicle_odometer();
create trigger fuel_requests_odometer after insert or update on public.fuel_requests for each row execute function public.bump_vehicle_odometer();
create trigger fuel_issues_odometer after insert or update on public.fuel_issues for each row execute function public.bump_vehicle_odometer();
create trigger maintenance_requests_odometer after insert or update on public.maintenance_requests for each row execute function public.bump_vehicle_odometer();

-- ---------------------------------------------------------------------------
-- Fuel: default price, approved litres shown to the driver, expense row from each issue
-- ---------------------------------------------------------------------------
create or replace function public.fuel_issues_defaults()
returns trigger language plpgsql as $$
declare
  v_price numeric;
  v_tank numeric;
begin
  if new.price_per_litre = 0 then
    select (settings ->> 'fuel_price_per_litre')::numeric into v_price from public.companies where id = new.company_id;
    new.price_per_litre := coalesce(v_price, 0);
  end if;
  if new.balance_l is null then
    select fuel_tank_capacity_l into v_tank from public.vehicles where id = new.vehicle_id;
    if v_tank is not null and new.fuel_filled_l is not null then
      new.balance_l := greatest(v_tank - new.fuel_issued_l, 0);
    end if;
  end if;
  return new;
end;
$$;
create trigger fuel_issues_defaults before insert or update on public.fuel_issues for each row execute function public.fuel_issues_defaults();

create or replace function public.fuel_issues_to_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target numeric;
begin
  select target_km_per_l into v_target from public.vehicles where id = new.vehicle_id;
  insert into public.fuel_expenses (company_id, fuel_issue_id, vehicle_id, expense_date, km_start, km_end, target_km_per_l, fuel_consumed_l, price_per_litre, created_by)
  values (new.company_id, new.id, new.vehicle_id, new.issue_date, new.previous_odometer, new.current_odometer, v_target, new.fuel_issued_l, new.price_per_litre, new.created_by)
  on conflict do nothing;
  if new.fuel_request_id is not null then
    update public.fuel_requests set approved_l = new.fuel_issued_l where id = new.fuel_request_id and approved_l is null;
  end if;
  return null;
end;
$$;
create trigger fuel_issues_to_expense after insert on public.fuel_issues for each row execute function public.fuel_issues_to_expense();

-- ---------------------------------------------------------------------------
-- Wash cost from the price list
-- ---------------------------------------------------------------------------
create or replace function public.wash_requests_cost()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(sum(p.price_tzs), 0) into new.cost_tzs
  from public.wash_prices p
  where p.company_id = new.company_id and p.deleted_at is null and p.category = any(new.categories);
  return new;
end;
$$;
create trigger wash_requests_cost before insert or update of categories on public.wash_requests
  for each row execute function public.wash_requests_cost();

-- ---------------------------------------------------------------------------
-- Work orders: vehicle in garage while out
-- ---------------------------------------------------------------------------
create or replace function public.work_orders_vehicle_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date_out is not null and new.date_in is null and new.deleted_at is null then
    update public.vehicles set status = 'in_garage' where id = new.vehicle_id and status <> 'out_of_service';
    new.status := case when new.status = 'closed' then 'in_progress' else new.status end;
  elsif new.date_in is not null then
    new.status := 'closed';
    if not exists (select 1 from public.work_orders w where w.vehicle_id = new.vehicle_id and w.id <> new.id and w.deleted_at is null and w.date_out is not null and w.date_in is null) then
      update public.vehicles set status = 'in_service' where id = new.vehicle_id and status = 'in_garage';
    end if;
  end if;
  return new;
end;
$$;
create trigger work_orders_vehicle_status before insert or update on public.work_orders
  for each row execute function public.work_orders_vehicle_status();

-- ---------------------------------------------------------------------------
-- Timesheet totals
-- ---------------------------------------------------------------------------
create or replace function public.timesheet_days_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.timesheet_id, old.timesheet_id);
begin
  update public.timesheets t set
    total_normal_hours = coalesce((select sum(normal_hours) from public.timesheet_days d where d.timesheet_id = t.id and d.deleted_at is null), 0),
    total_overtime_hours = coalesce((select sum(overtime_hours) from public.timesheet_days d where d.timesheet_id = t.id and d.deleted_at is null), 0)
  where t.id = v_id;
  return null;
end;
$$;
create trigger timesheet_days_after after insert or update or delete on public.timesheet_days
  for each row execute function public.timesheet_days_after();

-- Hours from time in / time out when not given (over 8 h counts as overtime).
create or replace function public.timesheet_days_hours()
returns trigger language plpgsql as $$
declare v_hours numeric;
begin
  if new.time_in is not null and new.time_out is not null and new.normal_hours = 0 and new.overtime_hours = 0 then
    v_hours := round(extract(epoch from (new.time_out - new.time_in)) / 3600.0, 2);
    if v_hours < 0 then v_hours := v_hours + 24; end if;
    new.normal_hours := least(v_hours, 8);
    new.overtime_hours := greatest(v_hours - 8, 0);
  end if;
  return new;
end;
$$;
create trigger timesheet_days_hours before insert or update on public.timesheet_days
  for each row execute function public.timesheet_days_hours();

-- ---------------------------------------------------------------------------
-- Leave: cannot request more than the balance
-- ---------------------------------------------------------------------------
create or replace function public.leave_requests_balance_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric;
  v_counts boolean;
begin
  if new.status in ('draft', 'submitted') and (tg_op = 'INSERT' or new.status <> old.status or new.date_from <> old.date_from or new.date_to <> old.date_to) then
    select counts_against_balance into v_counts from public.leave_categories where id = new.category_id;
    if coalesce(v_counts, true) then
      select balance_days into v_balance from public.v_leave_balances
      where employee_id = new.employee_id and balance_year = extract(year from new.date_from)::int;
      if v_balance is not null and (new.date_to - new.date_from + 1) > v_balance then
        raise exception 'Requested % days exceeds the leave balance of % days', new.date_to - new.date_from + 1, v_balance
          using errcode = '23514', hint = 'leave_balance';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger leave_requests_balance_guard before insert or update on public.leave_requests
  for each row execute function public.leave_requests_balance_guard();

-- ---------------------------------------------------------------------------
-- Inspections: anomalies, "Not safe for use", closing rights
-- ---------------------------------------------------------------------------
create or replace function public.inspection_anomalies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg text;
begin
  -- Fill vehicle and driver from the parent inspection.
  if new.daily_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.daily_inspections where id = new.daily_inspection_id;
  elsif new.third_party_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.third_party_inspections where id = new.third_party_inspection_id;
  end if;

  if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'closed' then
    if not public.has_permission('inspections', 'approve') then
      raise exception 'Only a fleet manager (approve on Inspections) can close an anomaly' using errcode = '42501', hint = 'permission_denied';
    end if;
    new.date_closed := coalesce(new.date_closed, current_date);
    new.closed_by := auth.uid();
  end if;
  if new.status = 'open' then
    new.date_closed := null;
    new.closed_by := null;
  end if;

  if tg_op = 'INSERT' and new.when_to_act = 'immediately' then
    select registration into v_reg from public.vehicles where id = new.vehicle_id;
    perform public.notify_approvers(new.company_id, 'inspections',
      format('Vehicle %s is not safe for use', coalesce(v_reg, '')),
      left(new.description, 200), '/inspections/anomalies');
  end if;
  return new;
end;
$$;
create trigger inspection_anomalies_guard before insert or update on public.inspection_anomalies
  for each row execute function public.inspection_anomalies_guard();

-- Mark the parent inspection as having anomalies whenever one is attached.
create or replace function public.inspection_anomalies_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.daily_inspection_id is not null then
    update public.daily_inspections set remark = 'anomalies' where id = new.daily_inspection_id and remark <> 'anomalies';
  elsif new.third_party_inspection_id is not null then
    update public.third_party_inspections set remark = 'anomalies' where id = new.third_party_inspection_id and remark <> 'anomalies';
  end if;
  return null;
end;
$$;
create trigger inspection_anomalies_after after insert on public.inspection_anomalies
  for each row execute function public.inspection_anomalies_after();

-- ---------------------------------------------------------------------------
-- Drivers: keep the linked profile in sync and default names on records
-- ---------------------------------------------------------------------------
create or replace function public.drivers_sync_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null then
    update public.profiles set driver_id = new.id where id = new.profile_id and driver_id is distinct from new.id;
  end if;
  if tg_op = 'UPDATE' and old.profile_id is not null and new.profile_id is distinct from old.profile_id then
    update public.profiles set driver_id = null where id = old.profile_id and driver_id = old.id;
  end if;
  return null;
end;
$$;
create trigger drivers_sync_profile after insert or update on public.drivers
  for each row execute function public.drivers_sync_profile();

-- Driver-created records default to the driver's own id.
create or replace function public.default_driver_id()
returns trigger language plpgsql as $$
begin
  if new.driver_id is null then
    new.driver_id := public.my_driver_id();
  end if;
  return new;
end;
$$;
create trigger daily_inspections_driver before insert on public.daily_inspections for each row execute function public.default_driver_id();
create trigger third_party_inspections_driver before insert on public.third_party_inspections for each row execute function public.default_driver_id();
create trigger km_logs_driver before insert on public.km_logs for each row execute function public.default_driver_id();
create trigger fuel_requests_driver before insert on public.fuel_requests for each row execute function public.default_driver_id();
create trigger maintenance_requests_driver before insert on public.maintenance_requests for each row execute function public.default_driver_id();
create trigger tyre_requests_driver before insert on public.tyre_requests for each row execute function public.default_driver_id();
create trigger wash_requests_driver before insert on public.wash_requests for each row execute function public.default_driver_id();

-- Requests made by employees default to the current user.
create or replace function public.default_employee_id()
returns trigger language plpgsql as $$
begin
  if new.employee_id is null then new.employee_id := auth.uid(); end if;
  if new.driver_id is null then new.driver_id := public.my_driver_id(); end if;
  return new;
end;
$$;
create trigger timesheets_employee before insert on public.timesheets for each row execute function public.default_employee_id();
create trigger leave_plans_employee before insert on public.leave_plans for each row execute function public.default_employee_id();
create trigger leave_requests_employee before insert on public.leave_requests for each row execute function public.default_employee_id();
create trigger leave_balances_employee before insert on public.leave_balances for each row execute function public.default_employee_id();

create or replace function public.default_requester()
returns trigger language plpgsql as $$
begin
  if new.requester_id is null then new.requester_id := auth.uid(); end if;
  if new.requester_name is null then select full_name into new.requester_name from public.profiles where id = new.requester_id; end if;
  if new.requester_phone is null then select phone into new.requester_phone from public.profiles where id = new.requester_id; end if;
  return new;
end;
$$;
create trigger vehicle_requests_requester before insert on public.vehicle_requests for each row execute function public.default_requester();

-- Incident driver snapshot from the driver record when a driver is linked.
create or replace function public.incidents_driver_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.drivers; l public.driver_licences;
begin
  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    select * into d from public.drivers where id = new.driver_id;
    select * into l from public.driver_licences where driver_id = new.driver_id and deleted_at is null order by expiry_date desc nulls last limit 1;
    new.driver_name := coalesce(new.driver_name, d.full_name);
    new.driver_company := coalesce(new.driver_company, d.employer, (select name from public.companies where id = d.company_id));
    new.driver_contact := coalesce(new.driver_contact, d.phone);
    new.driver_sex := coalesce(new.driver_sex, d.sex);
    new.driver_age := coalesce(new.driver_age, case when d.date_of_birth is not null then extract(year from age(d.date_of_birth))::int end);
    new.driver_years_driving := coalesce(new.driver_years_driving, d.years_driving);
    new.driver_licence_class := coalesce(new.driver_licence_class, l.licence_class);
    new.driver_licence_number := coalesce(new.driver_licence_number, l.licence_number);
  end if;
  return new;
end;
$$;
create trigger incidents_driver_snapshot before insert or update on public.incidents
  for each row execute function public.incidents_driver_snapshot();

-- Keep injuries / fatalities counts in step with the people rows.
create or replace function public.incident_people_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.incident_id, old.incident_id);
begin
  update public.incidents i set
    injuries_count = (select count(*) from public.incident_people p where p.incident_id = i.id and p.kind = 'injured' and p.deleted_at is null),
    fatalities_count = (select count(*) from public.incident_people p where p.incident_id = i.id and p.kind = 'deceased' and p.deleted_at is null)
  where i.id = v_id;
  return null;
end;
$$;
create trigger incident_people_after after insert or update or delete on public.incident_people
  for each row execute function public.incident_people_after();

-- Incident vehicle snapshot from the fleet.
create or replace function public.incident_vehicles_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.vehicles; ins public.vehicle_insurance;
begin
  if new.vehicle_id is not null then
    select * into v from public.vehicles where id = new.vehicle_id;
    select * into ins from public.vehicle_insurance where vehicle_id = new.vehicle_id and deleted_at is null order by end_date desc nulls last limit 1;
    new.make := coalesce(new.make, v.make);
    new.model := coalesce(new.model, v.model);
    new.registration := coalesce(new.registration, v.registration);
    new.yom := coalesce(new.yom, v.yom);
    new.owner_name := coalesce(new.owner_name, v.owner_name);
    new.insurance_policy_number := coalesce(new.insurance_policy_number, ins.policy_number);
  end if;
  return new;
end;
$$;
create trigger incident_vehicles_snapshot before insert or update on public.incident_vehicles
  for each row execute function public.incident_vehicles_snapshot();

-- Tyre request: previous request date and odometer from the last request for the vehicle.
create or replace function public.tyre_requests_previous()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.previous_request_date is null then
    select request_date, odometer_km into new.previous_request_date, new.previous_odometer_km
    from public.tyre_requests where vehicle_id = new.vehicle_id and deleted_at is null and id <> new.id
    order by request_date desc limit 1;
  end if;
  return new;
end;
$$;
create trigger tyre_requests_previous before insert on public.tyre_requests
  for each row execute function public.tyre_requests_previous();

-- Fuel request: previous odometer from the vehicle when not given.
create or replace function public.fuel_requests_previous()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.previous_odometer is null then
    select odometer_km into new.previous_odometer from public.vehicles where id = new.vehicle_id;
  end if;
  return new;
end;
$$;
create trigger fuel_requests_previous before insert on public.fuel_requests
  for each row execute function public.fuel_requests_previous();
