-- MDV Fleet Management System
-- Migration 2: data tables for modules 1 to 5 and the shared tables.
-- Every table gets id, company_id, created_at, created_by, updated_at, updated_by, deleted_at.
-- Calculated values are generated columns or trigger-maintained, never browser-only.

-- ---------------------------------------------------------------------------
-- Module 1. Fleet database
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  make text not null,
  model text not null,
  registration text not null,
  chassis_number text,
  engine_number text,
  yom integer check (yom between 1950 and 2100),
  year_first_use integer check (year_first_use between 1950 and 2100),
  site_id uuid references public.sites(id),
  location text,
  odometer_km numeric(12,1) not null default 0,
  fuel_tank_capacity_l numeric(8,1),
  target_km_per_l numeric(6,2),
  owner_name text,
  status text not null default 'in_service' check (status in ('in_service', 'in_garage', 'out_of_service')),
  unique (company_id, registration)
);

create table public.vehicle_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  kind text not null check (kind in ('internal', 'third_party')),
  inspection_date date,
  renewal_date date,              -- Reminder
  report_attachment_id uuid,
  notes text
);

create table public.vehicle_insurance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  insurer text,
  policy_number text,
  start_date date,
  end_date date,                  -- Reminder
  premium_tzs numeric(14,2)
);

create table public.service_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  last_service_km numeric(12,1),
  last_service_date date,
  next_service_km numeric(12,1),  -- Reminder (fires from vehicles.odometer_km)
  interval_km numeric(10,1) default 5000,
  notes text
);

create table public.vehicle_remarks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  body text not null
);

-- ---------------------------------------------------------------------------
-- Module 2. Driver details
-- ---------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid references public.profiles(id),
  full_name text not null,
  phone text,
  phone_alt text,
  email text,
  employer text,
  joining_date date,
  employment_number text,
  job_title text default 'Driver',
  department text,
  date_of_birth date,
  sex public.sex,
  years_driving integer,
  is_active boolean not null default true
);
alter table public.profiles add constraint profiles_driver_fk foreign key (driver_id) references public.drivers(id) on delete set null;

create table public.driver_courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  courses text[] not null default '{}',   -- advanced_vip2, senior_vip1, hgv, psv, other
  course_other text,
  provider text check (provider in ('nit', 'veta', 'other')),
  provider_other text,
  date_completed date,
  certificate_attachment_id uuid
);

create table public.driver_licences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  licence_number text,
  licence_class text,
  date_issued date,
  expiry_date date,               -- Reminder
  licence_attachment_id uuid
);

create table public.driver_osha (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  date_conducted date,
  redo_date date,                 -- Reminder
  result text,
  report_attachment_id uuid
);

-- ---------------------------------------------------------------------------
-- Module 3. Inspections
-- ---------------------------------------------------------------------------
create table public.daily_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  inspection_date date not null default current_date,
  mileage_km numeric(12,1),
  remark text not null default 'safe' check (remark in ('safe', 'anomalies')),
  notes text
);

create table public.third_party_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  inspection_date date not null default current_date,
  mileage_km numeric(12,1),
  remark text not null default 'safe' check (remark in ('safe', 'anomalies')),
  inspector text,
  renewal_date date,              -- Reminder
  notes text
);

create table public.inspection_anomalies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  daily_inspection_id uuid references public.daily_inspections(id) on delete cascade,
  third_party_inspection_id uuid references public.third_party_inspections(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid references public.drivers(id),
  description text not null,
  action_required text,
  when_to_act public.anomaly_timing not null default 'before_next_service',
  status public.anomaly_status not null default 'open',
  date_opened date not null default current_date,
  date_closed date,
  closed_by uuid,
  check ((daily_inspection_id is not null)::int + (third_party_inspection_id is not null)::int = 1),
  check (status <> 'closed' or date_closed is not null)
);

create table public.first_aid_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  inspected_on date not null default current_date,
  inspector_name text not null,
  inspector_qualification text,
  signature jsonb,
  next_inspection_date date,
  notes text
);

create table public.first_aid_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  inspection_id uuid not null references public.first_aid_inspections(id) on delete cascade,
  item_name text not null,
  present boolean not null default false,
  quantity integer,
  expiry_date date,
  remark text
);

