-- (1) Maintenance and repair, per vehicle and month, in five tabs:
--     work orders (emailed to the service provider), job cards (the maintenance records, now with
--     date in and out of the garage and km in and out), spare parts, invoices (approved by the fleet
--     manager, then the HOD) and purchase orders.
-- (2) Timesheets are approved again: recorded by the coordinator, approved by the fleet manager,
--     then by the HOD. The coordinator's name is the person who records it.
-- (3) A request sent by someone who holds its first approval (the fleet manager) is approved at that
--     step by them as it is sent; the HOD still decides.

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.maintenance.costs.hod', 'expenses.maintenance.costs', 'Maintenance invoices: HOD approval', null, null, null, 407, false, false),
  ('expenses.timesheet.hod', 'expenses.timesheet', 'Timesheet: HOD approval', null, null, null, 552, false, false)
on conflict (key) do update set name = excluded.name, parent_key = excluded.parent_key;
update public.resources set is_request = true where key in ('expenses.timesheet', 'expenses.maintenance.costs');

-- Whoever gives the HOD's final approval of leave gives these HOD approvals too.
insert into public.role_grants (role_id, resource_key, actions, scope)
select g.role_id, x.key, array['view', 'approve']::public.permission_action[], g.scope
from public.role_grants g
cross join (values ('expenses.maintenance.costs.hod'), ('expenses.timesheet.hod')) x(key)
where g.resource_key = 'expenses.leave.requests.hod' and 'approve' = any(g.actions)
on conflict (role_id, resource_key) do nothing;

-- ---------------------------------------------------------------------------
-- (1) Maintenance and repair
-- ---------------------------------------------------------------------------
-- Job cards: the maintenance records, with the garage stay.
alter table public.maintenance_costs
  add column if not exists date_in date,
  add column if not exists date_out date,
  add column if not exists km_in numeric(12,1),
  add column if not exists km_out numeric(12,1);
alter table public.maintenance_costs drop column if exists days_in_garage;
alter table public.maintenance_costs drop column if exists km_in_garage;
alter table public.maintenance_costs
  add column days_in_garage integer generated always as (case when date_in is not null and date_out is not null then date_out - date_in end) stored,
  add column km_in_garage numeric(12,1) generated always as (case when km_in is not null and km_out is not null then km_out - km_in end) stored;
alter table public.maintenance_costs drop constraint if exists maintenance_costs_garage_dates_check;
alter table public.maintenance_costs add constraint maintenance_costs_garage_dates_check check (date_out is null or date_in is null or date_out >= date_in);
alter table public.maintenance_costs drop constraint if exists maintenance_costs_garage_km_check;
alter table public.maintenance_costs add constraint maintenance_costs_garage_km_check check (km_out is null or km_in is null or km_out >= km_in);
alter table public.maintenance_costs alter column service_provider drop not null;

create table if not exists public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  order_number text,
  order_date date not null default current_date,
  description text not null,
  service_provider text not null,
  provider_email text,
  emailed_at timestamptz,
  emailed_to text
);

create table if not exists public.maintenance_spare_parts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  part_date date not null default current_date,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price_tzs numeric(14,2) not null default 0 check (unit_price_tzs >= 0),
  cost_tzs numeric(14,2) generated always as (round(quantity * unit_price_tzs, 2)) stored
);

create table if not exists public.maintenance_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  invoice_number text not null,
  invoice_date date not null default current_date,
  service_provider text not null,
  labour_tzs numeric(14,2) not null default 0 check (labour_tzs >= 0),
  parts_tzs numeric(14,2) not null default 0 check (parts_tzs >= 0),
  amount_tzs numeric(14,2) generated always as (labour_tzs + parts_tzs) stored,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  approval_step text,
  submitted_at timestamptz
);

create table if not exists public.maintenance_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  po_number text,
  po_date date not null default current_date,
  service_provider text not null,
  amount_tzs numeric(14,2) not null default 0 check (amount_tzs >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partly_paid', 'paid'))
);

