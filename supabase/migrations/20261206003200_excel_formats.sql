-- 32: Timesheet, Outstation allowance and Petty cash follow the company's Excel formats, and a new
-- first-level section, Travel coordination (local departures and arrivals with pickup rules).

-- ---------------------------------------------------------------------------
-- Timesheet (Excel "Timesheet": daily system sheet + monthly summary + three signatures)
-- ---------------------------------------------------------------------------
alter table public.timesheet_days
  add column if not exists shift text not null default 'day',
  add column if not exists break_from time,
  add column if not exists break_to time,
  add column if not exists total_hours numeric(5,2) not null default 0,
  add column if not exists special_overtime_hours numeric(5,2) not null default 0;
alter table public.timesheet_days drop constraint if exists timesheet_days_shift_check;
alter table public.timesheet_days add constraint timesheet_days_shift_check check (shift in ('day', 'night'));
alter table public.timesheet_days drop constraint if exists timesheet_days_day_type_check;
alter table public.timesheet_days add constraint timesheet_days_day_type_check check (day_type in ('work', 'rest', 'leave', 'public_holiday', 'sick'));

alter table public.timesheets
  add column if not exists employee_signature jsonb,
  add column if not exists coordinator_name text,
  add column if not exists coordinator_signature jsonb;

-- Total working hours = time out - time in - break (overnight shifts wrap past midnight).
-- Work day: up to 8 h normal, the rest normal overtime. Public holiday: all hours are special overtime.
create or replace function public.timesheet_days_hours()
returns trigger language plpgsql as $$
declare
  v_hours numeric := 0;
  v_break numeric := 0;
begin
  if new.time_in is not null and new.time_out is not null then
    v_hours := extract(epoch from (new.time_out - new.time_in)) / 3600.0;
    if v_hours < 0 then v_hours := v_hours + 24; end if;
    if new.break_from is not null and new.break_to is not null then
      v_break := extract(epoch from (new.break_to - new.break_from)) / 3600.0;
      if v_break < 0 then v_break := v_break + 24; end if;
    end if;
    new.total_hours := round(greatest(v_hours - v_break, 0), 2);
  else
    new.total_hours := 0;
  end if;
  if new.day_type = 'public_holiday' then
    new.normal_hours := 0;
    if coalesce(new.special_overtime_hours, 0) = 0 then new.special_overtime_hours := new.total_hours; end if;
  elsif new.day_type = 'work' then
    new.normal_hours := least(new.total_hours, 8);
    if coalesce(new.overtime_hours, 0) = 0 then new.overtime_hours := greatest(new.total_hours - 8, 0); end if;
  else
    new.normal_hours := 0;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outstation allowance (Excel "Outstation Allowance"): allowance (days x DSA) + other expenses,
-- requested by the fleet manager, reviewed and approved by finance or the project director.
-- ---------------------------------------------------------------------------
create table public.outstation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  date_from date not null,
  date_to date not null,
  return_date date,
  description text,
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  location text not null,
  total_days integer not null default 1 check (total_days >= 0),
  dsa_tzs numeric(14,2) not null default 0 check (dsa_tzs >= 0),
  allowance_tzs numeric(14,2) generated always as (round(total_days * dsa_tzs, 2)) stored,
  other_total_tzs numeric(14,2) not null default 0,          -- trigger maintained
  total_cost_tzs numeric(14,2) not null default 0,           -- trigger maintained
  confirmation jsonb,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  check (date_to >= date_from)
);

create table public.outstation_expense_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  outstation_request_id uuid not null references public.outstation_requests(id) on delete cascade,
  seq integer,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit text,
  unit_price_tzs numeric(14,2) not null default 0 check (unit_price_tzs >= 0),
  amount_tzs numeric(14,2) generated always as (round(quantity * unit_price_tzs, 2)) stored
);