-- ---------------------------------------------------------------------------
-- Module 4. Vehicle daily use
-- ---------------------------------------------------------------------------
create table public.km_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid references public.drivers(id),
  log_date date not null default current_date,
  passenger_signature jsonb,
  total_km numeric(12,1) not null default 0,       -- trigger maintained
  trip_count integer not null default 0,           -- trigger maintained
  unique (vehicle_id, log_date)
);

create table public.km_log_trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  km_log_id uuid not null references public.km_logs(id) on delete cascade,
  seq integer not null default 1,
  departing_location text not null,
  departure_time time,
  km_start numeric(12,1) not null,
  km_end numeric(12,1) not null,
  destination text not null,
  arrival_time time,
  trip_km numeric(12,1) generated always as (km_end - km_start) stored,
  check (km_end >= km_start)
);

create table public.fuel_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  request_date date not null default current_date,
  previous_odometer numeric(12,1),
  current_odometer numeric(12,1),
  fuel_filled_l numeric(8,2),          -- last fill as declared by the driver
  fuel_required_l numeric(8,2),        -- amount requested
  approved_l numeric(8,2),             -- what the manager approved (shown to the driver)
  confirmation jsonb,                  -- signature / tick with name and timestamp
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  check (current_odometer is null or previous_odometer is null or current_odometer >= previous_odometer)
);

create table public.fuel_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  fuel_request_id uuid references public.fuel_requests(id),
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid references public.drivers(id),
  issue_date date not null default current_date,
  previous_filled_l numeric(8,2),
  balance_l numeric(8,2),
  previous_odometer numeric(12,1),
  current_odometer numeric(12,1),
  fuel_filled_l numeric(8,2),
  fuel_issued_l numeric(8,2) not null,
  price_per_litre numeric(10,2) not null default 0,
  km_run numeric(12,1) generated always as (coalesce(current_odometer, 0) - coalesce(previous_odometer, 0)) stored,
  consumption_km_per_l numeric(8,2) generated always as (
    case when coalesce(fuel_issued_l, 0) > 0
      then round((coalesce(current_odometer, 0) - coalesce(previous_odometer, 0)) / fuel_issued_l, 2) end) stored,
  total_cost_tzs numeric(14,2) generated always as (round(fuel_issued_l * price_per_litre, 2)) stored
);

create table public.vehicle_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  requester_id uuid references public.profiles(id),
  requester_name text,
  requester_phone text,
  requested_at timestamptz not null default now(),
  trip_type text not null default 'short' check (trip_type in ('short', 'long')),
  date_needed date not null,
  date_to date,                                    -- long trips
  time_from time,
  time_to time,
  purpose_type text check (purpose_type in ('official', 'personal')),
  purpose text,
  departure_time time,
  duration_hours numeric(6,1),
  occupants integer,
  destination text,
  confirmation jsonb,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  check (trip_type = 'short' or date_to is not null)
);

create table public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_request_id uuid not null references public.vehicle_requests(id) on delete cascade,
  driver_id uuid references public.drivers(id),
  vehicle_id uuid references public.vehicles(id),
  approver_name text,
  approver_signature jsonb,
  jmp_attachment_id uuid,
  assigned_at timestamptz not null default now()
);

create table public.jmp_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_request_id uuid not null references public.vehicle_requests(id) on delete cascade,
  step text not null check (step in ('hse_manager', 'control_room', 'emergency_commander')),
  step_order integer not null default 1,
  required_resource text not null,                 -- daily_use.trip_requests.jmp_hse etc.
  reviewer_id uuid,
  signature jsonb,
  signed_at timestamptz,
  decision text check (decision in ('approved', 'rejected')),
  rejection_reason text,
  unique (vehicle_request_id, step),
  check (decision is distinct from 'rejected' or rejection_reason is not null)
);

