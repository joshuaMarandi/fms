-- MDV Fleet Management System: seed
-- Module tree, system roles with grants, the four spec roles, a demo company, demo users and demo data.
-- Demo users all share the password "Password123!" (change in production).

-- ---------------------------------------------------------------------------
-- Module and submodule tree (section 3), with sidebar numbering, routes and icons
-- ---------------------------------------------------------------------------
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('dashboard', null, 'Dashboard', null, '/dashboard', 'layout-dashboard', 0, false, false),
  ('fleet', null, 'Fleet database', '1', '/fleet', 'truck', 100, true, false),
  ('fleet.details', 'fleet', 'Vehicle details', 'a', '/fleet', 'car', 101, false, false),
  ('fleet.inspection_status', 'fleet', 'Inspection status', 'b', '/fleet?tab=inspection', 'clipboard-check', 102, true, false),
  ('fleet.insurance', 'fleet', 'Insurance', 'c', '/fleet?tab=insurance', 'shield', 103, true, false),
  ('fleet.maintenance_schedule', 'fleet', 'Maintenance schedule', 'd', '/fleet?tab=maintenance', 'wrench', 104, true, false),
  ('fleet.documents', 'fleet', 'Documents', 'e', '/fleet?tab=documents', 'file-text', 105, false, false),
  ('fleet.remarks', 'fleet', 'Remarks', 'f', '/fleet?tab=remarks', 'message-square', 106, false, false),
  ('drivers', null, 'Driver details', '2', '/drivers', 'users', 200, true, false),
  ('drivers.personal', 'drivers', 'Personal', 'a', '/drivers', 'user', 201, false, false),
  ('drivers.training', 'drivers', 'Professional training', 'b', '/drivers?tab=training', 'graduation-cap', 202, false, false),
  ('drivers.licence', 'drivers', 'Licence', 'c', '/drivers?tab=licence', 'id-card', 203, true, false),
  ('drivers.osha', 'drivers', 'OSHA fit-for-work', 'd', '/drivers?tab=osha', 'heart-pulse', 204, true, false),
  ('drivers.documents', 'drivers', 'Documents', 'e', '/drivers?tab=documents', 'folder', 205, false, false),
  ('inspections', null, 'Inspections', '3', '/inspections', 'search-check', 300, true, false),
  ('inspections.daily', 'inspections', 'Daily (pre-trip) inspection', 'a', '/inspections/daily', 'sun', 301, false, false),
  ('inspections.third_party', 'inspections', 'Third-party inspection', 'b', '/inspections/third-party', 'badge-check', 302, true, false),
  ('inspections.first_aid', 'inspections', 'First aid kit inspection', 'c', '/inspections/first-aid', 'briefcase-medical', 303, false, false),
  ('daily_use', null, 'Vehicle daily use', '4', '/daily-use', 'route', 400, false, true),
  ('daily_use.km_log', 'daily_use', 'Daily kilometre log', 'a', '/daily-use/km-log', 'gauge', 401, false, false),
  ('daily_use.fuel_log', 'daily_use', 'Fuel log', 'b', '/daily-use/fuel-log', 'fuel', 402, false, true),
  ('daily_use.trip_requests', 'daily_use', 'Daily vehicle use requests', 'c', '/daily-use/trip-requests', 'map-pin', 403, false, true),
  ('daily_use.trip_requests.short', 'daily_use.trip_requests', 'Short or town trip', null, '/daily-use/trip-requests?type=short', null, 404, false, true),
  ('daily_use.trip_requests.long', 'daily_use.trip_requests', 'Long trip', null, '/daily-use/trip-requests?type=long', null, 405, false, true),
  ('daily_use.trip_requests.jmp_hse', 'daily_use.trip_requests', 'JMP: HSE manager sign-off', null, null, null, 406, false, false),
  ('daily_use.trip_requests.jmp_control_room', 'daily_use.trip_requests', 'JMP: control room review', null, null, null, 407, false, false),
  ('daily_use.trip_requests.jmp_erc', 'daily_use.trip_requests', 'JMP: emergency response review', null, null, null, 408, false, false),
  ('expenses', null, 'Fleet expenses and administration', '5', '/expenses', 'receipt', 500, true, true),
  ('expenses.fuel', 'expenses', 'Fuel', 'a', '/expenses/fuel', 'fuel', 501, false, false),
  ('expenses.maintenance', 'expenses', 'Maintenance', 'b', '/expenses/maintenance', 'wrench', 502, false, true),
  ('expenses.maintenance.requests', 'expenses.maintenance', 'Maintenance requests', null, '/expenses/maintenance/requests', null, 503, false, true),
  ('expenses.maintenance.work_orders', 'expenses.maintenance', 'Works orders and out-of-service', null, '/expenses/maintenance/work-orders', null, 504, false, false),
  ('expenses.maintenance.costs', 'expenses.maintenance', 'Maintenance cost', null, '/expenses/maintenance/costs', null, 505, false, false),
  ('expenses.tyres', 'expenses', 'Tyres', 'c', '/expenses/tyres', 'circle-dot', 506, false, true),
  ('expenses.washing', 'expenses', 'Car washing', 'd', '/expenses/washing', 'droplets', 507, false, true),
  ('expenses.equipment', 'expenses', 'Equipment and accessories', 'e', '/expenses/equipment', 'package', 508, false, false),
  ('expenses.trainings', 'expenses', 'Trainings', 'f', '/expenses/trainings', 'graduation-cap', 509, true, false),
  ('expenses.trainings.mandatory', 'expenses.trainings', 'Mandatory training records', null, '/expenses/trainings/mandatory', null, 510, true, false),
  ('expenses.trainings.toolbox', 'expenses.trainings', 'Toolbox talks', null, '/expenses/trainings/toolbox', null, 511, false, false),
  ('expenses.trainings.matrix', 'expenses.trainings', 'Training matrix', null, '/expenses/trainings/matrix', null, 512, false, false),
  ('expenses.timesheet', 'expenses', 'Timesheet', 'g', '/expenses/timesheet', 'clock', 513, false, true),
  ('expenses.leave', 'expenses', 'Annual leave', 'h', '/expenses/leave', 'calendar-days', 514, false, true),
  ('expenses.leave.plan', 'expenses.leave', 'Leave plan', null, '/expenses/leave/plan', null, 515, false, false),
  ('expenses.leave.requests', 'expenses.leave', 'Leave requests and records', null, '/expenses/leave/requests', null, 516, false, true),
  ('expenses.leave.balances', 'expenses.leave', 'Leave balances', null, '/expenses/leave/balances', null, 517, false, false),
  ('expenses.safety', 'expenses', 'Safety', 'i', '/expenses/safety', 'siren', 518, false, false),
  ('expenses.safety.incidents', 'expenses.safety', 'Incident and accident records', null, '/expenses/safety/incidents', null, 519, false, false),
  ('expenses.safety.reports', 'expenses.safety', 'Safety reports', null, '/expenses/safety/reports', null, 520, false, false),
  ('expenses.reports', 'expenses', 'Fleet data reports', 'j', '/expenses/reports', 'bar-chart-3', 521, false, false),
  ('platform', null, 'Platform', null, '/platform', 'building', 50, false, false),
  ('platform.overview', 'platform', 'Overview', null, '/platform', 'layout-grid', 51, false, false),
  ('platform.companies', 'platform', 'Companies', null, '/platform/companies', 'building-2', 52, false, false),
  ('platform.packages', 'platform', 'Packages', null, '/platform/packages', 'package', 53, false, false),
  ('platform.registrations', 'platform', 'Registrations', null, '/platform/registrations', 'inbox', 54, false, false),
  ('settings', null, 'Settings', null, '/settings', 'settings', 900, false, false),
  ('settings.users', 'settings', 'Users', null, '/settings/users', 'user-cog', 901, false, false),
  ('settings.roles', 'settings', 'Roles and access', null, '/settings/roles', 'key-round', 902, false, false),
  ('settings.company', 'settings', 'Company', null, '/settings/company', 'building-2', 903, false, false),
  ('settings.reminders', 'settings', 'Reminders', null, '/settings/reminders', 'bell', 904, false, false),
  ('settings.audit', 'settings', 'Audit log', null, '/settings/audit', 'scroll-text', 905, false, false)
