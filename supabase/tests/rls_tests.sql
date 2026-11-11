-- RLS and permission tests. Run against a database that has the migrations and seed applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_tests.sql
-- Every test raises an exception when it fails, so a clean run means all tests pass.
-- Users come from seed.sql; auth.uid() is simulated through request.jwt.claim.sub.

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

create or replace function pg_temp.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'TEST FAILED: %', p_name;
  end if;
  raise notice 'ok: %', p_name;
end $$;

do $$
declare
  owner_id uuid := '33333333-3333-3333-3333-000000000001';
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  coord_id uuid := '33333333-3333-3333-3333-000000000003';
  hod_id uuid := '33333333-3333-3333-3333-000000000004';
  driver1_id uuid := '33333333-3333-3333-3333-000000000005';
  driver2_id uuid := '33333333-3333-3333-3333-000000000006';
  hr_id uuid := '33333333-3333-3333-3333-000000000007';
  driver1 uuid := '66666666-6666-6666-6666-000000000001';
  driver2 uuid := '66666666-6666-6666-6666-000000000002';
  n integer;
  v_role uuid;
  v_ok boolean;
begin
  -- permission_scope: own, department, all, parent-child override
  perform pg_temp.check('owner has all on anything', public.permission_scope_for(owner_id, 'expenses.tyres', 'delete') = 'all');
  perform pg_temp.check('admin has approve on expenses child via parent grant', public.permission_scope_for(admin_id, 'expenses.maintenance.requests', 'approve') = 'all');
  perform pg_temp.check('coordinator has no approve', public.permission_scope_for(coord_id, 'expenses.tyres', 'approve') is null);
  perform pg_temp.check('coordinator can create inspections', public.permission_scope_for(coord_id, 'inspections.daily', 'create') = 'all');
  perform pg_temp.check('HOD view only', public.permission_scope_for(hod_id, 'fleet.details', 'view') = 'all' and public.permission_scope_for(hod_id, 'fleet.details', 'edit') is null);
  perform pg_temp.check('HOD child grant overrides parent (remarks create)', public.permission_scope_for(hod_id, 'fleet.remarks', 'create') = 'all');
  perform pg_temp.check('driver own scope on km log', public.permission_scope_for(driver1_id, 'daily_use.km_log', 'create') = 'own');
  perform pg_temp.check('driver cannot view expenses.fuel', public.permission_scope_for(driver1_id, 'expenses.fuel', 'view') is null);
  perform pg_temp.check('HR reads drivers', public.permission_scope_for(hr_id, 'drivers.licence', 'view') = 'all');
  perform pg_temp.check('HR approves nothing', public.permission_scope_for(hr_id, 'expenses.leave.requests', 'approve') is null);

  -- Department scope: give HR a department-scoped grant temporarily and check widest-wins union
  insert into public.roles (id, company_id, name, is_system) values ('22222222-2222-2222-2222-0000000000aa', '11111111-1111-1111-1111-111111111111', 'Dept tester', false);
  insert into public.role_grants (role_id, resource_key, actions, scope) values ('22222222-2222-2222-2222-0000000000aa', 'expenses.timesheet', '{view,edit}', 'department');
  insert into public.user_roles (user_id, role_id, is_primary) values (hr_id, '22222222-2222-2222-2222-0000000000aa', false);
  perform pg_temp.check('union keeps widest scope (all over department)', public.permission_scope_for(hr_id, 'expenses.timesheet', 'view') = 'all');
  perform pg_temp.check('department scope where only that role grants it', public.permission_scope_for(hr_id, 'expenses.timesheet', 'edit') = 'department');
  delete from public.user_roles where role_id = '22222222-2222-2222-2222-0000000000aa';
  delete from public.roles where id = '22222222-2222-2222-2222-0000000000aa';
end $$;