-- ---------------------------------------------------------------------------
-- Petty cash (Excel "Petty Cash Reconcilliation"): a request is approved first; then the
-- transactions are recorded against it and verified (fleet manager or client representative).
-- ---------------------------------------------------------------------------
create table public.petty_cash_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  request_date date not null default current_date,
  requester_id uuid references public.profiles(id),
  requester_name text,
  position text,
  phone text,
  purpose text,
  amount_requested_tzs numeric(14,2) not null check (amount_requested_tzs > 0),
  amount_received_tzs numeric(14,2) not null default 0 check (amount_received_tzs >= 0),
  amount_spent_tzs numeric(14,2) not null default 0,         -- trigger maintained
  balance_tzs numeric(14,2) generated always as (amount_received_tzs - amount_spent_tzs) stored,
  confirmation jsonb,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb
);

create table public.petty_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  petty_cash_request_id uuid not null references public.petty_cash_requests(id) on delete cascade,
  seq integer,
  txn_date date not null default current_date,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit text,
  price_tzs numeric(14,2) not null default 0 check (price_tzs >= 0),
  amount_tzs numeric(14,2) generated always as (round(quantity * price_tzs, 2)) stored,
  receipt_number text,
  verification text not null default 'not_verified' check (verification in ('verified', 'not_verified')),
  verified_by text
);

-- ---------------------------------------------------------------------------
-- Travel coordination (Excel "Travel Coordination - Arrival & Departures")
-- ---------------------------------------------------------------------------
create table public.travel_airports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  pickup_lead_hours numeric(4,1) not null default 3 check (pickup_lead_hours >= 0),  -- departures: pick up this long before the flight
  host_person text
);

create table public.travel_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  direction text not null check (direction in ('departure', 'arrival')),
  travel_date date not null,
  travellers text not null,
  airport text,
  flight text,
  flight_time time,
  pickup_from text,
  pickup_time time,
  transport_to text,
  host text,
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  notes text
);

-- Standard columns, audit, grants, row security for the new tables.
do $$
declare
  t text;
begin
  foreach t in array array['outstation_requests', 'outstation_expense_items', 'petty_cash_requests', 'petty_cash_transactions', 'travel_airports', 'travel_movements'] loop
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

insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.travel', null, 'Travel coordination', '8', null, 'map-pin', 560, false, false),
  ('expenses.travel.departures', 'expenses.travel', 'Local departures', null, '/travel/departures', null, 561, false, false),
  ('expenses.travel.arrivals', 'expenses.travel', 'Local arrivals', null, '/travel/arrivals', null, 562, false, false),
  ('expenses.travel.settings', 'expenses.travel', 'Pickup settings', null, '/travel/settings', null, 563, false, false)
on conflict (key) do update set parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, icon = excluded.icon, sort_order = excluded.sort_order;
update public.resources set is_request = true where key in ('expenses.admin.outstation', 'expenses.admin.petty_cash');

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('outstation_requests', 'expenses.admin.outstation', null, null, true),
  ('outstation_expense_items', 'expenses.admin.outstation', 'outstation_requests', 'outstation_request_id', false),
  ('petty_cash_requests', 'expenses.admin.petty_cash', null, null, true),
  ('petty_cash_transactions', 'expenses.admin.petty_cash', 'petty_cash_requests', 'petty_cash_request_id', false),
  ('travel_airports', 'expenses.travel', null, null, false),
  ('travel_movements', 'expenses.travel', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;

select public.apply_standard_rls('outstation_requests', 'expenses.admin.outstation');
select public.apply_child_rls('outstation_expense_items', 'expenses.admin.outstation', 'outstation_requests', 'outstation_request_id');
select public.apply_standard_rls('petty_cash_requests', 'expenses.admin.petty_cash');
select public.apply_child_rls('petty_cash_transactions', 'expenses.admin.petty_cash', 'petty_cash_requests', 'petty_cash_request_id');
select public.apply_standard_rls('travel_airports', 'expenses.travel');
select public.apply_standard_rls('travel_movements', 'expenses.travel');

create trigger outstation_requests_status before insert or update on public.outstation_requests
  for each row execute function public.request_status_guard('expenses.admin.outstation', '/administration/outstation');
create trigger petty_cash_requests_status before insert or update on public.petty_cash_requests
  for each row execute function public.request_status_guard('expenses.admin.petty_cash', '/administration/petty-cash');

-- Totals kept in step with the rows.
create or replace function public.outstation_items_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.outstation_request_id, old.outstation_request_id);
begin
  update public.outstation_requests r set
    other_total_tzs = coalesce((select sum(amount_tzs) from public.outstation_expense_items i where i.outstation_request_id = r.id and i.deleted_at is null), 0)
  where r.id = v_id;
  return null;