on conflict (key) do update set
  parent_key = excluded.parent_key, name = excluded.name, label_prefix = excluded.label_prefix, path = excluded.path,
  icon = excluded.icon, sort_order = excluded.sort_order, has_reminders = excluded.has_reminders, is_request = excluded.is_request;

-- ---------------------------------------------------------------------------
-- Packages (SaaS plans): name, price, modules and vehicle limit
-- ---------------------------------------------------------------------------
insert into public.packages (id, name, description, price, currency, billing_period, max_vehicles, is_active, is_public, sort_order) values
  ('cccccccc-cccc-cccc-cccc-000000000001', 'Starter', 'Fleet database, drivers and inspections for small fleets.', 150000, 'TZS', 'monthly', 5, true, true, 1),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'Standard', 'Adds daily use, fuel and the core expense modules.', 350000, 'TZS', 'monthly', 25, true, true, 2),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'Enterprise', 'Every module, HR records, safety and reports.', 900000, 'TZS', 'monthly', 500, true, true, 3)
on conflict (id) do nothing;

insert into public.package_resources (package_id, resource_key) values
  ('cccccccc-cccc-cccc-cccc-000000000001', 'fleet'),
  ('cccccccc-cccc-cccc-cccc-000000000001', 'drivers'),
  ('cccccccc-cccc-cccc-cccc-000000000001', 'inspections'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'fleet'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'drivers'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'inspections'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'daily_use'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'expenses.fuel'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'expenses.maintenance'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'expenses.tyres'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'expenses.washing'),
  ('cccccccc-cccc-cccc-cccc-000000000002', 'expenses.equipment'),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'fleet'),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'drivers'),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'inspections'),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'daily_use'),
  ('cccccccc-cccc-cccc-cccc-000000000003', 'expenses')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Demo company and sites
-- ---------------------------------------------------------------------------
insert into public.companies (id, name, settings, package_id, status, contact_name, contact_email, contact_phone, city, country, subscription_start, subscription_end) values
  ('11111111-1111-1111-1111-111111111111', 'MDV Demo Company', '{"fuel_price_per_litre": 3150, "default_target_km_per_l": 9, "currency": "TZS"}'::jsonb,
   'cccccccc-cccc-cccc-cccc-000000000003', 'active', 'Amani Mushi', 'fleetmanager@mdv.test', '+255700000002', 'Dar es Salaam', 'Tanzania', current_date - 90, current_date + 275)
on conflict (id) do nothing;

-- The starter-data trigger filled defaults; the demo uses its own fixed rows below.
delete from public.leave_categories where company_id = '11111111-1111-1111-1111-111111111111';
delete from public.wash_prices where company_id = '11111111-1111-1111-1111-111111111111';
delete from public.reminder_settings where company_id = '11111111-1111-1111-1111-111111111111';

-- A second, smaller customer on the Starter package (no users yet) and a pending registration.
insert into public.companies (id, name, settings, package_id, status, contact_name, contact_email, contact_phone, city, country, subscription_start, subscription_end) values
  ('11111111-1111-1111-1111-222222222222', 'Kilimanjaro Logistics', '{"currency": "TZS"}'::jsonb,
   'cccccccc-cccc-cccc-cccc-000000000001', 'trial', 'Esther Lyimo', 'esther@kililogistics.test', '+255700000201', 'Moshi', 'Tanzania', current_date - 10, current_date + 20)
on conflict (id) do nothing;

insert into public.company_registrations (company_name, contact_name, email, phone, city, country, vehicles_count, package_id, message) values
  ('Ruvuma Agro Supplies', 'Daudi Ngonyani', 'daudi@ruvuma-agro.test', '+255700000301', 'Songea', 'Tanzania', 12, 'cccccccc-cccc-cccc-cccc-000000000002', 'We run 12 pickups and two trucks and need fuel and maintenance tracking.');

insert into public.sites (id, company_id, name, region) values
  ('11111111-1111-1111-1111-00000000000a', '11111111-1111-1111-1111-111111111111', 'Dar es Salaam HQ', 'Dar es Salaam'),
  ('11111111-1111-1111-1111-00000000000b', '11111111-1111-1111-1111-111111111111', 'Mwanza site', 'Mwanza'),
  ('11111111-1111-1111-1111-00000000000c', '11111111-1111-1111-1111-111111111111', 'Dodoma office', 'Dodoma')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- System roles (global) and spec roles (editable)
-- ---------------------------------------------------------------------------
insert into public.roles (id, company_id, name, description, is_system, is_owner, is_admin) values
  ('22222222-2222-2222-2222-000000000001', null, 'Owner', 'Owns the system. Everything, including role and company settings.', true, true, false),
  ('22222222-2222-2222-2222-000000000002', null, 'Admin', 'Senior person at a client company, for example the Fleet Manager or Transport Manager.', true, false, true),
  ('22222222-2222-2222-2222-000000000003', null, 'Fleet coordinator', 'Day-to-day fleet staff: logs, requests and records.', true, false, false),
  ('22222222-2222-2222-2222-000000000004', null, 'Head of department', 'Read only on dashboards and fleet data; may add remarks.', true, false, false),
  ('22222222-2222-2222-2222-000000000005', null, 'Driver', 'Adds, edits and views only their own related data.', true, false, false),
  ('22222222-2222-2222-2222-000000000006', null, 'HR', 'Reads driver records, training, timesheets and leave.', true, false, false),
  ('22222222-2222-2222-2222-000000000007', null, 'Requester', 'Requests vehicles for short and long trips.', false, false, false),
  ('22222222-2222-2222-2222-000000000008', null, 'HSE manager', 'Signs journey management plans and reads incidents.', false, false, false),
  ('22222222-2222-2222-2222-000000000009', null, 'Control room operator', 'Reviews trip plans and prepares to monitor.', false, false, false),
  ('22222222-2222-2222-2222-000000000010', null, 'Emergency response commander', 'Reviews trip plans and incidents and prepares resources.', false, false, false)