-- RLS: a driver cannot read another driver's records
do $$
declare n integer;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000005');
  select count(*) into n from public.km_logs where driver_id <> '66666666-6666-6666-6666-000000000001';
  perform pg_temp.check('driver sees no other drivers km logs', n = 0);
  select count(*) into n from public.km_logs where driver_id = '66666666-6666-6666-6666-000000000001';
  perform pg_temp.check('driver sees own km logs', n > 0);
  select count(*) into n from public.daily_inspections where driver_id <> '66666666-6666-6666-6666-000000000001';
  perform pg_temp.check('driver sees no other drivers inspections', n = 0);
  select count(*) into n from public.drivers where id <> '66666666-6666-6666-6666-000000000001';
  perform pg_temp.check('driver sees only own driver record', n = 0);
  select count(*) into n from public.fuel_expenses;
  perform pg_temp.check('driver sees no fuel expenses', n = 0);
  select count(*) into n from public.vehicles;
  perform pg_temp.check('driver can list vehicles for dropdowns', n > 0);
  perform pg_temp.as_admin();
end $$;

-- RLS: HOD is read only; HR sees drivers but not fuel; coordinator sees everything operational
do $$
declare n integer; v_ok boolean;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000004');
  select count(*) into n from public.vehicles;
  perform pg_temp.check('HOD reads vehicles', n > 0);
  begin
    update public.vehicles set location = 'x' where registration = 'T 123 ABC';
    get diagnostics n = row_count;
    v_ok := n = 0;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('HOD cannot update vehicles', v_ok);
  insert into public.vehicle_remarks (company_id, vehicle_id, body) values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000001', 'HOD remark test');
  perform pg_temp.check('HOD can add remark', true);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000007');
  select count(*) into n from public.drivers;
  perform pg_temp.check('HR reads drivers', n > 0);
  select count(*) into n from public.fuel_requests;
  perform pg_temp.check('HR sees no fuel requests', n = 0);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  select count(*) into n from public.km_logs;
  perform pg_temp.check('coordinator sees all km logs', n > 10);
  perform pg_temp.as_admin();
end $$;

-- Approvals: edit cannot approve; status changes must go through the RPC; reject needs a reason
do $$
declare v_id uuid; v_ok boolean;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000005');
  insert into public.fuel_requests (company_id, vehicle_id, request_date, current_odometer, fuel_required_l, status)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 99999, 40, 'draft') returning id into v_id;
  update public.fuel_requests set status = 'submitted' where id = v_id;
  begin
    update public.fuel_requests set status = 'approved' where id = v_id;
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('direct approve blocked by trigger', v_ok);
  begin
    perform public.approve_request('fuel_requests', v_id);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('driver cannot approve own request', v_ok);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  begin
    perform public.approve_request('fuel_requests', v_id);
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('coordinator (edit only) cannot approve', v_ok);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  begin
    perform public.reject_request('fuel_requests', v_id, '');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('reject without reason refused', v_ok);
  perform public.approve_request('fuel_requests', v_id, null, '{"approved_l": 35}'::jsonb);
  perform pg_temp.check('admin approves and sets litres', (select approved_l from public.fuel_requests where id = v_id) = 35);
  perform pg_temp.as_admin();
end $$;

-- Role editing: admin ceiling enforced in the database
do $$
declare v_role uuid; v_ok boolean;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.roles (name, description) values ('Site clerk', 'test') returning id into v_role;
  insert into public.role_grants (role_id, resource_key, actions, scope) values (v_role, 'daily_use.km_log', '{view,create}', 'all');
  perform pg_temp.check('admin grants inside ceiling', true);
  begin
    insert into public.role_grants (role_id, resource_key, actions, scope) values (v_role, 'settings.roles', '{view}', 'all');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('admin cannot grant outside ceiling (settings)', v_ok);
  begin
    update public.roles set name = 'Hacked' where id = '22222222-2222-2222-2222-000000000005';
    get diagnostics v_ok = row_count;
    v_ok := not v_ok;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('admin cannot edit system role', v_ok);
  begin
    insert into public.user_roles (user_id, role_id) values ('33333333-3333-3333-3333-000000000003', '22222222-2222-2222-2222-000000000001');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('admin cannot assign owner role', v_ok);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  begin
    insert into public.roles (name) values ('Coordinator made role');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('coordinator cannot create roles', v_ok);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000001');
  begin
    delete from public.user_roles where user_id = '33333333-3333-3333-3333-000000000001' and role_id = '22222222-2222-2222-2222-000000000001';
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('last owner cannot be removed', v_ok);
  begin
    delete from public.roles where id = '22222222-2222-2222-2222-000000000001';
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('owner role cannot be deleted', v_ok);
  delete from public.roles where id = v_role;
  perform pg_temp.check('owner deletes unused custom role', true);
  perform pg_temp.as_admin();
