-- FMS production base data: module tree, packages, system roles and their grants.
-- No demo company, users or records. Safe to run more than once.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed_base.sql
-- Then create the owner account with supabase/create_owner.sql.

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
  ('platform.users', 'platform', 'Users', null, '/platform/users', 'users', 54, false, false),
  ('platform.registrations', 'platform', 'Registrations', null, '/platform/registrations', 'inbox', 55, false, false),
  ('settings', null, 'Settings', null, '/settings', 'settings', 900, false, false),
  ('settings.users', 'settings', 'Users', null, '/settings/users', 'user-cog', 901, false, false),
  ('settings.roles', 'settings', 'Roles and access', null, '/settings/roles', 'key-round', 902, false, false),
  ('settings.company', 'settings', 'Company', null, '/settings/company', 'building-2', 903, false, false),
  ('settings.reminders', 'settings', 'Reminders', null, '/settings/reminders', 'bell', 904, false, false),
  ('settings.audit', 'settings', 'Audit log', null, '/settings/audit', 'scroll-text', 905, false, false),
  ('settings.templates', 'settings', 'Email and SMS templates', null, '/settings/templates', 'mail', 906, false, false)
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
  perform pg_temp.grant_role(admin, 'settings.templates', array['view', 'edit']);
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