on conflict (id) do nothing;

-- Grants. Helper keeps the statements short.
create or replace function pg_temp.grant_role(p_role uuid, p_resource text, p_actions text[], p_scope text default 'all')
returns void language plpgsql as $$
begin
  insert into public.role_grants (role_id, resource_key, actions, scope)
  values (p_role, p_resource, (select array_agg(a::public.permission_action) from unnest(p_actions) a), p_scope::public.grant_scope)
  on conflict (role_id, resource_key) do update set actions = excluded.actions, scope = excluded.scope;
end;
$$;

do $$
declare
  admin uuid := '22222222-2222-2222-2222-000000000002';
  coord uuid := '22222222-2222-2222-2222-000000000003';
  hod uuid := '22222222-2222-2222-2222-000000000004';
  drv uuid := '22222222-2222-2222-2222-000000000005';
  hr uuid := '22222222-2222-2222-2222-000000000006';
  req uuid := '22222222-2222-2222-2222-000000000007';
  hse uuid := '22222222-2222-2222-2222-000000000008';
  ctrl uuid := '22222222-2222-2222-2222-000000000009';
  erc uuid := '22222222-2222-2222-2222-000000000010';
  full_set text[] := array['view', 'create', 'edit', 'delete', 'approve', 'export'];
  cru text[] := array['view', 'create', 'edit'];
  v text[] := array['view'];
  m text;
begin
  -- Admin: everything on the five modules and the dashboard, user and role management inside the ceiling.
  foreach m in array array['dashboard', 'fleet', 'drivers', 'inspections', 'daily_use', 'expenses'] loop
    perform pg_temp.grant_role(admin, m, full_set);
  end loop;
  perform pg_temp.grant_role(admin, 'settings', v);
  perform pg_temp.grant_role(admin, 'settings.users', array['view', 'create', 'edit']);
  perform pg_temp.grant_role(admin, 'settings.roles', array['view', 'create', 'edit']);
  perform pg_temp.grant_role(admin, 'settings.company', array['view', 'edit']);
  perform pg_temp.grant_role(admin, 'settings.reminders', array['view', 'edit']);
  perform pg_temp.grant_role(admin, 'settings.audit', v);

  -- Fleet coordinator: create, read, update on operational areas; export on reports.
  foreach m in array array['fleet', 'drivers', 'inspections', 'daily_use', 'expenses'] loop
    perform pg_temp.grant_role(coord, m, cru);
  end loop;
  perform pg_temp.grant_role(coord, 'dashboard', v);
  perform pg_temp.grant_role(coord, 'expenses.reports', array['view', 'export']);

  -- Head of department: read only, remarks on the fleet database.
  foreach m in array array['dashboard', 'fleet', 'drivers', 'inspections', 'daily_use', 'expenses'] loop
    perform pg_temp.grant_role(hod, m, v);
  end loop;
  perform pg_temp.grant_role(hod, 'fleet.remarks', cru);
  perform pg_temp.grant_role(hod, 'expenses.reports', array['view', 'export']);

  -- Driver: own data only.
  perform pg_temp.grant_role(drv, 'dashboard', v);
  perform pg_temp.grant_role(drv, 'fleet.details', v);
  perform pg_temp.grant_role(drv, 'drivers.personal', v, 'own');
  perform pg_temp.grant_role(drv, 'drivers.training', v, 'own');
  perform pg_temp.grant_role(drv, 'drivers.licence', v, 'own');
  perform pg_temp.grant_role(drv, 'drivers.osha', v, 'own');
  perform pg_temp.grant_role(drv, 'inspections', cru, 'own');
  perform pg_temp.grant_role(drv, 'daily_use.km_log', cru, 'own');
  perform pg_temp.grant_role(drv, 'daily_use.fuel_log', cru, 'own');
  perform pg_temp.grant_role(drv, 'daily_use.trip_requests', v, 'own');
  perform pg_temp.grant_role(drv, 'expenses.maintenance.requests', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.tyres', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.washing', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.equipment', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.trainings.mandatory', v, 'own');
  perform pg_temp.grant_role(drv, 'expenses.timesheet', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.leave', v, 'own');
  perform pg_temp.grant_role(drv, 'expenses.leave.requests', cru, 'own');
  perform pg_temp.grant_role(drv, 'expenses.leave.plan', cru, 'own');

  -- HR: drivers, training, timesheets, leave (read); approve nothing.
  perform pg_temp.grant_role(hr, 'dashboard', v);
  perform pg_temp.grant_role(hr, 'drivers', array['view', 'export']);
  perform pg_temp.grant_role(hr, 'expenses.trainings', array['view', 'export']);
  perform pg_temp.grant_role(hr, 'expenses.timesheet', array['view', 'export']);
  perform pg_temp.grant_role(hr, 'expenses.leave', array['view', 'export']);
  perform pg_temp.grant_role(hr, 'expenses.leave.balances', array['view', 'create', 'edit', 'export']);
  perform pg_temp.grant_role(hr, 'expenses.reports', array['view', 'export']);

  -- Requester
  perform pg_temp.grant_role(req, 'dashboard', v);
  perform pg_temp.grant_role(req, 'fleet.details', v);
  perform pg_temp.grant_role(req, 'daily_use.trip_requests', cru, 'own');

  -- HSE manager
  perform pg_temp.grant_role(hse, 'dashboard', v);
  perform pg_temp.grant_role(hse, 'daily_use.trip_requests', v);
  perform pg_temp.grant_role(hse, 'daily_use.trip_requests.jmp_hse', array['view', 'approve']);
  perform pg_temp.grant_role(hse, 'expenses.safety', array['view', 'export']);
  perform pg_temp.grant_role(hse, 'inspections', v);

  -- Control room operator
  perform pg_temp.grant_role(ctrl, 'dashboard', v);
  perform pg_temp.grant_role(ctrl, 'daily_use.trip_requests', v);
  perform pg_temp.grant_role(ctrl, 'daily_use.trip_requests.jmp_control_room', array['view', 'approve']);

  -- Emergency response commander
  perform pg_temp.grant_role(erc, 'dashboard', v);
  perform pg_temp.grant_role(erc, 'daily_use.trip_requests', v);
  perform pg_temp.grant_role(erc, 'daily_use.trip_requests.jmp_erc', array['view', 'approve']);
  perform pg_temp.grant_role(erc, 'expenses.safety.incidents', v);
end $$;

-- ---------------------------------------------------------------------------
-- Demo users (auth.users + profiles + roles)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text, p_phone text, p_role uuid, p_job text default null, p_department text default null)
returns void language plpgsql as $$
declare
  v_has_pw boolean;