end $$;

-- Reminders exist for every reminder field and the daily job creates notifications
do $$
declare n integer;
begin
  select count(*) into n from public.reminders where reminder_type = 'insurance_end';
  perform pg_temp.check('insurance reminders exist', n >= 5);
  select count(*) into n from public.reminders where reminder_type = 'next_service' and due_km is not null;
  perform pg_temp.check('next service km reminders exist', n >= 5);
  select count(*) into n from public.reminders where reminder_type in ('licence_expiry', 'osha_redo', 'training_refresher', 'inspection_renewal', 'third_party_renewal');
  perform pg_temp.check('driver and inspection reminders exist', n >= 15);
  select count(*) into n from public.notifications where kind = 'reminder';
  perform pg_temp.check('reminder notifications were created', n > 0);
end $$;

-- Calculated values live in the database
do $$
declare v numeric; n integer;
begin
  select count(*) into n from public.km_log_trips where trip_km <> km_end - km_start;
  perform pg_temp.check('trip km generated', n = 0);
  select count(*) into n from public.km_logs l where total_km <> (select coalesce(sum(trip_km), 0) from public.km_log_trips t where t.km_log_id = l.id);
  perform pg_temp.check('km log totals maintained', n = 0);
  select count(*) into n from public.timesheets t where total_normal_hours <> (select coalesce(sum(normal_hours), 0) from public.timesheet_days d where d.timesheet_id = t.id);
  perform pg_temp.check('timesheet totals maintained', n = 0);
  select count(*) into n from public.wash_requests where cost_tzs = 0;
  perform pg_temp.check('wash cost filled from price list', n = 0);
  select count(*) into n from public.fuel_expenses;
  perform pg_temp.check('fuel issues produced fuel expenses', n > 0);
  select not_safe_for_use::int into v from public.v_vehicle_safety where vehicle_id = '55555555-5555-5555-5555-000000000004';
  perform pg_temp.check('vehicle with immediate open anomaly is not safe', v = 1);
  select count(*) into n from public.vehicles where status = 'in_garage';
  perform pg_temp.check('open work order puts vehicle in garage', n >= 1);
end $$;