-- ---------------------------------------------------------------------------
-- Module 5. Fleet expenses and administration
-- ---------------------------------------------------------------------------
create table public.fuel_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  fuel_issue_id uuid references public.fuel_issues(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id),
  expense_date date not null default current_date,
  km_start numeric(12,1),
  km_end numeric(12,1),
  km_run numeric(12,1) generated always as (coalesce(km_end, 0) - coalesce(km_start, 0)) stored,
  target_km_per_l numeric(6,2),
  fuel_consumed_l numeric(8,2),
  attained_km_per_l numeric(8,2) generated always as (
    case when coalesce(fuel_consumed_l, 0) > 0
      then round((coalesce(km_end, 0) - coalesce(km_start, 0)) / fuel_consumed_l, 2) end) stored,
  price_per_litre numeric(10,2) not null default 0,
  amount_tzs numeric(14,2) generated always as (round(coalesce(fuel_consumed_l, 0) * price_per_litre, 2)) stored
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  requester_id uuid references public.profiles(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  request_date date not null default current_date,
  odometer_km numeric(12,1),
  reason text not null check (reason in ('ppm', 'corrective', 'breakdown', 'accident', 'other')),
  reason_other text,
  faults text[] not null default '{}',
  fault_details text,
  confirmation jsonb,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approver_name text,
  approver_position text,
  approver_signature jsonb,
  approved_by uuid,
  approved_at timestamptz
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id),
  order_number text,
  garage_name text,
  description text,
  date_out date,
  date_in date,
  odometer_out numeric(12,1),
  odometer_in numeric(12,1),
  total_days integer generated always as (case when date_in is not null and date_out is not null then (date_in - date_out) end) stored,
  mileage_during_repairs numeric(12,1) generated always as (
    case when odometer_in is not null and odometer_out is not null then odometer_in - odometer_out end) stored,
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  check (date_in is null or date_out is null or date_in >= date_out)
);

create table public.maintenance_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid references public.work_orders(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id),
  cost_date date not null default current_date,
  odometer_km numeric(12,1),
  work_type text not null check (work_type in ('maintenance', 'repairs')),
  service_provider text,
  activities text,
  cost_tzs numeric(14,2) not null default 0
);

create table public.tyre_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  request_date date not null default current_date,
  odometer_km numeric(12,1),
  previous_request_date date,
  previous_odometer_km numeric(12,1),
  tyre_size text,
  tyre_make text,
  tyre_brand text,
  quantity integer not null default 1 check (quantity > 0),
  unit_cost_tzs numeric(14,2) not null default 0,
  total_cost_tzs numeric(14,2) generated always as (quantity * unit_cost_tzs) stored,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb
);

create table public.wash_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  category text not null check (category in ('full', 'body', 'interior', 'engine')),
  price_tzs numeric(14,2) not null default 0,
  unique (company_id, category)
);

create table public.wash_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  vehicle_id uuid not null references public.vehicles(id),
  request_date date not null default current_date,
  odometer_km numeric(12,1),
  categories text[] not null default '{}',
  service_provider text,
  cost_tzs numeric(14,2) not null default 0,       -- trigger: sum of wash_prices for the categories
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  check (cardinality(categories) > 0)
);

create table public.vehicle_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid not null references public.vehicles(id),
  check_date date not null default current_date,
  items text[] not null default '{}',
  remarks text
);

create table public.mandatory_trainings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid not null references public.drivers(id),
  courses text[] not null default '{}',             -- defensive_driving, four_wd, fatigue, night_driving
  date_completed date,
  trainer text,
  cost_tzs numeric(14,2),
  refresher_date date,                              -- Reminder
  certificate_attachment_id uuid
);

create table public.toolbox_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  week_number integer check (week_number between 1 and 53),
  month integer check (month between 1 and 12),
  date_from date,
  date_to date,
  topics text not null
);

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  employee_id uuid references public.profiles(id),
  employee_name text not null,
  employer text,
  employment_number text,
  job_title text,
  department text,
  period_month date not null,                       -- first day of the month
  total_normal_hours numeric(8,2) not null default 0,     -- trigger maintained
  total_overtime_hours numeric(8,2) not null default 0,   -- trigger maintained
  status public.request_status not null default 'draft',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approver_signature jsonb,
  unique (employee_id, period_month)
);