begin
  select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') into v_has_pw;
  if v_has_pw then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
    values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
            crypt('Password123!', gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', p_name, 'company_id', '11111111-1111-1111-1111-111111111111', 'phone', p_phone),
            now(), now(), '', '', '', '', false)
    on conflict (id) do nothing;
    if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'identities') then
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (p_id, p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now())
      on conflict do nothing;
    end if;
  else
    insert into auth.users (id, email, raw_user_meta_data)
    values (p_id, p_email, jsonb_build_object('full_name', p_name, 'company_id', '11111111-1111-1111-1111-111111111111', 'phone', p_phone))
    on conflict (id) do nothing;
  end if;

  insert into public.profiles (id, company_id, full_name, email, phone, job_title, department)
  values (p_id, '11111111-1111-1111-1111-111111111111', p_name, p_email, p_phone, p_job, p_department)
  on conflict (id) do update set company_id = excluded.company_id, full_name = excluded.full_name, phone = excluded.phone,
    job_title = excluded.job_title, department = excluded.department;

  insert into public.user_roles (user_id, role_id, is_primary) values (p_id, p_role, true)
  on conflict do nothing;
end;
$$;

select pg_temp.seed_user('33333333-3333-3333-3333-000000000001', 'owner@mdv.test', 'System Owner', '+255700000001', '22222222-2222-2222-2222-000000000001', 'Owner', 'Management');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000002', 'fleetmanager@mdv.test', 'Amani Mushi', '+255700000002', '22222222-2222-2222-2222-000000000002', 'Fleet Manager', 'Transport');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000003', 'coordinator@mdv.test', 'Neema Kessy', '+255700000003', '22222222-2222-2222-2222-000000000003', 'Fleet Coordinator', 'Transport');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000004', 'hod@mdv.test', 'Baraka Mwakyusa', '+255700000004', '22222222-2222-2222-2222-000000000004', 'Head of Operations', 'Operations');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000005', 'driver1@mdv.test', 'Juma Hassan', '+255700000005', '22222222-2222-2222-2222-000000000005', 'Driver', 'Transport');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000006', 'driver2@mdv.test', 'Rehema Ally', '+255700000006', '22222222-2222-2222-2222-000000000005', 'Driver', 'Transport');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000007', 'hr@mdv.test', 'Grace Nyerere', '+255700000007', '22222222-2222-2222-2222-000000000006', 'HR Officer', 'Human Resources');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000008', 'requester@mdv.test', 'Peter Mollel', '+255700000008', '22222222-2222-2222-2222-000000000007', 'Project Engineer', 'Projects');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000009', 'hse@mdv.test', 'Zawadi Komba', '+255700000009', '22222222-2222-2222-2222-000000000008', 'HSE Manager', 'HSE');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000010', 'controlroom@mdv.test', 'Issa Rajabu', '+255700000010', '22222222-2222-2222-2222-000000000009', 'Control Room Operator', 'HSE');
select pg_temp.seed_user('33333333-3333-3333-3333-000000000011', 'erc@mdv.test', 'Hadija Said', '+255700000011', '22222222-2222-2222-2222-000000000010', 'Emergency Response Commander', 'HSE');

-- The Fleet Manager (Admin) may delegate everything in the five modules.
insert into public.admin_ceilings (user_id, resource_key)
select '33333333-3333-3333-3333-000000000002', k from unnest(array['dashboard', 'fleet', 'drivers', 'inspections', 'daily_use', 'expenses']) k
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Company reference data
-- ---------------------------------------------------------------------------
insert into public.wash_prices (company_id, category, price_tzs) values
  ('11111111-1111-1111-1111-111111111111', 'full', 25000),
  ('11111111-1111-1111-1111-111111111111', 'body', 10000),
  ('11111111-1111-1111-1111-111111111111', 'interior', 12000),
  ('11111111-1111-1111-1111-111111111111', 'engine', 15000)
on conflict do nothing;

insert into public.leave_categories (id, company_id, name, counts_against_balance) values
  ('44444444-4444-4444-4444-000000000001', '11111111-1111-1111-1111-111111111111', 'Annual leave', true),
  ('44444444-4444-4444-4444-000000000002', '11111111-1111-1111-1111-111111111111', 'Sick leave', false),
  ('44444444-4444-4444-4444-000000000003', '11111111-1111-1111-1111-111111111111', 'Compassionate leave', false),
  ('44444444-4444-4444-4444-000000000004', '11111111-1111-1111-1111-111111111111', 'Maternity or paternity leave', false),
  ('44444444-4444-4444-4444-000000000005', '11111111-1111-1111-1111-111111111111', 'Unpaid leave', false)
on conflict do nothing;

insert into public.reminder_settings (company_id, reminder_type, lead_days, lead_km, notify_role_ids) values
  ('11111111-1111-1111-1111-111111111111', 'insurance_end', 30, 0, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'inspection_renewal', 30, 0, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'third_party_renewal', 30, 0, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'next_service', 0, 500, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'licence_expiry', 60, 0, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'osha_redo', 30, 0, '{}'),
  ('11111111-1111-1111-1111-111111111111', 'training_refresher', 30, 0, '{}')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