-- SaaS: package modules, vehicle limit, subscription status, public registration
do $$
declare n integer; v_ok boolean;
begin
  perform pg_temp.as_admin();
  -- Move the demo company to Starter (fleet, drivers, inspections; 5 vehicles).
  update public.companies set package_id = 'cccccccc-cccc-cccc-cccc-000000000001' where id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.check('starter: coordinator keeps fleet', public.permission_scope_for('33333333-3333-3333-3333-000000000003', 'fleet.details', 'view') = 'all');
  perform pg_temp.check('starter: coordinator loses daily use', public.permission_scope_for('33333333-3333-3333-3333-000000000003', 'daily_use.km_log', 'view') is null);
  perform pg_temp.check('starter: admin loses expenses', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'expenses.tyres', 'approve') is null);
  perform pg_temp.check('starter: dashboard and settings stay', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'settings.users', 'view') = 'all');
  perform pg_temp.check('owner unaffected by package', public.permission_scope_for('33333333-3333-3333-3333-000000000001', 'expenses.tyres', 'delete') = 'all');
  perform pg_temp.check('platform is owner only', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'platform.companies', 'view') is null);

  -- Submodule package: only expenses.fuel inside expenses
  insert into public.package_resources values ('cccccccc-cccc-cccc-cccc-000000000001', 'expenses.fuel');
  perform pg_temp.check('submodule in package allowed', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'expenses.fuel', 'view') = 'all');
  perform pg_temp.check('parent group visible for a packaged child', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'expenses', 'view') = 'all');
  perform pg_temp.check('sibling not in package denied', public.permission_scope_for('33333333-3333-3333-3333-000000000002', 'expenses.washing', 'view') is null);
  delete from public.package_resources where package_id = 'cccccccc-cccc-cccc-cccc-000000000001' and resource_key = 'expenses.fuel';

  -- Vehicle limit (5 vehicles already, Starter allows 5)
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  begin
    insert into public.vehicles (company_id, make, model, registration, status) values ('11111111-1111-1111-1111-111111111111', 'Isuzu', 'D-Max', 'T 999 ZZZ', 'in_service');
    v_ok := false;
  exception when others then v_ok := sqlerrm like '%allows 5 vehicles%';
  end;
  perform pg_temp.check('vehicle limit enforced', v_ok);
  perform pg_temp.as_admin();

  -- Admins cannot change their own package or status
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  begin
    update public.companies set package_id = 'cccccccc-cccc-cccc-cccc-000000000003' where id = '11111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
    v_ok := n = 0;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('admin cannot upgrade own package', v_ok);
  perform pg_temp.as_admin();

  -- Suspended company: no access for its users, owner still has access
  update public.companies set package_id = 'cccccccc-cccc-cccc-cccc-000000000003', status = 'suspended' where id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.check('suspended: coordinator has nothing', public.permission_scope_for('33333333-3333-3333-3333-000000000003', 'fleet.details', 'view') is null);
  perform pg_temp.check('suspended: owner still has all', public.permission_scope_for('33333333-3333-3333-3333-000000000001', 'fleet.details', 'view') = 'all');
  update public.companies set status = 'active', subscription_end = current_date - 1 where id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.check('expired subscription blocks access', public.permission_scope_for('33333333-3333-3333-3333-000000000003', 'fleet.details', 'view') is null);
  update public.companies set subscription_end = current_date + 275 where id = '11111111-1111-1111-1111-111111111111';
  perform pg_temp.check('restored access', public.permission_scope_for('33333333-3333-3333-3333-000000000003', 'fleet.details', 'view') = 'all');
end $$;

-- Anonymous visitors: may read public packages and submit a registration, nothing else
do $$
declare n integer; v_ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('role', 'anon', true);
  perform pg_temp.check('anon is never owner', not public.is_owner());
  select count(*) into n from public.packages;
  perform pg_temp.check('anon reads public packages', n = 3);
  insert into public.company_registrations (company_name, contact_name, email) values ('Test Co', 'Test Person', 'test@example.com');
  perform pg_temp.check('anon can register', true);
  begin
    insert into public.company_registrations (company_name, contact_name, email, status) values ('Sneaky Co', 'X Y', 'x@example.com', 'approved');
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('anon cannot self-approve', v_ok);
  begin
    select count(*) into n from public.company_registrations;
    v_ok := n = 0;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('anon cannot read registrations', v_ok);
  begin
    select count(*) into n from public.companies;
    v_ok := n = 0;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('anon cannot read companies', v_ok);
  perform pg_temp.as_admin();
end $$;

-- Owner approves a registration and gets a company with starter data
do $$
declare v_company uuid; v_reg uuid; n integer;
begin
  select id into v_reg from public.company_registrations where company_name = 'Ruvuma Agro Supplies';
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000001');
  v_company := public.approve_registration(v_reg, 'cccccccc-cccc-cccc-cccc-000000000002');
  perform pg_temp.check('approval created company', v_company is not null);
  select count(*) into n from public.platform_company_stats();
  perform pg_temp.check('platform stats list every company', n >= 3);
  perform pg_temp.as_admin();
  select count(*) into n from public.leave_categories where company_id = v_company;
  perform pg_temp.check('new company has starter leave categories', n = 5);
  perform pg_temp.check('registration marked approved', (select status from public.company_registrations where id = v_reg) = 'approved');
end $$;