do $$
declare
  t text;
begin
  foreach t in array array['maintenance_work_orders', 'maintenance_spare_parts', 'maintenance_invoices', 'maintenance_purchase_orders'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at') then
      execute format('alter table public.%I
        add column created_at timestamptz not null default now(),
        add column created_by uuid,
        add column updated_at timestamptz not null default now(),
        add column updated_by uuid,
        add column deleted_at timestamptz', t);
      execute format('create index %I on public.%I (company_id) where deleted_at is null', t || '_company_idx', t);
      execute format('create index %I on public.%I (vehicle_id) where deleted_at is null', t || '_vehicle_idx', t);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
      execute format('grant all on public.%I to authenticated, service_role', t);
    end if;
  end loop;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('maintenance_work_orders', 'expenses.maintenance.costs', null, null, false),
  ('maintenance_spare_parts', 'expenses.maintenance.costs', null, null, false),
  ('maintenance_invoices', 'expenses.maintenance.costs', null, null, true),
  ('maintenance_purchase_orders', 'expenses.maintenance.costs', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;

select public.apply_standard_rls('maintenance_work_orders', 'expenses.maintenance.costs');
select public.apply_standard_rls('maintenance_spare_parts', 'expenses.maintenance.costs');
select public.apply_standard_rls('maintenance_invoices', 'expenses.maintenance.costs');
select public.apply_standard_rls('maintenance_purchase_orders', 'expenses.maintenance.costs');

-- Work order and purchase order numbers: WO-2026-0001, PO-2026-0001 (per company and year) when left empty.
create or replace function public.maintenance_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefix text := tg_argv[0];
  v_col text := tg_argv[1];
  v_date_col text := tg_argv[2];
  v_row jsonb := to_jsonb(new);
  v_year text := to_char(coalesce((v_row ->> v_date_col)::date, current_date), 'YYYY');
  v_last integer;
begin
  if coalesce(trim(v_row ->> v_col), '') <> '' then return new; end if;
  execute format('select coalesce(max(nullif(substring(%I from %L), '''')::integer), 0) from public.%I where company_id = $1',
    v_col, '^' || v_prefix || '-' || v_year || '-([0-9]+)$', tg_table_name)
    into v_last using new.company_id;
  new := jsonb_populate_record(new, jsonb_build_object(v_col, v_prefix || '-' || v_year || '-' || lpad((v_last + 1)::text, 4, '0')));
  return new;
end;
$$;
drop trigger if exists maintenance_work_orders_number on public.maintenance_work_orders;
create trigger maintenance_work_orders_number before insert or update of order_number on public.maintenance_work_orders
  for each row execute function public.maintenance_number('WO', 'order_number', 'order_date');
drop trigger if exists maintenance_purchase_orders_number on public.maintenance_purchase_orders;
create trigger maintenance_purchase_orders_number before insert or update of po_number on public.maintenance_purchase_orders
  for each row execute function public.maintenance_number('PO', 'po_number', 'po_date');

-- Invoices: a request with two steps.
drop trigger if exists maintenance_invoices_status on public.maintenance_invoices;
create trigger maintenance_invoices_status before insert or update on public.maintenance_invoices
  for each row execute function public.request_status_guard('expenses.maintenance.costs', '/expenses/maintenance/costs/invoices');
drop trigger if exists maintenance_invoices_reset_step on public.maintenance_invoices;
create trigger maintenance_invoices_reset_step before insert or update of status on public.maintenance_invoices
  for each row execute function public.staged_reset_step();
drop trigger if exists maintenance_invoices_submitted_at on public.maintenance_invoices;
create trigger maintenance_invoices_submitted_at before insert or update of status on public.maintenance_invoices
  for each row execute function public.set_submitted_at();
drop trigger if exists maintenance_invoices_workflow on public.maintenance_invoices;
create trigger maintenance_invoices_workflow after insert or update of status on public.maintenance_invoices
  for each row execute function public.requests_workflow_after();

-- Send a work order to the service provider by email.
create or replace function public.send_work_order(p_id uuid, p_email text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  w record;
  v_email text;
  v_company_name text;
  v_sender record;
  v_at timestamptz := now();
begin
  select o.*, ve.registration, trim(coalesce(ve.make, '') || ' ' || coalesce(ve.model, '')) as make_model, ve.odometer_km
    into w
  from public.maintenance_work_orders o
  join public.vehicles ve on ve.id = o.vehicle_id
  where o.id = p_id and o.deleted_at is null;
  if w.id is null or w.company_id is distinct from public.my_company_id() then
    raise exception 'Work order not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not public.has_permission('expenses.maintenance.costs', 'edit') and not public.has_permission('expenses.maintenance.costs', 'create') then
    raise exception 'You do not have permission to send work orders' using errcode = '42501', hint = 'permission_denied';
  end if;
  v_email := lower(trim(coalesce(nullif(trim(p_email), ''), w.provider_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter the service provider''s email address' using errcode = '23514', hint = 'email_missing';
  end if;
  select name into v_company_name from public.companies where id = w.company_id;
  select full_name, phone, email, job_title into v_sender from public.profiles where id = auth.uid();
  insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
  values (w.company_id, null, 'email', v_email, 'work_order', jsonb_build_object(
    'record_table', 'maintenance_work_orders',
    'record_id', w.id,
    'name', coalesce(w.service_provider, ''),
    'company', coalesce(v_company_name, ''),
    'order', coalesce(w.order_number, ''),
    'vehicle', coalesce(w.registration, ''),
    'sender', coalesce(v_sender.full_name, ''),
    'sender_contact', concat_ws(', ', nullif(v_sender.job_title, ''), nullif(v_sender.phone, ''), nullif(v_sender.email, '')),
    'details', jsonb_build_array(
      jsonb_build_object('label', 'Work order', 'value', coalesce(w.order_number, '')),
      jsonb_build_object('label', 'Order date', 'value', to_char(w.order_date, 'DD Mon YYYY')),
      jsonb_build_object('label', 'Vehicle', 'value', coalesce(w.registration, '')),
      jsonb_build_object('label', 'Make and model', 'value', coalesce(w.make_model, '')),
      jsonb_build_object('label', 'Odometer', 'value', case when w.odometer_km is null then '' else trim(to_char(w.odometer_km, 'FM999,999,990')) || ' km' end),
      jsonb_build_object('label', 'Work to be done', 'value', coalesce(w.description, ''))
    )));
  update public.maintenance_work_orders set provider_email = v_email, emailed_at = v_at, emailed_to = v_email where id = p_id;
  return v_at;
end;
$$;
revoke all on function public.send_work_order(uuid, text) from public, anon;
grant execute on function public.send_work_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- (2) Timesheets: approved by the fleet manager, then the HOD.
-- ---------------------------------------------------------------------------
alter table public.timesheets
  add column if not exists approval_step text,
  add column if not exists submitted_at timestamptz;
alter table public.timesheets alter column status set default 'draft';
-- Timesheets recorded so far stand as approved.
update public.timesheets set status = 'approved', approved_at = coalesce(approved_at, updated_at, created_at) where status = 'completed';
update public.table_resources set is_request = true where table_name = 'timesheets';

-- The coordinator is the person who records the timesheet.
create or replace function public.timesheets_recorder()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.coordinator_name), '') = '' and auth.uid() is not null then
    select full_name into new.coordinator_name from public.profiles where id = auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists timesheets_recorder on public.timesheets;
create trigger timesheets_recorder before insert on public.timesheets for each row execute function public.timesheets_recorder();

drop trigger if exists timesheets_status on public.timesheets;
create trigger timesheets_status before insert or update on public.timesheets
  for each row execute function public.request_status_guard('expenses.timesheet', '/expenses/timesheet');
drop trigger if exists timesheets_reset_step on public.timesheets;
create trigger timesheets_reset_step before insert or update of status on public.timesheets
  for each row execute function public.staged_reset_step();
drop trigger if exists timesheets_submitted_at on public.timesheets;
create trigger timesheets_submitted_at before insert or update of status on public.timesheets
  for each row execute function public.set_submitted_at();
drop trigger if exists timesheets_workflow on public.timesheets;
create trigger timesheets_workflow after insert or update of status on public.timesheets
  for each row execute function public.requests_workflow_after();

-- ---------------------------------------------------------------------------
-- Approval steps
-- ---------------------------------------------------------------------------
alter table public.approval_links drop constraint if exists approval_links_table_name_check;
alter table public.approval_links add constraint approval_links_table_name_check check (table_name in ('leave_requests', 'vehicle_requests', 'outstation_requests', 'petty_cash_requests', 'petty_cash_transactions', 'timesheets', 'maintenance_invoices'));

create or replace function public.is_staged(p_table text)
returns boolean language sql immutable as $$
  select p_table in ('leave_requests', 'outstation_requests', 'petty_cash_requests', 'petty_cash_transactions', 'timesheets', 'maintenance_invoices');
$$;

create or replace function public.staged_steps(p_table text)
returns table (step text, resource text, ord integer) language sql immutable as $$
  select s.step, s.resource, s.ord from (values
    ('leave_requests', 'approval', 'expenses.leave.requests', 1),
    ('leave_requests', 'hr_review', 'expenses.leave.requests.hr', 2),
    ('leave_requests', 'hod_approval', 'expenses.leave.requests.hod', 3),
    ('outstation_requests', 'approval', 'expenses.admin.outstation', 1),
    ('outstation_requests', 'hod_verify', 'expenses.admin.outstation.hod', 2),
    ('petty_cash_requests', 'approval', 'expenses.admin.petty_cash', 1),
    ('petty_cash_requests', 'hod_approval', 'expenses.admin.petty_cash.hod', 2),
    ('petty_cash_transactions', 'approval', 'expenses.admin.petty_cash', 1),
    ('petty_cash_transactions', 'hod_verify', 'expenses.admin.petty_cash.hod', 2),
    ('timesheets', 'approval', 'expenses.timesheet', 1),
    ('timesheets', 'hod_approval', 'expenses.timesheet.hod', 2),
    ('maintenance_invoices', 'approval', 'expenses.maintenance.costs', 1),
    ('maintenance_invoices', 'hod_approval', 'expenses.maintenance.costs.hod', 2)
  ) s(tbl, step, resource, ord)
  where s.tbl = p_table;
$$;

create or replace function public.workflow_request_resource(p_table text)
returns text language sql immutable as $$
  select case p_table
    when 'leave_requests' then 'expenses.leave.requests'
    when 'vehicle_requests' then 'daily_use.trip_requests'
    when 'outstation_requests' then 'expenses.admin.outstation'
    when 'petty_cash_requests' then 'expenses.admin.petty_cash'
    when 'petty_cash_transactions' then 'expenses.admin.petty_cash'
    when 'timesheets' then 'expenses.timesheet'
    when 'maintenance_invoices' then 'expenses.maintenance.costs' end;
$$;

create or replace function public.workflow_request_label(p_table text)
returns text language sql immutable as $$
  select case p_table when 'leave_requests' then 'leave request' when 'vehicle_requests' then 'vehicle request' when 'outstation_requests' then 'outstation allowance'
    when 'petty_cash_requests' then 'petty cash request' when 'petty_cash_transactions' then 'petty cash transaction'
    when 'timesheets' then 'timesheet' when 'maintenance_invoices' then 'maintenance invoice' else 'request' end;
$$;

-- The person sending a request holds its first approval (with all or department scope).
create or replace function public.staged_sender_approves(p_table text, p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_step text;
  v_company uuid;
  v_scope text;
begin
  if auth.uid() is null or not public.is_staged(p_table) then return false; end if;
  execute format('select coalesce(approval_step, ''approval''), company_id from public.%I where id = $1 and status = ''submitted'' and deleted_at is null', p_table)
    into v_step, v_company using p_id;
  if v_step is distinct from 'approval' or v_company is distinct from public.my_company_id() then return false; end if;
  v_scope := public.permission_scope_for(auth.uid(), (select s.resource from public.staged_steps(p_table) s where s.step = 'approval'), 'approve')::text;
  return v_scope in ('all', 'department');
end;
$$;

create or replace function public.workflow_request_summary(p_table text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v jsonb;
begin
  if p_table = 'leave_requests' then
    select l.*, coalesce(nullif(e.full_name, ''), d.full_name, c.full_name) as who, cat.name as category
      into r
    from public.leave_requests l
    left join public.profiles e on e.id = l.employee_id
    left join public.drivers d on d.id = l.driver_id
    left join public.profiles c on c.id = l.created_by
    left join public.leave_categories cat on cat.id = l.category_id
    where l.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', null,
      'summary', coalesce(r.category, 'Leave') || ', ' || to_char(r.date_from, 'DD Mon YYYY') || ' to ' || to_char(r.date_to, 'DD Mon YYYY'),
      'path', '/expenses/leave/requests/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Employee', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Leave type', 'value', coalesce(r.category, '')),
        jsonb_build_object('label', 'From', 'value', to_char(r.date_from, 'DD Mon YYYY')),
        jsonb_build_object('label', 'To', 'value', to_char(r.date_to, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Days', 'value', r.total_days::text)
      ) || case when coalesce(r.reason, '') <> '' then jsonb_build_array(jsonb_build_object('label', 'Reason', 'value', r.reason)) else '[]'::jsonb end);
  elsif p_table = 'vehicle_requests' then
    select q.*, coalesce(nullif(q.requester_name, ''), c.full_name) as who, coalesce(nullif(q.requester_phone, ''), c.phone) as who_phone
      into r
    from public.vehicle_requests q
    left join public.profiles c on c.id = q.created_by
    where q.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', initcap(r.trip_type) || ' trip to ' || coalesce(r.destination, '') || ' on ' || to_char(r.date_needed, 'DD Mon YYYY'),
      'path', '/daily-use/trip-requests/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Requested by', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Trip', 'value', case r.trip_type when 'long' then 'Long trip' else 'Short trip' end),
        jsonb_build_object('label', 'Date', 'value', to_char(r.date_needed, 'DD Mon YYYY') || coalesce(' to ' || to_char(r.date_to, 'DD Mon YYYY'), '')),
        jsonb_build_object('label', 'Time', 'value', coalesce(to_char(r.time_from, 'HH24:MI'), '') || coalesce(' to ' || to_char(r.time_to, 'HH24:MI'), '')),
        jsonb_build_object('label', 'Destination', 'value', coalesce(r.destination, '')),
        jsonb_build_object('label', 'Purpose', 'value', coalesce(r.purpose, '')),
        jsonb_build_object('label', 'People', 'value', coalesce(r.occupants::text, ''))
      ));
  elsif p_table = 'outstation_requests' then
    select o.*, d.full_name as driver_name, d.phone as driver_phone, c.full_name as who, c.phone as who_phone, v.registration
      into r
    from public.outstation_requests o
    left join public.drivers d on d.id = o.driver_id
    left join public.profiles c on c.id = o.created_by
    left join public.vehicles v on v.id = o.vehicle_id
    where o.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Outstation allowance for ' || coalesce(r.driver_name, 'a driver') || ', ' || coalesce(r.location, '') || ', ' || to_char(r.date_from, 'DD Mon YYYY') || ' to ' || to_char(r.date_to, 'DD Mon YYYY'),
      'path', '/administration/outstation/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Driver', 'value', coalesce(r.driver_name, '')),
        jsonb_build_object('label', 'Vehicle', 'value', coalesce(r.registration, '')),
        jsonb_build_object('label', 'Location', 'value', coalesce(r.location, '')),
        jsonb_build_object('label', 'From', 'value', to_char(r.date_from, 'DD Mon YYYY')),
        jsonb_build_object('label', 'To', 'value', to_char(r.date_to, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Days', 'value', coalesce(r.total_days::text, '')),
        jsonb_build_object('label', 'Allowance', 'value', 'TZS ' || to_char(coalesce(r.allowance_tzs, 0), 'FM999,999,999,990')),
        jsonb_build_object('label', 'Other expenses', 'value', 'TZS ' || to_char(coalesce(r.other_total_tzs, 0), 'FM999,999,999,990')),
        jsonb_build_object('label', 'Total cost', 'value', 'TZS ' || to_char(coalesce(r.total_cost_tzs, 0), 'FM999,999,999,990'))
      ));
  elsif p_table = 'petty_cash_requests' then
    select q.*, coalesce(nullif(q.requester_name, ''), c.full_name) as who, c.phone as who_phone
      into r
    from public.petty_cash_requests q
    left join public.profiles c on c.id = q.created_by
    where q.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Petty cash of TZS ' || to_char(coalesce(r.amount_approved_tzs, r.amount_requested_tzs), 'FM999,999,999,990') || coalesce(' for ' || nullif(r.purpose, ''), ''),
      'path', '/administration/petty-cash/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Requested by', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Position', 'value', coalesce(r.position, '')),
        jsonb_build_object('label', 'Date', 'value', to_char(r.request_date, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Purpose', 'value', coalesce(r.purpose, '')),
        jsonb_build_object('label', 'Amount requested', 'value', 'TZS ' || to_char(r.amount_requested_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Amount approved', 'value', case when r.amount_approved_tzs is null then '' else 'TZS ' || to_char(r.amount_approved_tzs, 'FM999,999,999,990') end)
      ));
  elsif p_table = 'petty_cash_transactions' then
    select x.*, q.requester_name, q.purpose as request_purpose, c.full_name as who, c.phone as who_phone
      into r
    from public.petty_cash_transactions x
    join public.petty_cash_requests q on q.id = x.petty_cash_request_id
    left join public.profiles c on c.id = x.created_by
    where x.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, r.requester_name, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', coalesce(r.description, '') || ', TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990') || ' on ' || to_char(r.txn_date, 'DD Mon YYYY'),
      'path', '/administration/petty-cash/transactions/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Spent by', 'value', coalesce(r.who, r.requester_name, '')),
        jsonb_build_object('label', 'Date', 'value', to_char(r.txn_date, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Description', 'value', coalesce(r.description, '')),
        jsonb_build_object('label', 'Quantity', 'value', trim(to_char(r.quantity, 'FM999,999,990.##')) || coalesce(' ' || nullif(r.unit, ''), '')),
        jsonb_build_object('label', 'Amount', 'value', 'TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Petty cash for', 'value', coalesce(r.request_purpose, ''))
      ));
  elsif p_table = 'timesheets' then
    select ts.*, c.full_name as who, c.phone as who_phone,
      (select coalesce(sum(d.total_hours), 0) from public.timesheet_days d where d.timesheet_id = ts.id and d.deleted_at is null) as hours,
      (select coalesce(sum(d.overtime_hours), 0) from public.timesheet_days d where d.timesheet_id = ts.id and d.deleted_at is null) as ot,
      (select coalesce(sum(d.special_overtime_hours), 0) from public.timesheet_days d where d.timesheet_id = ts.id and d.deleted_at is null) as sot
      into r
    from public.timesheets ts
    left join public.profiles c on c.id = ts.created_by
    where ts.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Timesheet of ' || coalesce(r.employee_name, '') || ' for ' || to_char(r.period_month, 'FMMonth YYYY'),
      'path', '/expenses/timesheet/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Employee', 'value', coalesce(r.employee_name, '')),
        jsonb_build_object('label', 'Employee no', 'value', coalesce(r.employment_number, '')),
        jsonb_build_object('label', 'Position', 'value', coalesce(r.job_title, '')),
        jsonb_build_object('label', 'Month', 'value', to_char(r.period_month, 'FMMonth YYYY')),
        jsonb_build_object('label', 'Hours worked', 'value', trim(to_char(r.hours, 'FM999,990.##'))),
        jsonb_build_object('label', 'Overtime', 'value', trim(to_char(r.ot, 'FM999,990.##')) || ' h'),
        jsonb_build_object('label', 'Special overtime', 'value', trim(to_char(r.sot, 'FM999,990.##')) || ' h'),
        jsonb_build_object('label', 'Recorded by', 'value', coalesce(nullif(r.coordinator_name, ''), r.who, ''))
      ));
  elsif p_table = 'maintenance_invoices' then
    select i.*, c.full_name as who, c.phone as who_phone, ve.registration, trim(coalesce(ve.make, '') || ' ' || coalesce(ve.model, '')) as make_model
      into r
    from public.maintenance_invoices i
    left join public.profiles c on c.id = i.created_by
    left join public.vehicles ve on ve.id = i.vehicle_id
    where i.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Invoice ' || coalesce(r.invoice_number, '') || ' from ' || coalesce(r.service_provider, '') || ', ' || coalesce(r.registration, '') || ', TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990'),
      'path', '/expenses/maintenance/costs/invoices/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Invoice', 'value', coalesce(r.invoice_number, '')),
        jsonb_build_object('label', 'Date', 'value', to_char(r.invoice_date, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Vehicle', 'value', coalesce(r.registration, '') || coalesce(' (' || nullif(r.make_model, '') || ')', '')),
        jsonb_build_object('label', 'Service provider', 'value', coalesce(r.service_provider, '')),
        jsonb_build_object('label', 'Labour charge', 'value', 'TZS ' || to_char(r.labour_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Spare parts', 'value', 'TZS ' || to_char(r.parts_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Amount', 'value', 'TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990'))
      ));
  else
    return null;
  end if;
  return v;
end;
$$;

create or replace function public.requests_workflow_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.status::text end;
  v_new text := new.status::text;
  v_step text;
  v_pending integer;
  v_has_jmp boolean := false;
begin
  if v_old is not distinct from v_new then return null; end if;
  perform set_config('fms.workflow_record', new.id::text, true);

  if v_new = 'submitted' then
    perform public.workflow_event(tg_table_name, new.id, new.company_id, 'approval', case when v_old = 'rejected' or v_old = 'draft' and exists (select 1 from public.approval_events e where e.table_name = tg_table_name and e.record_id = new.id and e.action = 'rejected') then 'resubmitted' else 'submitted' end);
    if public.staged_sender_approves(tg_table_name, new.id) then
      perform public.staged_advance(tg_table_name, new.id, null, '{}'::jsonb);
    else
      perform public.workflow_notify_step(tg_table_name, new.id);
    end if;

  elsif v_new = 'approved' then
    if tg_table_name = 'vehicle_requests' then
      v_has_jmp := exists (select 1 from public.jmp_reviews where vehicle_request_id = new.id);
    end if;
    if v_old = 'submitted' then
      perform public.workflow_event(tg_table_name, new.id, new.company_id, coalesce(to_jsonb(new) ->> 'approval_step', 'approval'), 'approved');
      -- Outstation allowance and petty cash: approved by the HOD, they go to finance by email.
      if tg_table_name in ('outstation_requests', 'petty_cash_requests') then
        perform public.finance_notify(tg_table_name, new.id);
      end if;
    else
      -- Sent again after a JMP rejection: back at the JMP step.
      select step into v_step from public.jmp_reviews where vehicle_request_id = new.id and decision is null order by step_order limit 1;
      perform public.workflow_event(tg_table_name, new.id, new.company_id, coalesce(v_step, 'approval'), 'resubmitted');
    end if;
    if tg_table_name = 'vehicle_requests' and ((to_jsonb(new) ->> 'trip_type') = 'long' or v_has_jmp) then
      -- JMP steps are created right after the approval; the jmp_reviews trigger sends the first one.
      if v_has_jmp then
        select count(*) into v_pending from public.jmp_reviews where vehicle_request_id = new.id and decision is distinct from 'approved';
        if v_pending > 0 then
          perform public.workflow_notify_step(tg_table_name, new.id);
        else
          perform public.workflow_notify_requester(tg_table_name, new.id, 'approved', auth.uid());
        end if;
      end if;
    else
      perform public.workflow_notify_step(tg_table_name, new.id);
      perform public.workflow_notify_requester(tg_table_name, new.id, 'approved', auth.uid());
    end if;

  elsif v_new = 'rejected' then
    v_step := coalesce(to_jsonb(old) ->> 'approval_step', 'approval');
    if tg_table_name = 'vehicle_requests' then
      select step into v_step from public.jmp_reviews where vehicle_request_id = new.id and decision = 'rejected' order by step_order limit 1;
      v_step := coalesce(v_step, 'approval');
    end if;
    perform public.workflow_event(tg_table_name, new.id, new.company_id, v_step, 'rejected', new.rejection_reason);
    perform public.workflow_notify_step(tg_table_name, new.id);
    perform public.workflow_notify_requester(tg_table_name, new.id, 'rejected', auth.uid(), new.rejection_reason, v_step);
  else
    perform public.workflow_notify_step(tg_table_name, new.id);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- (4) Who a timesheet (or leave record) belongs to. Only a record made for nobody in particular
--     is the signed-in person's own; a coordinator recording an employee's timesheet (with or
--     without a user account) no longer makes it the coordinator's, on saving or on any later change.
-- ---------------------------------------------------------------------------
create or replace function public.default_employee_id()
returns trigger language plpgsql as $$
begin
  if new.employee_id is null and new.driver_id is null and coalesce(to_jsonb(new) ->> 'employee_name', '') = '' then
    new.employee_id := auth.uid();
  end if;
  if new.driver_id is null and new.employee_id is not null and new.employee_id = auth.uid() then
    new.driver_id := public.my_driver_id();
  end if;
  return new;
end;
$$;

create or replace function public.fill_employee_details()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  d public.drivers;
  j jsonb;
begin
  if tg_op = 'UPDATE' and new.employee_id is not distinct from old.employee_id and new.employee_name is not null then
    return new;
  end if;
  if new.employee_id is null then
    return new;
  end if;
  select * into p from public.profiles where id = new.employee_id;
  if p.id is null then
    return new;
  end if;
  if p.driver_id is not null then
    select * into d from public.drivers where id = p.driver_id;
  end if;
  j := jsonb_build_object(
    'employee_name', coalesce(nullif(p.full_name, ''), d.full_name),
    'employment_number', coalesce(p.employment_number, d.employment_number),
    'employer', coalesce(p.employer, d.employer, (select name from public.companies where id = p.company_id)),
    'job_title', coalesce(p.job_title, d.job_title),
    'position', coalesce(p.job_title, d.job_title),
    'department', coalesce(p.department, d.department),
    'driver_id', coalesce(p.driver_id, new.driver_id));
  -- Only set columns this table has.
  new := jsonb_populate_record(new, (select jsonb_object_agg(k, v) from jsonb_each(j) e(k, v) where to_jsonb(new) ? k));
  return new;
end;
$$;