insert into public.vehicles (id, company_id, make, model, registration, chassis_number, engine_number, yom, year_first_use, site_id, location, odometer_km, fuel_tank_capacity_l, target_km_per_l, owner_name, status) values
  ('55555555-5555-5555-5555-000000000001', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Land Cruiser 79', 'T 123 ABC', 'JTERB71J5K7001234', '1GD-0012345', 2019, 2019, '11111111-1111-1111-1111-00000000000a', 'Dar es Salaam HQ', 84210, 130, 8.5, 'MDV Demo Company', 'in_service'),
  ('55555555-5555-5555-5555-000000000002', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Hilux Double Cab', 'T 456 DEF', 'MR0FB8CD900123456', '2GD-0023456', 2021, 2021, '11111111-1111-1111-1111-00000000000a', 'Dar es Salaam HQ', 41560, 80, 11, 'MDV Demo Company', 'in_service'),
  ('55555555-5555-5555-5555-000000000003', '11111111-1111-1111-1111-111111111111', 'Nissan', 'Patrol', 'T 789 GHI', 'JN1TESY61Z0123456', 'ZD30-0034567', 2017, 2018, '11111111-1111-1111-1111-00000000000b', 'Mwanza site', 132880, 95, 7.5, 'MDV Demo Company', 'in_garage'),
  ('55555555-5555-5555-5555-000000000004', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Coaster', 'T 321 JKL', 'JTGFB518000123456', 'N04C-0045678', 2016, 2016, '11111111-1111-1111-1111-00000000000c', 'Dodoma office', 210340, 95, 6, 'MDV Demo Company', 'in_service'),
  ('55555555-5555-5555-5555-000000000005', '11111111-1111-1111-1111-111111111111', 'Mitsubishi', 'L200', 'T 654 MNO', 'MMBJNKL10LH012345', '4N15-0056789', 2022, 2022, '11111111-1111-1111-1111-00000000000a', 'Dar es Salaam HQ', 18230, 75, 12, 'MDV Demo Company', 'in_service')
on conflict (id) do nothing;

insert into public.vehicle_inspections (company_id, vehicle_id, kind, inspection_date, renewal_date)
select '11111111-1111-1111-1111-111111111111', v.id, 'internal', current_date - (interval '1 day' * (30 * n)), current_date + (interval '1 day' * (365 - 30 * n))
from (values ('55555555-5555-5555-5555-000000000001', 2), ('55555555-5555-5555-5555-000000000002', 11), ('55555555-5555-5555-5555-000000000003', 5),
             ('55555555-5555-5555-5555-000000000004', 12), ('55555555-5555-5555-5555-000000000005', 1)) as x(vid, n)
join public.vehicles v on v.id = x.vid::uuid;

insert into public.vehicle_inspections (company_id, vehicle_id, kind, inspection_date, renewal_date)
select '11111111-1111-1111-1111-111111111111', v.id, 'third_party', current_date - (interval '1 day' * (30 * n + 10)), current_date + (interval '1 day' * (365 - 30 * n - 10))
from (values ('55555555-5555-5555-5555-000000000001', 4), ('55555555-5555-5555-5555-000000000002', 7), ('55555555-5555-5555-5555-000000000003', 12),
             ('55555555-5555-5555-5555-000000000004', 9), ('55555555-5555-5555-5555-000000000005', 3)) as x(vid, n)
join public.vehicles v on v.id = x.vid::uuid;

insert into public.vehicle_insurance (company_id, vehicle_id, insurer, policy_number, start_date, end_date, premium_tzs)
select '11111111-1111-1111-1111-111111111111', v.id, 'Jubilee Insurance', 'POL-' || right(v.registration, 3) || '-2026', current_date - (interval '1 day' * (365 - d)), current_date + (interval '1 day' * d), 1850000
from (values ('55555555-5555-5555-5555-000000000001', 20), ('55555555-5555-5555-5555-000000000002', 140), ('55555555-5555-5555-5555-000000000003', -5),
             ('55555555-5555-5555-5555-000000000004', 75), ('55555555-5555-5555-5555-000000000005', 300)) as x(vid, d)
join public.vehicles v on v.id = x.vid::uuid;

insert into public.service_schedules (company_id, vehicle_id, last_service_km, last_service_date, next_service_km, interval_km)
select '11111111-1111-1111-1111-111111111111', v.id, v.odometer_km - 4200, current_date - 40, v.odometer_km - 4200 + 5000, 5000
from public.vehicles v where v.company_id = '11111111-1111-1111-1111-111111111111';

insert into public.vehicle_remarks (company_id, vehicle_id, body, created_by) values
  ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000003', 'Gearbox noise reported twice this quarter. Please prioritise the inspection at the next service.', '33333333-3333-3333-3333-000000000004');

-- ---------------------------------------------------------------------------
-- Drivers
-- ---------------------------------------------------------------------------
insert into public.drivers (id, company_id, profile_id, full_name, phone, email, employer, joining_date, employment_number, job_title, department, date_of_birth, sex, years_driving) values
  ('66666666-6666-6666-6666-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005', 'Juma Hassan', '+255700000005', 'driver1@mdv.test', 'MDV Demo Company', '2019-03-04', 'EMP-0101', 'Driver', 'Transport', '1986-07-12', 'male', 14),
  ('66666666-6666-6666-6666-000000000002', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', 'Rehema Ally', '+255700000006', 'driver2@mdv.test', 'MDV Demo Company', '2021-09-15', 'EMP-0102', 'Driver', 'Transport', '1991-02-23', 'female', 8),
  ('66666666-6666-6666-6666-000000000003', '11111111-1111-1111-1111-111111111111', null, 'Mohamed Kipara', '+255700000012', null, 'MDV Demo Company', '2017-01-10', 'EMP-0103', 'Driver', 'Transport', '1979-11-02', 'male', 20),
  ('66666666-6666-6666-6666-000000000004', '11111111-1111-1111-1111-111111111111', null, 'Elizabeth Shayo', '+255700000013', null, 'MDV Demo Company', '2023-06-01', 'EMP-0104', 'Driver', 'Transport', '1995-05-30', 'female', 5)
on conflict (id) do nothing;

insert into public.driver_courses (company_id, driver_id, courses, provider, date_completed) values
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', '{advanced_vip2,hgv}', 'nit', '2022-05-20'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000002', '{senior_vip1}', 'veta', '2023-02-11'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', '{advanced_vip2,psv}', 'nit', '2019-08-30'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000004', '{senior_vip1}', 'other', '2024-01-15');
update public.driver_courses set provider_other = 'Tanzania Driving Academy' where provider = 'other';

insert into public.driver_licences (company_id, driver_id, licence_number, licence_class, date_issued, expiry_date) values
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', '4000123456', 'C, E', current_date - 900, current_date + 195),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000002', '4000234567', 'B, C', current_date - 1000, current_date + 25),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', '4000345678', 'C, D, E', current_date - 1095, current_date - 12),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000004', '4000456789', 'B, C', current_date - 400, current_date + 695);

insert into public.driver_osha (company_id, driver_id, date_conducted, redo_date, result) values
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', current_date - 300, current_date + 65, 'Fit for work'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000002', current_date - 340, current_date + 25, 'Fit for work'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', current_date - 380, current_date - 15, 'Fit for work'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000004', current_date - 100, current_date + 265, 'Fit for work');

insert into public.mandatory_trainings (company_id, driver_id, courses, date_completed, trainer, cost_tzs, refresher_date) values
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', '{defensive_driving,four_wd,fatigue}', current_date - 200, 'SafeDrive Tanzania', 350000, current_date + 165),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000002', '{defensive_driving,night_driving}', current_date - 120, 'SafeDrive Tanzania', 250000, current_date + 245),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', '{defensive_driving,four_wd,fatigue,night_driving}', current_date - 380, 'Road Safety Institute', 450000, current_date - 15),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000004', '{defensive_driving}', current_date - 60, 'SafeDrive Tanzania', 150000, current_date + 305);