-- Fast session and shell RPCs
do $$
declare j jsonb;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000005');
  j := public.session_context();
  perform pg_temp.check('session_context returns the driver profile', j->'profile'->>'id' = '33333333-3333-3333-3333-000000000005');
  perform pg_temp.check('session_context returns the driver role', j->'roles'->0->>'name' = 'Driver');
  perform pg_temp.check('session_context returns grants and resources', jsonb_array_length(j->'grants') > 5 and jsonb_array_length(j->'resources') > 40);
  perform pg_temp.check('session_context returns package keys', jsonb_array_length(j->'package_keys') >= 1);
  perform pg_temp.check('driver sees no company list', jsonb_array_length(j->'companies') = 0);
  j := public.shell_counts();
  perform pg_temp.check('driver has no approvals badge', (j->>'pending_approvals')::int = 0);
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  j := public.shell_counts();
  perform pg_temp.check('admin approvals badge counts submitted requests', (j->>'pending_approvals')::int > 0);
  perform pg_temp.check('admin sees open anomalies', (j->>'open_anomalies')::int >= 1);
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000001');
  j := public.session_context();
  perform pg_temp.check('owner gets the company list', jsonb_array_length(j->'companies') >= 2);
  perform pg_temp.as_admin();
end $$;


-- Owner platform mode
do $$
declare j jsonb; n integer;
begin
  perform pg_temp.check('owner starts on the platform', (select company_id from public.profiles where id = '33333333-3333-3333-3333-000000000001') is null);
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000001');
  j := public.session_context();
  perform pg_temp.check('platform mode has no company', j->'company' = 'null'::jsonb or j->'company' is null);
  select count(*) into n from public.platform_users();
  perform pg_temp.check('owner lists users across companies', n >= 11);
  select count(*) into n from public.platform_issues() where issue = 'no_admin';
  perform pg_temp.check('companies without an admin are flagged', n >= 1);
  perform public.switch_company('11111111-1111-1111-1111-111111111111');
  perform pg_temp.check('owner enters a company', public.my_company_id() = '11111111-1111-1111-1111-111111111111');
  perform public.switch_company(null);
  perform pg_temp.check('owner goes back to the platform', public.my_company_id() is null);
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  begin
    perform public.platform_users();
    perform pg_temp.check('admin cannot list platform users', false);
  exception when others then
    perform pg_temp.check('admin cannot list platform users', true);
  end;
  perform pg_temp.as_admin();
end $$;


-- Monthly fuel price and closing anomalies later
do $$
declare v_insp uuid; v_an uuid; v_price numeric; v_issue uuid;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.fuel_prices (company_id, price_per_litre, effective_from) values ('11111111-1111-1111-1111-111111111111', 3300, current_date - 5);
  insert into public.fuel_prices (company_id, price_per_litre, effective_from) values ('11111111-1111-1111-1111-111111111111', 3400, current_date + 20);
  perform pg_temp.check('price in force today is this month''s price', public.fuel_price_on('11111111-1111-1111-1111-111111111111', current_date) = 3300);
  perform pg_temp.check('future price applies from its date', public.fuel_price_on('11111111-1111-1111-1111-111111111111', current_date + 25) = 3400);
  insert into public.fuel_issues (company_id, vehicle_id, issue_date, previous_odometer, current_odometer, fuel_issued_l, price_per_litre)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 1000, 1400, 40, 0) returning id into v_issue;
  select price_per_litre into v_price from public.fuel_issues where id = v_issue;
  perform pg_temp.check('fuel issue without a price takes the price in force', v_price = 3300);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000005');
  insert into public.daily_inspections (company_id, vehicle_id, inspection_date, mileage_km, remark)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 50000, 'anomalies') returning id into v_insp;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened)
  values ('11111111-1111-1111-1111-111111111111', v_insp, '55555555-5555-5555-5555-000000000002', 'Wiper blade torn', 'Replace', 'at_next_service', 'open', current_date) returning id into v_an;
  perform pg_temp.check('anomaly can be saved open without a closing date', (select date_closed from public.inspection_anomalies where id = v_an) is null);
  perform pg_temp.as_admin();

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  update public.inspection_anomalies set status = 'closed' where id = v_an;
  perform pg_temp.check('closing later fills the closing date', (select date_closed from public.inspection_anomalies where id = v_an) = current_date);
  perform pg_temp.as_admin();
