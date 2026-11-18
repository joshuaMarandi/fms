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
  ('fleet_safety', null, 'Fleet safety', '3', null, 'shield', 400, true, false),
  ('inspections', null, 'Inspections', '3', null, 'search-check', 300, true, false),
  ('inspections.daily', 'fleet_safety', 'Daily pre-start inspection', 'a', '/inspections/daily', 'sun', 301, false, false),
  ('inspections.daily.weekly', 'fleet_safety', 'Weekly inspection', null, '/inspections/weekly', 'calendar-days', 302, false, false),
  ('inspections.third_party', 'fleet_safety', 'Third-party inspection', 'c', '/inspections/third-party', 'badge-check', 304, true, false),
  ('daily_use', null, 'Vehicle operations', '4', '/daily-use', 'route', 300, false, true),
  ('daily_use.km_log', 'daily_use', 'Daily kilometre log', 'b', '/daily-use/km-log', 'gauge', 402, false, false),
  ('daily_use.fuel_log', 'daily_use', 'Fuel request', 'c', '/daily-use/fuel-requests', 'fuel', 403, false, true),
  ('daily_use.trip_requests', 'daily_use', 'Vehicle requests', 'a', '/daily-use/trip-requests', 'map-pin', 401, false, true),
  ('daily_use.trip_requests.short', 'daily_use.trip_requests', 'Short or town trip', null, '/daily-use/trip-requests?type=short', null, 404, false, true),
  ('daily_use.trip_requests.long', 'daily_use.trip_requests', 'Long trip', null, '/daily-use/trip-requests?type=long', null, 405, false, true),
  ('daily_use.trip_requests.jmp_hse', 'daily_use.trip_requests', 'JMP: HSE manager sign-off', null, null, null, 406, false, false),
  ('daily_use.trip_requests.jmp_control_room', 'daily_use.trip_requests', 'JMP: control room review', null, null, null, 407, false, false),
  ('daily_use.trip_requests.jmp_erc', 'daily_use.trip_requests', 'JMP: emergency response review', null, null, null, 408, false, false),
  ('expenses', null, 'Fleet expenses', '5', '/expenses', 'receipt', 600, true, true),
  ('expenses.fuel', 'expenses', 'Fuel cost', 'a', '/expenses/fuel', 'fuel', 601, false, false),
  ('expenses.maintenance', 'expenses', 'Maintenance and repair', 'b', null, 'wrench', 502, false, true),
  ('expenses.maintenance.requests', 'daily_use', 'Maintenance and repair requests', null, '/expenses/maintenance/requests', null, 405, false, true),
  ('expenses.maintenance.costs', 'daily_use', 'Maintenance and repair records', null, '/expenses/maintenance/costs', null, 406, false, false),
  ('expenses.maintenance.costs.maintenance', 'expenses', 'Maintenance cost', null, '/expenses/maintenance-cost', 'wrench', 602, false, false),
  ('expenses.maintenance.costs.repairs', 'expenses', 'Repair cost', null, '/expenses/repair-cost', 'wrench', 603, false, false),
  ('expenses.tyres', 'expenses', 'Tyres', 'c', '/expenses/tyres', 'circle-dot', 604, false, true),
  ('expenses.washing', 'expenses', 'Car washing', 'd', '/expenses/washing', 'droplets', 605, false, true),
  ('expenses.misc', 'expenses', 'Miscellaneous expenses', 'e', '/expenses/misc', 'receipt', 606, false, false),
  ('expenses.trainings', 'expenses', 'Trainings', 'f', null, 'graduation-cap', 509, true, false),
  ('expenses.trainings.mandatory', 'fleet_safety', 'Mandatory training records', null, '/expenses/trainings/mandatory', null, 305, true, false),
  ('expenses.admin', null, 'Fleet administration', '6', '/administration', 'building', 500, false, true),
  ('expenses.admin.roster', 'expenses.admin', 'Fleet roster', null, '/administration/roster', null, 551, false, false),
  ('expenses.timesheet', 'expenses.admin', 'Timesheet', null, '/expenses/timesheet', 'clock', 552, false, true),
  ('expenses.leave', 'expenses.admin', 'Annual leave', 'h', null, 'calendar-days', 559, false, true),
  ('expenses.leave.plan', 'expenses.admin', 'Leave plan', null, '/expenses/leave/plan', null, 553, false, false),
  ('expenses.leave.requests', 'expenses.admin', 'Leave requests and records', null, '/expenses/leave/requests', null, 554, false, true),
  ('expenses.leave.balances', 'expenses.admin', 'Leave balances', null, '/expenses/leave/balances', null, 555, false, false),
  ('expenses.admin.outstation', 'expenses.admin', 'Outstation allowance', null, '/administration/outstation', null, 556, false, false),
  ('expenses.admin.petty_cash', 'expenses.admin', 'Petty cash reconciliation', null, '/administration/petty-cash', null, 557, false, false),
  ('expenses.trainings.toolbox', 'fleet_safety', 'Toolbox talks', null, '/expenses/trainings/toolbox', null, 306, false, false),
  ('expenses.trainings.matrix', 'fleet_safety', 'Training matrix', null, '/expenses/trainings/matrix', null, 307, false, false),
  ('expenses.safety', null, 'Safety', '9', null, 'siren', 580, false, false),
  ('expenses.safety.incidents', 'fleet_safety', 'Incident and accident records', null, '/expenses/safety/incidents', null, 308, false, false),
  ('expenses.safety.reports', 'fleet_safety', 'Safety reports', null, '/expenses/safety/reports', null, 309, false, false),
  ('expenses.travel', null, 'Travel coordination', '8', null, 'map-pin', 800, false, false),
  ('expenses.travel.departures', 'expenses.travel', 'Local departures', null, '/travel/departures', null, 561, false, false),
  ('expenses.travel.arrivals', 'expenses.travel', 'Local arrivals', null, '/travel/arrivals', null, 562, false, false),
  ('expenses.travel.settings', 'expenses.travel', 'Pickup settings', null, '/travel/settings', null, 563, false, false),
  ('expenses.reports', null, 'Fleet data reports', '7', '/expenses/reports', 'bar-chart-3', 700, false, false),
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
  ('settings.templates', 'settings', 'Email and SMS templates', null, '/settings/templates', 'mail', 906, false, false),
  ('settings.owners', 'settings', 'System owners', null, '/settings/owners', 'shield', 907, false, false)
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