insert into public.toolbox_plans (company_id, week_number, month, date_from, date_to, topics) values
  ('11111111-1111-1111-1111-111111111111', extract(week from current_date)::int, extract(month from current_date)::int, date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 4, 'Fatigue management on long trips; pre-trip inspection refresher; reporting near misses'),
  ('11111111-1111-1111-1111-111111111111', extract(week from current_date - 7)::int, extract(month from current_date - 7)::int, date_trunc('week', current_date - 7)::date, date_trunc('week', current_date - 7)::date + 4, 'Tyre pressure checks; load securing; speed limits in villages');

-- ---------------------------------------------------------------------------
-- Operational data over the last 6 months (km logs, fuel, inspections)
-- ---------------------------------------------------------------------------
do $$
declare
  v record;
  d date;
  v_log uuid;
  v_km numeric;
  v_day_km numeric;
  i integer;
  drivers uuid[] := array['66666666-6666-6666-6666-000000000001', '66666666-6666-6666-6666-000000000002', '66666666-6666-6666-6666-000000000003', '66666666-6666-6666-6666-000000000004'];
  v_driver uuid;
  v_insp uuid;
  v_req uuid;
  v_month date;
  v_litres numeric;
  v_prev_km numeric;
begin
  i := 0;
  for v in select * from public.vehicles where company_id = '11111111-1111-1111-1111-111111111111' order by registration loop
    i := i + 1;
    v_driver := drivers[((i - 1) % 4) + 1];
    v_km := v.odometer_km - 180 * 60;   -- start six months back
    v_prev_km := v_km;
    for d in select generate_series(current_date - 180, current_date - 1, interval '1 day')::date loop
      -- Working days only, skip Sundays and a few random days.
      if extract(dow from d) = 0 or (extract(day from d)::int % 9 = 0) then continue; end if;
      v_day_km := 40 + ((extract(doy from d)::int * (i + 3)) % 90);

      insert into public.km_logs (company_id, vehicle_id, driver_id, log_date, created_by)
      values (v.company_id, v.id, v_driver, d, (select profile_id from public.drivers where id = v_driver))
      on conflict (vehicle_id, log_date) do nothing
      returning id into v_log;
      if v_log is not null then
        insert into public.km_log_trips (company_id, km_log_id, seq, departing_location, departure_time, km_start, km_end, destination, arrival_time) values
          (v.company_id, v_log, 1, v.location, '07:30', v_km, v_km + round(v_day_km * 0.6), 'Site visit', '09:10'),
          (v.company_id, v_log, 2, 'Site visit', '15:00', v_km + round(v_day_km * 0.6), v_km + v_day_km, v.location, '16:45');
        v_km := v_km + v_day_km;
      end if;

      -- Daily pre-trip inspection, mostly safe.
      insert into public.daily_inspections (company_id, driver_id, vehicle_id, inspection_date, mileage_km, remark, created_by)
      values (v.company_id, v_driver, v.id, d, v_km, 'safe', (select profile_id from public.drivers where id = v_driver))
      returning id into v_insp;

      -- Fuel issue roughly every 9 working days.
      if (extract(doy from d)::int + i) % 9 = 0 then
        v_litres := round((v_km - v_prev_km) / coalesce(v.target_km_per_l, 9) * (0.95 + ((extract(doy from d)::int % 7) * 0.03)), 1);
        insert into public.fuel_requests (company_id, driver_id, vehicle_id, request_date, previous_odometer, current_odometer, fuel_required_l, approved_l, status, approved_by, approved_at, created_by)
        values (v.company_id, v_driver, v.id, d, v_prev_km, v_km, v_litres, v_litres, 'draft', null, null, (select profile_id from public.drivers where id = v_driver))
        returning id into v_req;
        perform set_config('fms.approving', 'on', true);
        update public.fuel_requests set status = 'submitted' where id = v_req;
        update public.fuel_requests set status = 'approved', approved_by = '33333333-3333-3333-3333-000000000002', approved_at = d + time '10:00' where id = v_req;
        perform set_config('fms.approving', 'off', true);
        insert into public.fuel_issues (company_id, fuel_request_id, vehicle_id, driver_id, issue_date, previous_filled_l, previous_odometer, current_odometer, fuel_filled_l, fuel_issued_l, price_per_litre, created_by)
        values (v.company_id, v_req, v.id, v_driver, d, v_litres, v_prev_km, v_km, v_litres, v_litres, 3050 + ((extract(month from d)::int % 4) * 40), '33333333-3333-3333-3333-000000000003');
        v_prev_km := v_km;
      end if;
    end loop;
    update public.vehicles set odometer_km = greatest(odometer_km, v_km) where id = v.id;
  end loop;

  -- A few anomalies, one of them immediate and still open (vehicle 4 is "Not safe for use").
  select id into v_insp from public.daily_inspections where vehicle_id = '55555555-5555-5555-5555-000000000004' order by inspection_date desc limit 1;
  update public.daily_inspections set remark = 'anomalies' where id = v_insp;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened)
  values ('11111111-1111-1111-1111-111111111111', v_insp, '55555555-5555-5555-5555-000000000004', 'Brake pedal travels to the floor before biting; fluid level low.', 'Do not drive. Garage to bleed brakes and inspect master cylinder.', 'immediately', 'open', current_date - 1);

  select id into v_insp from public.daily_inspections where vehicle_id = '55555555-5555-5555-5555-000000000001' order by inspection_date desc limit 1 offset 3;
  update public.daily_inspections set remark = 'anomalies' where id = v_insp;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened)
  values ('11111111-1111-1111-1111-111111111111', v_insp, '55555555-5555-5555-5555-000000000001', 'Rear left indicator bulb not working.', 'Replace bulb.', 'before_next_service', 'open', current_date - 5);

  select id into v_insp from public.daily_inspections where vehicle_id = '55555555-5555-5555-5555-000000000002' order by inspection_date desc limit 1 offset 20;
  update public.daily_inspections set remark = 'anomalies' where id = v_insp;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened, date_closed, closed_by)
  values ('11111111-1111-1111-1111-111111111111', v_insp, '55555555-5555-5555-5555-000000000002', 'Windscreen washer empty.', 'Refilled.', 'at_next_service', 'closed', current_date - 25, current_date - 24, '33333333-3333-3333-3333-000000000002');
end $$;

-- Third-party inspections (one per vehicle, last year)
insert into public.third_party_inspections (company_id, driver_id, vehicle_id, inspection_date, mileage_km, remark, inspector, renewal_date)
select '11111111-1111-1111-1111-111111111111', null, x.id, current_date - 200 - (x.n * 10), x.odometer_km - 9000, 'safe', 'TBS Vehicle Inspection Centre', current_date + 165 - (x.n * 10)
from (select v.id, v.odometer_km, row_number() over (order by v.registration)::int as n from public.vehicles v where v.company_id = '11111111-1111-1111-1111-111111111111') x;