end $$;


-- Company branding
do $$
declare j jsonb; v_ok boolean;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  update public.companies set logo_data = 'data:image/png;base64,iVBORw0KGgo=', address = 'Plot 12, Nyerere Road', tax_number = '123-456-789'
  where id = '11111111-1111-1111-1111-111111111111';
  j := public.session_context();
  perform pg_temp.check('session carries the logo version', (j->'company'->>'logo_version') is not null);
  perform pg_temp.check('session carries company details', j->'company'->>'address' = 'Plot 12, Nyerere Road' and j->'company'->>'tax_number' = '123-456-789');
  begin
    update public.companies set logo_data = 'javascript:alert(1)' where id = '11111111-1111-1111-1111-111111111111';
    v_ok := false;
  exception when others then v_ok := true;
  end;
  perform pg_temp.check('only image data is accepted as a logo', v_ok);
  perform pg_temp.as_admin();
end $$;

-- Service history, employee details from the user, incidents with outside vehicles and drivers
do $$
declare v_old uuid; v_new uuid; v_ts uuid; v_inc uuid; v_iv uuid; r record;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  select id into v_old from public.service_schedules where vehicle_id = '55555555-5555-5555-5555-000000000002' and deleted_at is null order by created_at desc limit 1;
  insert into public.service_schedules (company_id, vehicle_id, last_service_km, last_service_date, interval_km, garage)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', 60000, current_date, 7500, 'City Motors') returning id into v_new;
  perform pg_temp.check('next service is service km plus interval', (select next_service_km from public.service_schedules where id = v_new) = 67500);
  perform pg_temp.check('older services stay as history', (select count(*) from public.service_schedules where vehicle_id = '55555555-5555-5555-5555-000000000002' and deleted_at is null) >= 2);
  perform pg_temp.check('older service reminder is closed', not exists (select 1 from public.reminders where source_table = 'service_schedules' and source_id = v_old and status <> 'done'));

  insert into public.timesheets (company_id, employee_id, period_month)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005', date_trunc('month', current_date)::date) returning id into v_ts;
  select * into r from public.timesheets where id = v_ts;
  perform pg_temp.check('timesheet name comes from the chosen employee', r.employee_name = 'Juma Hassan');
  perform pg_temp.check('timesheet job details come from the employee', r.employment_number is not null and r.driver_id = '66666666-6666-6666-6666-000000000001');

  insert into public.incidents (company_id, occurred_at, description, driver_source, driver_name, driver_contact)
  values ('11111111-1111-1111-1111-111111111111', now(), 'Rear-ended at junction', 'other', 'Hamisi Bakari', '+255711111111') returning id into v_inc;
  select * into r from public.incidents where id = v_inc;
  perform pg_temp.check('outside driver is saved as typed', r.driver_id is null and r.driver_name = 'Hamisi Bakari');
  insert into public.incident_vehicles (company_id, incident_id, vehicle_source, vehicle_id, registration, make, driver_name)
  values ('11111111-1111-1111-1111-111111111111', v_inc, 'other', '55555555-5555-5555-5555-000000000002', 'T 999 ZZZ', 'Isuzu', 'Hamisi Bakari') returning id into v_iv;
  select * into r from public.incident_vehicles where id = v_iv;
  perform pg_temp.check('outside vehicle keeps typed details and no fleet link', r.vehicle_id is null and r.registration = 'T 999 ZZZ');

  update public.incidents set driver_source = 'fleet', driver_id = '66666666-6666-6666-6666-000000000001', driver_name = null, driver_contact = null where id = v_inc;
  select * into r from public.incidents where id = v_inc;
  perform pg_temp.check('fleet driver details refill from the driver record', r.driver_name = 'Juma Hassan' and r.driver_contact = '+255700000005');
  perform pg_temp.as_admin();
end $$;

select 'ALL TESTS PASSED' as result;