create table public.timesheet_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  timesheet_id uuid not null references public.timesheets(id) on delete cascade,
  work_date date not null,
  time_in time,
  time_out time,
  normal_hours numeric(5,2) not null default 0,
  overtime_hours numeric(5,2) not null default 0,
  day_type text not null default 'work' check (day_type in ('work', 'rest', 'leave', 'public_holiday', 'sick')),
  remarks text,
  unique (timesheet_id, work_date)
);

create table public.leave_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  counts_against_balance boolean not null default true,
  unique (company_id, name)
);

create table public.leave_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  employee_id uuid references public.profiles(id),
  employee_name text not null,
  employment_number text,
  employer text,
  position text,
  department text,
  plan_year integer not null,
  unique (employee_id, plan_year)
);

create table public.leave_plan_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  leave_plan_id uuid not null references public.leave_plans(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  days integer generated always as (date_to - date_from + 1) stored,
  category_id uuid references public.leave_categories(id),
  notes text,
  check (date_to >= date_from)
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  employee_id uuid references public.profiles(id),
  balance_year integer not null,
  entitled_days numeric(5,1) not null default 28,
  carried_over_days numeric(5,1) not null default 0,
  unique (employee_id, balance_year)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  driver_id uuid references public.drivers(id),
  employee_id uuid references public.profiles(id),
  category_id uuid references public.leave_categories(id),
  date_from date not null,
  date_to date not null,
  total_days integer generated always as (date_to - date_from + 1) stored,
  reason text,
  status public.request_status not null default 'draft',
  rejection_reason text,
  approver_name text,
  approver_position text,
  approver_signature jsonb,
  approved_by uuid,
  approved_at timestamptz,
  check (date_to >= date_from)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  occurred_at timestamptz not null,
  region text,
  district text,
  ward text,
  village_street text,
  road_name text,
  description text not null,
  driver_id uuid references public.drivers(id),
  driver_name text,
  driver_company text,
  driver_contact text,
  driver_age integer,
  driver_sex public.sex,
  driver_licence_class text,
  driver_licence_number text,
  driver_years_driving integer,
  injuries_count integer not null default 0,
  fatalities_count integer not null default 0,
  response_actions text[] not null default '{}',   -- informed_authorities, secured_scene, sent_injured, reported_insurance
  other_actions text,
  status text not null default 'open' check (status in ('open', 'under_review', 'closed'))
);

create table public.incident_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id),
  make text,
  model text,
  registration text,
  yom integer,
  owner_name text,
  insurance_policy_number text
);

create table public.incident_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  kind text not null check (kind in ('injured', 'deceased')),
  name text not null,
  sex public.sex,
  age integer,
  contact text,
  address text
);

-- ---------------------------------------------------------------------------
-- Shared tables
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  table_name text not null,
  row_id uuid not null,
  resource_key text not null,                       -- permission resource that governs this file
  bucket text not null,
  path text not null,
  label text not null,                              -- "Insurance policy", "Licence", ...
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  expiry_date date,
  is_sensitive boolean not null default false,      -- medical reports, OSHA files
  unique (bucket, path)
);
create index attachments_row_idx on public.attachments (table_name, row_id);