-- First aid kit inspections
insert into public.first_aid_inspections (id, company_id, vehicle_id, inspected_on, inspector_name, inspector_qualification, signature, next_inspection_date)
select gen_random_uuid(), '11111111-1111-1111-1111-111111111111', v.id, current_date - 45, 'Dr. Amina Juma', 'Medical officer, MDV clinic',
  jsonb_build_object('name', 'Dr. Amina Juma', 'method', 'tick', 'signed_at', (current_date - 45)::text), current_date + 135
from public.vehicles v where v.company_id = '11111111-1111-1111-1111-111111111111';

insert into public.first_aid_items (company_id, inspection_id, item_name, present, quantity, expiry_date)
select i.company_id, i.id, item, true, 1, case when item in ('Antiseptic solution', 'Burn dressing') then current_date + 200 else null end
from public.first_aid_inspections i
cross join unnest(array['Sterile gauze pads', 'Adhesive bandages', 'Crepe bandage', 'Antiseptic solution', 'Burn dressing', 'Disposable gloves', 'Scissors', 'Tweezers', 'CPR face shield', 'Eye wash', 'Triangular bandage', 'First aid manual']) item;

-- ---------------------------------------------------------------------------
-- Requests and expenses
-- ---------------------------------------------------------------------------
-- Vehicle requests: one approved short trip, one submitted short trip, one long trip under JMP review.
insert into public.vehicle_requests (id, company_id, requester_id, requester_name, requester_phone, requested_at, trip_type, date_needed, date_to, time_from, time_to, purpose_type, purpose, departure_time, duration_hours, occupants, destination, status, created_by) values
  ('77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000008', 'Peter Mollel', '+255700000008', now() - interval '3 days', 'short', current_date - 2, null, '09:00', '13:00', 'official', 'Deliver survey equipment to Kigamboni site', '09:00', 4, 3, 'Kigamboni', 'draft', '33333333-3333-3333-3333-000000000008'),
  ('77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000008', 'Peter Mollel', '+255700000008', now() - interval '1 day', 'short', current_date + 1, null, '14:00', '17:00', 'official', 'Collect documents from TRA offices', '14:00', 3, 1, 'TRA Samora Avenue', 'draft', '33333333-3333-3333-3333-000000000008'),
  ('77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000008', 'Peter Mollel', '+255700000008', now() - interval '5 days', 'long', current_date + 7, current_date + 10, '06:00', '18:00', 'official', 'Site supervision visit, Mwanza project', '06:00', 30, 4, 'Mwanza', 'draft', '33333333-3333-3333-3333-000000000008');
update public.vehicle_requests set status = 'submitted' where id in ('77777777-7777-7777-7777-000000000001', '77777777-7777-7777-7777-000000000002', '77777777-7777-7777-7777-000000000003');