end;
$$;
create trigger outstation_items_total after insert or update or delete on public.outstation_expense_items
  for each row execute function public.outstation_items_total();

create or replace function public.outstation_requests_total()
returns trigger language plpgsql as $$
begin
  new.total_cost_tzs := round(coalesce(new.total_days, 0) * coalesce(new.dsa_tzs, 0), 2) + coalesce(new.other_total_tzs, 0);
  return new;
end;
$$;
create trigger outstation_requests_total before insert or update on public.outstation_requests
  for each row execute function public.outstation_requests_total();

create or replace function public.petty_cash_spent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.petty_cash_request_id, old.petty_cash_request_id);
begin
  update public.petty_cash_requests r set
    amount_spent_tzs = coalesce((select sum(amount_tzs) from public.petty_cash_transactions x where x.petty_cash_request_id = r.id and x.deleted_at is null), 0)
  where r.id = v_id;
  return null;
end;
$$;
create trigger petty_cash_spent after insert or update or delete on public.petty_cash_transactions
  for each row execute function public.petty_cash_spent();

-- Requester details from the person's profile when not typed.
create or replace function public.petty_cash_requester()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  new.requester_id := coalesce(new.requester_id, auth.uid());
  select * into p from public.profiles where id = new.requester_id;
  new.requester_name := coalesce(nullif(trim(new.requester_name), ''), p.full_name);
  new.position := coalesce(nullif(trim(new.position), ''), p.job_title);
  new.phone := coalesce(nullif(trim(new.phone), ''), p.phone);
  return new;
end;
$$;
create trigger petty_cash_requests_requester before insert on public.petty_cash_requests
  for each row execute function public.petty_cash_requester();

-- Earlier entries keep showing: copy them into the new tables (approved, as they were already paid).
insert into public.outstation_requests (company_id, date_from, date_to, return_date, description, driver_id, vehicle_id, location, total_days, dsa_tzs, status, created_at, created_by)
select o.company_id, o.date_from, o.date_to, o.paid_on, o.purpose, o.driver_id, o.vehicle_id, o.destination, greatest(o.date_to - o.date_from, 0), o.rate_per_night_tzs, 'draft', o.created_at, o.created_by
from public.outstation_allowances o where o.deleted_at is null;

insert into public.petty_cash_requests (company_id, request_date, requester_id, requester_name, purpose, amount_requested_tzs, amount_received_tzs, status, created_at, created_by)
select e.company_id, e.entry_date, e.created_by, null, e.description, e.amount_tzs, e.amount_tzs, 'draft', e.created_at, e.created_by
from public.petty_cash_entries e where e.deleted_at is null and e.kind = 'received' and e.amount_tzs > 0;

-- Default pickup rules from the Excel settings, for every company.
insert into public.travel_airports (company_id, name, pickup_lead_hours, host_person)
select c.id, a.name, a.hours, null
from public.companies c
cross join (values ('JKNIA', 3.5), ('Mwanza Airport', 3.0), ('Arusha Airport', 3.0), ('Kahama Airport', 3.0), ('Other terminal', 3.0)) as a(name, hours);

-- New companies get the same default pickup rules.
create or replace function public.companies_default_airports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.travel_airports (company_id, name, pickup_lead_hours)
  select new.id, a.name, a.hours
  from (values ('JKNIA', 3.5), ('Mwanza Airport', 3.0), ('Arusha Airport', 3.0), ('Kahama Airport', 3.0), ('Other terminal', 3.0)) as a(name, hours);
  return null;
end;
$$;
drop trigger if exists companies_default_airports on public.companies;
create trigger companies_default_airports after insert on public.companies
  for each row execute function public.companies_default_airports();