create table public.reminder_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  reminder_type text not null,
  lead_days integer not null default 30,
  lead_km integer not null default 500,
  notify_role_ids uuid[] not null default '{}',
  notify_email boolean not null default true,
  unique (company_id, reminder_type)
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  reminder_type text not null,                      -- insurance_end, internal_inspection, third_party_inspection, next_service, licence_expiry, osha_redo, training_refresher
  source_table text not null,
  source_id uuid not null,
  resource_key text not null,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete cascade,
  title text not null,
  due_date date,
  due_km numeric(12,1),
  status public.reminder_status not null default 'pending',
  last_notified_at timestamptz,
  unique (source_table, source_id, reminder_type)
);
create index reminders_due_idx on public.reminders (company_id, status, due_date);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,                               -- reminder, approval, rejection, anomaly, system
  title text not null,
  body text,
  link text,
  reminder_id uuid references public.reminders(id) on delete set null,
  read_at timestamptz,
  emailed_at timestamptz
);
create table public.report_presets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  report_type text not null,
  filters jsonb not null default '{}'::jsonb,
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- Standard audit columns on every data table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'vehicles','vehicle_inspections','vehicle_insurance','service_schedules','vehicle_remarks',
    'drivers','driver_courses','driver_licences','driver_osha',
    'daily_inspections','third_party_inspections','inspection_anomalies','first_aid_inspections','first_aid_items',
    'km_logs','km_log_trips','fuel_requests','fuel_issues','vehicle_requests','vehicle_assignments','jmp_reviews',
    'fuel_expenses','maintenance_requests','work_orders','maintenance_costs','tyre_requests','wash_prices','wash_requests',
    'vehicle_equipment','mandatory_trainings','toolbox_plans','timesheets','timesheet_days',
    'leave_categories','leave_plans','leave_plan_rows','leave_balances','leave_requests',
    'incidents','incident_vehicles','incident_people',
    'attachments','reminder_settings','reminders','notifications','report_presets'
  ] loop
    execute format('alter table public.%I
      add column created_at timestamptz not null default now(),
      add column created_by uuid,
      add column updated_at timestamptz not null default now(),
      add column updated_by uuid,
      add column deleted_at timestamptz', t);
    execute format('create index %I on public.%I (company_id) where deleted_at is null', t || '_company_idx', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()',
      t || '_audit', t);
  end loop;
end $$;

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- Attachment back-references (added after attachments exists)
alter table public.vehicle_inspections add constraint vehicle_inspections_report_fk foreign key (report_attachment_id) references public.attachments(id) on delete set null;
alter table public.driver_courses add constraint driver_courses_cert_fk foreign key (certificate_attachment_id) references public.attachments(id) on delete set null;
alter table public.driver_licences add constraint driver_licences_file_fk foreign key (licence_attachment_id) references public.attachments(id) on delete set null;
alter table public.driver_osha add constraint driver_osha_report_fk foreign key (report_attachment_id) references public.attachments(id) on delete set null;
alter table public.vehicle_assignments add constraint vehicle_assignments_jmp_fk foreign key (jmp_attachment_id) references public.attachments(id) on delete set null;
alter table public.mandatory_trainings add constraint mandatory_trainings_cert_fk foreign key (certificate_attachment_id) references public.attachments(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Views for calculated and derived data
-- ---------------------------------------------------------------------------
create or replace view public.v_vehicle_safety with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  exists (
    select 1 from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null
      and a.status = 'open' and a.when_to_act = 'immediately'
  ) as not_safe_for_use,
  (select count(*) from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null and a.status = 'open') as open_anomalies
from public.vehicles v
where v.deleted_at is null;

create or replace view public.v_leave_balances with (security_invoker = true) as
select
  b.id,
  b.company_id,
  b.driver_id,
  b.employee_id,
  b.balance_year,
  b.entitled_days,
  b.carried_over_days,
  coalesce((
    select sum(r.total_days) from public.leave_requests r
    join public.leave_categories c on c.id = r.category_id
    where r.employee_id = b.employee_id and r.deleted_at is null
      and r.status in ('approved', 'completed')
      and c.counts_against_balance
      and extract(year from r.date_from)::int = b.balance_year
  ), 0) as days_taken,
  b.entitled_days + b.carried_over_days - coalesce((
    select sum(r.total_days) from public.leave_requests r
    join public.leave_categories c on c.id = r.category_id
    where r.employee_id = b.employee_id and r.deleted_at is null
      and r.status in ('approved', 'completed')
      and c.counts_against_balance
      and extract(year from r.date_from)::int = b.balance_year
  ), 0) as balance_days
from public.leave_balances b
where b.deleted_at is null;

create or replace view public.v_incident_totals with (security_invoker = true) as
select
  company_id,
  date_trunc('month', occurred_at)::date as month,
  count(*) as incidents,
  sum(injuries_count) as injuries,
  sum(fatalities_count) as fatalities
from public.incidents
where deleted_at is null
group by company_id, date_trunc('month', occurred_at);

create or replace view public.v_wash_cost_report with (security_invoker = true) as
select
  w.id, w.company_id, w.vehicle_id, v.registration, w.request_date,
  w.categories, w.service_provider, w.cost_tzs, w.status
from public.wash_requests w
join public.vehicles v on v.id = w.vehicle_id
where w.deleted_at is null;