do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  perform public.approve_request('vehicle_requests', '77777777-7777-7777-7777-000000000001', null,
    '{"driver_id": "66666666-6666-6666-6666-000000000001", "vehicle_id": "55555555-5555-5555-5555-000000000002"}'::jsonb);
  perform public.approve_request('vehicle_requests', '77777777-7777-7777-7777-000000000003', null,
    '{"driver_id": "66666666-6666-6666-6666-000000000003", "vehicle_id": "55555555-5555-5555-5555-000000000001"}'::jsonb);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000009', true);
  perform public.sign_jmp('77777777-7777-7777-7777-000000000003', 'hse_manager', 'approved');
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Maintenance: a submitted request for the Patrol, an open work order (in garage) and historical costs.
insert into public.maintenance_requests (id, company_id, requester_id, driver_id, vehicle_id, request_date, odometer_km, reason, faults, fault_details, status, created_by) values
  ('88888888-8888-8888-8888-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005', '66666666-6666-6666-6666-000000000001', '55555555-5555-5555-5555-000000000003', current_date - 6, 132880, 'corrective', '{gearbox,brakes}', 'Grinding noise in third gear; brake pads worn.', 'draft', '33333333-3333-3333-3333-000000000005'),
  ('88888888-8888-8888-8888-000000000002', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', '66666666-6666-6666-6666-000000000002', '55555555-5555-5555-5555-000000000005', current_date - 1, 18230, 'ppm', '{engine_oil,filters}', 'Due for 20,000 km service.', 'draft', '33333333-3333-3333-3333-000000000006');
update public.maintenance_requests set status = 'submitted' where id in ('88888888-8888-8888-8888-000000000001', '88888888-8888-8888-8888-000000000002');
do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  perform public.approve_request('maintenance_requests', '88888888-8888-8888-8888-000000000001', null, '{"approver_name": "Amani Mushi", "approver_position": "Fleet Manager"}'::jsonb);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

insert into public.work_orders (id, company_id, maintenance_request_id, vehicle_id, order_number, garage_name, description, date_out, odometer_out, status) values
  ('99999999-9999-9999-9999-000000000001', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-000000000001', '55555555-5555-5555-5555-000000000003', 'WO-2026-031', 'Toyota Tanzania Service Centre', 'Gearbox inspection and brake pad replacement', current_date - 4, 132880, 'in_progress');

insert into public.work_orders (company_id, vehicle_id, order_number, garage_name, description, date_out, date_in, odometer_out, odometer_in, status)
select '11111111-1111-1111-1111-111111111111', v.id, 'WO-2026-0' || n, 'Toyota Tanzania Service Centre', 'Scheduled service', current_date - (40 * n), current_date - (40 * n) + (1 + (n % 3)), v.odometer_km - 5000 * n, v.odometer_km - 5000 * n + 10, 'closed'
from public.vehicles v cross join generate_series(1, 3) n where v.company_id = '11111111-1111-1111-1111-111111111111';

insert into public.maintenance_costs (company_id, work_order_id, vehicle_id, cost_date, odometer_km, work_type, service_provider, activities, cost_tzs)
select w.company_id, w.id, w.vehicle_id, w.date_in, w.odometer_in, case when w.description like 'Scheduled%' then 'maintenance' else 'repairs' end,
  w.garage_name, w.description, 180000 + ((extract(day from w.date_in)::int % 7) * 65000)
from public.work_orders w where w.date_in is not null;

-- Tyres
insert into public.tyre_requests (company_id, driver_id, vehicle_id, request_date, odometer_km, tyre_size, tyre_make, tyre_brand, quantity, unit_cost_tzs, status, created_by) values
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', '55555555-5555-5555-5555-000000000001', current_date - 70, 80000, '265/70 R16', 'Bridgestone', 'Dueler A/T', 4, 420000, 'draft', '33333333-3333-3333-3333-000000000005'),
  ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', '55555555-5555-5555-5555-000000000004', current_date - 3, 210000, '7.50 R16', 'Yokohama', 'RY818', 2, 385000, 'draft', '33333333-3333-3333-3333-000000000003');
update public.tyre_requests set status = 'submitted';
do $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  select id into v_id from public.tyre_requests where vehicle_id = '55555555-5555-5555-5555-000000000001' limit 1;
  perform public.approve_request('tyre_requests', v_id);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Car washing
insert into public.wash_requests (company_id, driver_id, vehicle_id, request_date, odometer_km, categories, service_provider, status, created_by)
select '11111111-1111-1111-1111-111111111111', d.id, v.id, current_date - (7 * n), v.odometer_km - (300 * n),
  case when n % 3 = 0 then '{full}'::text[] when n % 3 = 1 then '{body,interior}'::text[] else '{body}'::text[] end,
  'Sparkle Car Wash', 'draft', d.profile_id
from public.vehicles v
join public.drivers d on d.id = '66666666-6666-6666-6666-000000000001'
cross join generate_series(1, 8) n where v.company_id = '11111111-1111-1111-1111-111111111111' and v.id <> '55555555-5555-5555-5555-000000000003';
update public.wash_requests set status = 'submitted';
do $$
declare r record;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  for r in select id from public.wash_requests where request_date < current_date - 7 loop
    perform public.approve_request('wash_requests', r.id);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Equipment checks
insert into public.vehicle_equipment (company_id, vehicle_id, check_date, items, remarks)
select '11111111-1111-1111-1111-111111111111', v.id, current_date - 14,
  case when v.registration = 'T 321 JKL'
    then '{wheel_spanner,wheel_chocks,lifting_jack,reflective_triangles,spare_tyre,first_aid_box,towing_rope}'::text[]
    else '{wheel_spanner,wheel_chocks,lifting_jack,reflective_triangles,spare_tyre,fire_extinguisher,first_aid_box,jumping_cable,towing_rope,spade}'::text[] end,
  case when v.registration = 'T 321 JKL' then 'Fire extinguisher expired, replacement ordered.' else null end
from public.vehicles v where v.company_id = '11111111-1111-1111-1111-111111111111';

-- Timesheets for the last two months for the two driver users
insert into public.timesheets (id, company_id, driver_id, employee_id, employee_name, employer, employment_number, job_title, department, period_month, status, created_by)
select gen_random_uuid(), '11111111-1111-1111-1111-111111111111', d.id, d.profile_id, d.full_name, d.employer, d.employment_number, d.job_title, d.department,
  (date_trunc('month', current_date) - (interval '1 month' * n))::date, 'draft', d.profile_id
from public.drivers d cross join generate_series(1, 2) n where d.profile_id is not null;

insert into public.timesheet_days (company_id, timesheet_id, work_date, time_in, time_out, day_type)
select t.company_id, t.id, dd::date, '07:30'::time, case when extract(dow from dd) = 6 then '13:30'::time else '17:00'::time end, 'work'
from public.timesheets t
cross join lateral generate_series(t.period_month, (t.period_month + interval '1 month' - interval '1 day')::date, interval '1 day') dd
where extract(dow from dd) <> 0;

update public.timesheets set status = 'submitted' where period_month < date_trunc('month', current_date - interval '1 month');
do $$
declare r record;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  for r in select id from public.timesheets where status = 'submitted' loop
    perform public.approve_request('timesheets', r.id);
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Leave
insert into public.leave_balances (company_id, driver_id, employee_id, balance_year, entitled_days, carried_over_days)
select '11111111-1111-1111-1111-111111111111', d.id, d.profile_id, extract(year from current_date)::int, 28, 0
from public.drivers d where d.profile_id is not null;

insert into public.leave_plans (id, company_id, driver_id, employee_id, employee_name, employment_number, employer, position, department, plan_year)
select gen_random_uuid(), '11111111-1111-1111-1111-111111111111', d.id, d.profile_id, d.full_name, d.employment_number, d.employer, d.job_title, d.department, extract(year from current_date)::int
from public.drivers d where d.profile_id is not null;

insert into public.leave_plan_rows (company_id, leave_plan_id, date_from, date_to, category_id, notes)
select p.company_id, p.id, make_date(p.plan_year, 12, 15), make_date(p.plan_year, 12, 28), '44444444-4444-4444-4444-000000000001', 'Year-end leave'
from public.leave_plans p;

insert into public.leave_requests (id, company_id, driver_id, employee_id, category_id, date_from, date_to, reason, status, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', '33333333-3333-3333-3333-000000000005', '44444444-4444-4444-4444-000000000001', current_date - 60, current_date - 54, 'Family visit', 'draft', '33333333-3333-3333-3333-000000000005'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000002', '33333333-3333-3333-3333-000000000006', '44444444-4444-4444-4444-000000000001', current_date + 20, current_date + 24, 'Rest', 'draft', '33333333-3333-3333-3333-000000000006');
update public.leave_requests set status = 'submitted';
do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-000000000002', true);
  perform public.approve_request('leave_requests', 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', null, '{"approver_name": "Amani Mushi", "approver_position": "Fleet Manager"}'::jsonb);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Incidents
insert into public.incidents (id, company_id, occurred_at, region, district, ward, village_street, road_name, description, driver_id, injuries_count, fatalities_count, response_actions, other_actions, status) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '11111111-1111-1111-1111-111111111111', now() - interval '45 days', 'Dar es Salaam', 'Kinondoni', 'Mwananyamala', 'Kawawa Road', 'Kawawa Road', 'Minor rear-end collision at traffic lights; bodaboda rider braked suddenly.', '66666666-6666-6666-6666-000000000001', 0, 0, '{informed_authorities,secured_scene,reported_insurance}', null, 'closed'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', '11111111-1111-1111-1111-111111111111', now() - interval '12 days', 'Mwanza', 'Ilemela', 'Buswelu', 'Buswelu village', 'Mwanza - Musoma road', 'Vehicle skidded on wet gravel and hit a roadside culvert. One passenger injured.', '66666666-6666-6666-6666-000000000003', 0, 0, '{informed_authorities,secured_scene,sent_injured,reported_insurance}', 'Vehicle towed to Mwanza site.', 'under_review');

insert into public.incident_vehicles (company_id, incident_id, vehicle_id) values
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '55555555-5555-5555-5555-000000000002'),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', '55555555-5555-5555-5555-000000000003');

insert into public.incident_people (company_id, incident_id, kind, name, sex, age, contact, address) values
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-000000000002', 'injured', 'Samwel Magesa', 'male', 34, '+255700000099', 'Buswelu, Ilemela');

-- Run the reminder job once so the demo has notifications.
select public.process_due_reminders();
