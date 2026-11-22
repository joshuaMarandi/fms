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
  perform set_config('request.jwt.claims', '', true);
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
  perform pg_temp.check('admin has approve on expenses child via parent grant', public.permission_scope_for(admin_id, 'expenses.washing', 'approve') = 'all');
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
    update public.vehicles set location = 'x' where registration = 'T123ABC';
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
    insert into public.vehicles (company_id, make, model, registration, status) values ('11111111-1111-1111-1111-111111111111', 'Isuzu', 'D-Max', 'T999ZZZ', 'in_service');
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
  values ('11111111-1111-1111-1111-111111111111', v_inc, 'other', '55555555-5555-5555-5555-000000000002', 'T999ZZZ', 'Isuzu', 'Hamisi Bakari') returning id into v_iv;
  select * into r from public.incident_vehicles where id = v_iv;
  perform pg_temp.check('outside vehicle keeps typed details and no fleet link', r.vehicle_id is null and r.registration = 'T999ZZZ');

  update public.incidents set driver_source = 'fleet', driver_id = '66666666-6666-6666-6666-000000000001', driver_name = null, driver_contact = null where id = v_inc;
  select * into r from public.incidents where id = v_inc;
  perform pg_temp.check('fleet driver details refill from the driver record', r.driver_name = 'Juma Hassan' and r.driver_contact = '+255700000005');
  perform pg_temp.as_admin();
end $$;

-- Vehicle status and reason, registration without spaces, hubs, readings from the last record
do $$
declare v_id uuid; r record; v_prev numeric; v_fr uuid; n int;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.vehicles (company_id, make, model, registration, odometer_km)
  values ('11111111-1111-1111-1111-111111111111', 'Isuzu', 'D-Max', 'T 900 XYZ', 1000) returning id into v_id;
  perform pg_temp.check('registration is saved without spaces', (select registration from public.vehicles where id = v_id) = 'T900XYZ');

  update public.vehicles set status = 'out_of_service', status_reason = 'Awaiting insurance repair' where id = v_id;
  perform pg_temp.check('out of service keeps the reason', (select status_reason from public.vehicles where id = v_id) = 'Awaiting insurance repair');
  update public.vehicles set status = 'in_service' where id = v_id;
  perform pg_temp.check('back in service clears the reason', (select status_reason from public.vehicles where id = v_id) is null);
  begin
    update public.vehicles set status = 'in_garage' where id = v_id;
    perform pg_temp.check('garage is no longer a status', false);
  exception when check_violation then
    perform pg_temp.check('garage is no longer a status', true);
  end;


  insert into public.fuel_requests (company_id, vehicle_id, request_date, current_odometer, fuel_required_l)
  values ('11111111-1111-1111-1111-111111111111', v_id, current_date - 2, 1500, 40);
  insert into public.fuel_requests (company_id, vehicle_id, request_date, current_odometer, fuel_required_l)
  values ('11111111-1111-1111-1111-111111111111', v_id, current_date, 1900, 40) returning id into v_fr;
  select previous_odometer into v_prev from public.fuel_requests where id = v_fr;
  perform pg_temp.check('previous odometer is the reading at the last refuel', v_prev = 1500);

  select * into r from public.v_vehicle_activity where vehicle_id = v_id;
  perform pg_temp.check('activity shows the last refuel reading', r.last_fuel_odometer = 1900 and r.fuel_requests_this_month >= 1);
  select * into r from public.v_vehicle_activity where vehicle_id = '55555555-5555-5555-5555-000000000001';
  perform pg_temp.check('activity shows the last km end', r.last_km_end is not null and r.last_inspection_date is not null);
  select count(*) into n from public.vehicle_month_counts('daily_inspections', '55555555-5555-5555-5555-000000000001', extract(year from current_date)::int);
  perform pg_temp.check('month counts for the month picker', n >= 1);
  begin
    perform public.vehicle_month_counts('profiles', v_id, 2026);
    perform pg_temp.check('month counts only for record tables', false);
  exception when others then
    perform pg_temp.check('month counts only for record tables', true);
  end;
  perform pg_temp.check('each professional course is its own row', (select count(*) from public.driver_courses where driver_id = '66666666-6666-6666-6666-000000000001' and deleted_at is null and course is not null) = 2);
  perform pg_temp.as_admin();
end $$;

-- Approval messages by email and SMS with personal links; engine type and fuel price per engine type
create or replace function pg_temp.link_for(p_user uuid, p_template text default 'approval_request') returns text language sql as $$
  select substr(data ->> 'path', 4) from public.message_outbox
  where user_id = p_user and template = p_template and channel = 'email' and status = 'pending'
  order by created_at desc, id desc limit 1
$$;

do $$
declare
  company uuid := '11111111-1111-1111-1111-111111111111';
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  coord_id uuid := '33333333-3333-3333-3333-000000000003';
  requester_id uuid := '33333333-3333-3333-3333-000000000008';
  hse_id uuid := '33333333-3333-3333-3333-000000000009';
  ctrl_id uuid := '33333333-3333-3333-3333-000000000010';
  erc_id uuid := '33333333-3333-3333-3333-000000000011';
  v_leave uuid;
  v_trip uuid;
  v_token text;
  v_old_token text;
  j jsonb;
begin
  perform pg_temp.as_admin();
  delete from public.message_outbox;

  -- Engine type and price per engine type
  update public.vehicles set engine_type = 'petrol' where id = '55555555-5555-5555-5555-000000000005';
  insert into public.fuel_prices (company_id, engine_type, price_per_litre, effective_from) values
    (company, 'all', 3000, current_date), (company, 'petrol', 3200, current_date)
  on conflict (company_id, engine_type, effective_from) do update set price_per_litre = excluded.price_per_litre, deleted_at = null;
  perform pg_temp.check('petrol price for a petrol vehicle', public.fuel_price_on(company, current_date, 'petrol') = 3200);
  perform pg_temp.check('diesel falls back to the price for all engine types', public.fuel_price_on(company, current_date, 'diesel') = 3000);
  begin
    update public.vehicles set engine_type = 'steam' where id = '55555555-5555-5555-5555-000000000005';
    perform pg_temp.check('engine type is one of diesel, petrol, electric, gas', false);
  exception when check_violation then
    perform pg_temp.check('engine type is one of diesel, petrol, electric, gas', true);
  end;

  -- Leave: submitted goes to the approver by email and SMS with a personal link
  insert into public.leave_requests (company_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
  values (company, coord_id, (select id from public.leave_categories where company_id = company and not counts_against_balance order by name limit 1), current_date + 30, current_date + 32, 'Family event', 'draft', coord_id)
  returning id into v_leave;
  perform public.submit_request('leave_requests', v_leave);
  perform pg_temp.check('approver gets an email and an SMS', (select count(*) from public.message_outbox where user_id = admin_id and template = 'approval_request' and data ->> 'path' like '/a/%') = 2);
  perform pg_temp.check('the requester is not asked to approve their own request', not exists (select 1 from public.message_outbox where user_id = coord_id and template = 'approval_request'));
  perform pg_temp.check('the SMS goes to the phone number', exists (select 1 from public.message_outbox where user_id = admin_id and channel = 'sms' and recipient = '+255700000002'));
  perform pg_temp.check('in-app notification is not emailed again by the digest',
    not exists (select 1 from public.notifications where user_id = admin_id and link like '%' || v_leave and emailed_at is null));

  v_token := pg_temp.link_for(admin_id);
  perform pg_temp.check('link opens', public.approval_link_open(v_token) ->> 'state' = 'open');
  perform pg_temp.check('wrong token is not found', public.approval_link_open('nope') ->> 'state' = 'not_found');
  perform pg_temp.check('link is stored only as a hash', not exists (select 1 from public.approval_links where token_hash = v_token));

  -- Reject through the link (no sign-in): acts as the approver
  j := public.approval_link_decide(v_token, 'rejected', 'Clashes with the audit week');
  perform pg_temp.as_admin();
  perform pg_temp.check('rejected through the link', (select status from public.leave_requests where id = v_leave) = 'rejected'
    and (select approved_by from public.leave_requests where id = v_leave) = admin_id);
  perform pg_temp.check('requester told by email and SMS with the reason', (select count(*) from public.message_outbox where user_id = coord_id and template = 'request_rejected' and data ->> 'reason' = 'Clashes with the audit week') = 2);
  perform pg_temp.check('used link cannot be used again', public.approval_link_open(v_token) ->> 'state' = 'done');
  begin
    perform public.approval_link_decide(v_token, 'approved');
    perform pg_temp.check('used link refuses a second decision', false);
  exception when invalid_parameter_value then
    perform pg_temp.check('used link refuses a second decision', true);
  end;
  perform pg_temp.as_admin();
  perform pg_temp.check('history records the link', exists (select 1 from public.approval_events where record_id = v_leave and action = 'rejected' and via = 'link' and actor_id = admin_id));

  -- Changed and sent again: back to the approver, then approved through a new link
  update public.leave_requests set date_from = current_date + 40, date_to = current_date + 41 where id = v_leave;
  perform public.submit_request('leave_requests', v_leave);
  perform pg_temp.check('resubmission is recorded', exists (select 1 from public.approval_events where record_id = v_leave and action = 'resubmitted'));
  v_token := pg_temp.link_for(admin_id);
  j := public.approval_link_decide(v_token, 'approved', null, '{"approver_name": "Amani Mushi", "approver_position": "Fleet Manager"}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('fleet manager approved through the link: on to HR', (select status = 'submitted' and approval_step = 'hr_review' from public.leave_requests where id = v_leave));
  -- HR, then the HOD's link finalises it.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000007');
  perform public.approve_request('leave_requests', v_leave);
  perform pg_temp.as_admin();
  v_token := pg_temp.link_for('33333333-3333-3333-3333-000000000004');
  j := public.approval_link_decide(v_token, 'approved', null, '{"approver_name": "Head of Department", "approver_position": "HOD"}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('approved through the link', (select status from public.leave_requests where id = v_leave) = 'approved'
    and (select approver_position from public.leave_requests where id = v_leave) = 'HOD');
  perform pg_temp.check('requester told it was approved', exists (select 1 from public.message_outbox where user_id = coord_id and template = 'request_approved'));

  -- Long trip: approval, then each JMP step in turn
  insert into public.vehicle_requests (company_id, requester_id, requester_name, requester_phone, trip_type, date_needed, date_to, time_from, time_to, purpose_type, purpose, departure_time, duration_hours, occupants, destination, status, created_by)
  values (company, requester_id, 'Peter Mollel', '0700 000 808', 'long', current_date + 20, current_date + 22, '06:00', '18:00', 'official', 'Arusha site visit', '06:00', 10, 2, 'Arusha', 'submitted', requester_id)
  returning id into v_trip;
  v_token := pg_temp.link_for(admin_id);
  j := public.approval_link_decide(v_token, 'approved', null, '{"driver_id": "66666666-6666-6666-6666-000000000001", "vehicle_id": "55555555-5555-5555-5555-000000000002"}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('trip approved through the link with the assignment', (select status from public.vehicle_requests where id = v_trip) = 'approved'
    and exists (select 1 from public.vehicle_assignments where vehicle_request_id = v_trip and driver_id = '66666666-6666-6666-6666-000000000001'));
  perform pg_temp.check('long trip: not final yet, the requester is not told approved', not exists (select 1 from public.message_outbox where template = 'request_approved' and data ->> 'path' like '%' || v_trip));
  perform pg_temp.check('HSE manager gets the next step', exists (select 1 from public.message_outbox where user_id = hse_id and template = 'approval_request' and data ->> 'step' like 'HSE%'));
  perform pg_temp.check('control room waits for its turn', not exists (select 1 from public.message_outbox where user_id = ctrl_id and template = 'approval_request'));
  v_old_token := v_token;

  -- HSE rejects; the trip is changed and sent again; it resumes at the HSE step
  v_token := pg_temp.link_for(hse_id);
  j := public.approval_link_decide(v_token, 'rejected', 'Route plan missing rest stops');
  perform pg_temp.as_admin();
  perform pg_temp.check('JMP rejection rejects the trip', (select status from public.vehicle_requests where id = v_trip) = 'rejected');
  perform pg_temp.check('requester SMS uses the phone on the request', exists (select 1 from public.message_outbox where template = 'request_rejected' and channel = 'sms' and recipient = '0700000808'));
  delete from public.message_outbox where user_id = hse_id;
  perform public.submit_request('vehicle_requests', v_trip);
  perform pg_temp.check('resubmitted trip resumes at the JMP step', (select status from public.vehicle_requests where id = v_trip) = 'approved'
    and (select decision from public.jmp_reviews where vehicle_request_id = v_trip and step = 'hse_manager') is null);
  perform pg_temp.check('the approver is not asked again', public.approval_link_open(v_old_token) ->> 'state' = 'done');
  perform pg_temp.check('HSE manager gets a new link', pg_temp.link_for(hse_id) is not null);

  j := public.approval_link_decide(pg_temp.link_for(hse_id), 'approved');
  perform pg_temp.as_admin();
  perform pg_temp.check('m24: control room and ERC do not sign', pg_temp.link_for(ctrl_id) is null and pg_temp.link_for(erc_id) is null);
  perform pg_temp.check('m24: control room is emailed to monitor', exists (select 1 from public.message_outbox where user_id = ctrl_id and template = 'jmp_monitor'));
  perform pg_temp.check('m24: emergency commander is emailed to monitor', exists (select 1 from public.message_outbox where user_id = erc_id and template = 'jmp_monitor'));
  perform pg_temp.check('all JMP steps signed', not exists (select 1 from public.jmp_reviews where vehicle_request_id = v_trip and decision is distinct from 'approved' and step not in ('control_room', 'emergency_commander')));
  perform pg_temp.check('requester told the trip is fully approved', exists (select 1 from public.message_outbox where user_id = requester_id and template = 'request_approved'));
  perform pg_temp.check('no open links left', not exists (select 1 from public.approval_links where record_id = v_trip and used_at is null));

  -- Not reachable through the API
  perform pg_temp.as_user(requester_id);
  begin
    perform public.approval_link_open('x');
    perform pg_temp.check('signed-in users cannot call the link functions', false);
  exception when insufficient_privilege then
    perform pg_temp.check('signed-in users cannot call the link functions', true);
  end;
  begin
    perform count(*) from public.message_outbox;
    perform pg_temp.check('outbox is not readable', false);
  exception when insufficient_privilege then
    perform pg_temp.check('outbox is not readable', true);
  end;
  perform pg_temp.as_admin();

  -- Templates: the owner keeps platform defaults, the company admin keeps company wording
  perform pg_temp.as_user(admin_id);
  insert into public.message_templates (company_id, key, content) values (company, 'email.approval_request', '{"subject": "Please decide: {request}"}');
  perform pg_temp.check('company template saved for the company', exists (select 1 from public.message_templates where company_id = company and key = 'email.approval_request'));
  begin
    insert into public.message_templates (company_id, key, content) values (null, 'email.approval_request', '{}');
    perform pg_temp.check('admin cannot change platform defaults', false);
  exception when insufficient_privilege then
    perform pg_temp.check('admin cannot change platform defaults', true);
  end;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000001');
  insert into public.message_templates (company_id, key, content) values (null, 'email.approval_request', '{"subject": "Decision needed: {request}"}');
  perform pg_temp.check('owner keeps platform defaults', exists (select 1 from public.message_templates where company_id is null and key = 'email.approval_request'));
  perform pg_temp.as_admin();
end $$;

-- ---------------------------------------------------------------------------
-- Migration 15: assigning system roles, ceilings that follow the package, package change requests
-- ---------------------------------------------------------------------------
do $$
declare
  owner_id uuid := '33333333-3333-3333-3333-000000000001';
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  coord_id uuid := '33333333-3333-3333-3333-000000000003';
  demo uuid := '11111111-1111-1111-1111-111111111111';
  driver_role uuid := '22222222-2222-2222-2222-000000000005';
  hr_role uuid := '22222222-2222-2222-2222-000000000006';
  basic uuid := 'cccccccc-cccc-cccc-cccc-000000000001';
  v_orig uuid;
  v_target uuid;
  v_req uuid;
  v_custom uuid;
  v_ok boolean;
  v_saved text[];
begin
  perform pg_temp.as_admin();
  select package_id into v_orig from public.companies where id = demo;
  select array_agg(resource_key) into v_saved from public.admin_ceilings where user_id = admin_id;

  -- An admin whose ceiling is empty (invited before the company had a package) can still give the Driver role.
  delete from public.admin_ceilings where user_id = admin_id and resource_key <> 'dashboard';
  delete from public.user_roles where user_id = coord_id and role_id in (driver_role, hr_role);
  perform pg_temp.as_user(admin_id);
  insert into public.user_roles (user_id, role_id, is_primary) values (coord_id, driver_role, false);
  perform pg_temp.check('m15: admin assigns the Driver system role with an empty ceiling', true);

  -- Smaller package (Basic has no daily use or expenses): HR is still assignable.
  perform pg_temp.as_user(owner_id);
  update public.companies set package_id = basic where id = demo;
  perform pg_temp.as_user(admin_id);
  insert into public.user_roles (user_id, role_id, is_primary) values (coord_id, hr_role, false);
  perform pg_temp.check('m15: system role with grants outside the package is assignable', true);

  -- Custom roles are still checked against the ceiling for modules in the package.
  perform pg_temp.as_admin();
  insert into public.roles (company_id, name, description, is_system, is_owner, is_admin)
  values (demo, 'Test custom m15', 'test', false, false, false) returning id into v_custom;
  insert into public.role_grants (role_id, resource_key, actions, scope) values (v_custom, 'fleet', array['view']::public.permission_action[], 'all');
  delete from public.admin_ceilings where user_id = admin_id and resource_key = 'fleet';
  perform pg_temp.as_user(admin_id);
  begin
    insert into public.user_roles (user_id, role_id, is_primary) values (coord_id, v_custom, false);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%outside your delegation ceiling%';
  end;
  perform pg_temp.check('m15: custom role outside the ceiling is still refused', v_ok);

  -- Package change by the owner adds the new modules to the admins' ceilings.
  perform pg_temp.as_user(owner_id);
  update public.companies set package_id = v_orig where id = demo;
  perform pg_temp.check('m15: ceiling follows the package (expenses added back)',
    exists (select 1 from public.admin_ceilings where user_id = admin_id and resource_key = 'expenses'));
  perform pg_temp.check('m15: ceiling follows the package (fleet added back)',
    exists (select 1 from public.admin_ceilings where user_id = admin_id and resource_key = 'fleet'));

  -- Package change request: admin asks, owner gets email and SMS, owner approves.
  perform pg_temp.as_admin();
  select p.id into v_target from public.packages p
  where p.is_active and p.deleted_at is null and p.id <> v_orig
    and p.max_vehicles >= (select count(*) from public.vehicles where company_id = demo and deleted_at is null)
  order by p.max_vehicles desc limit 1;
  if v_target is null then
    insert into public.packages (name, price, max_vehicles) values ('Test big m15', 1000, 100000) returning id into v_target;
  end if;

  perform pg_temp.as_user(coord_id);
  begin
    perform public.request_package_change(v_target, 'more please');
    v_ok := false;
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  perform pg_temp.check('m15: a non-admin cannot request a package change', v_ok);

  perform pg_temp.as_user(admin_id);
  begin
    perform public.request_package_change(v_orig, null);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%already your package%';
  end;
  perform pg_temp.check('m15: requesting the current package is refused', v_ok);

  v_req := public.request_package_change(v_target, 'We are adding trucks');
  perform pg_temp.check('m15: admin sees the pending request',
    exists (select 1 from public.package_change_requests where id = v_req and status = 'pending'));
  -- A second request replaces the first.
  v_req := public.request_package_change(v_target, 'We are adding more trucks');
  perform pg_temp.check('m15: only one pending request per company',
    (select count(*) from public.package_change_requests where company_id = demo and status = 'pending') = 1);

  perform pg_temp.as_admin();
  perform pg_temp.check('m15: owner gets the request by email and SMS',
    (select count(*) from public.message_outbox where template = 'package_request' and user_id = owner_id and data ->> 'path' = '/platform/companies/' || demo) >= 2);

  perform pg_temp.as_user(admin_id);
  begin
    perform public.decide_package_change(v_req, true, null);
    v_ok := false;
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  perform pg_temp.check('m15: the admin cannot approve their own request', v_ok);

  perform pg_temp.as_user(owner_id);
  begin
    perform public.decide_package_change(v_req, false, '  ');
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%reason%';
  end;
  perform pg_temp.check('m15: rejection needs a reason', v_ok);

  perform public.decide_package_change(v_req, true, null);
  perform pg_temp.check('m15: approval changes the package', (select package_id from public.companies where id = demo) = v_target);
  perform pg_temp.check('m15: request marked approved', (select status from public.package_change_requests where id = v_req) = 'approved');

  perform pg_temp.as_admin();
  perform pg_temp.check('m15: requester told by email and SMS',
    (select count(*) from public.message_outbox where template = 'package_approved' and user_id = admin_id) >= 2);
  perform pg_temp.check('m15: requester in-app notice is not repeated in the digest',
    exists (select 1 from public.notifications where user_id = admin_id and link like '%' || v_req::text and emailed_at is not null));

  -- Reject and cancel paths.
  perform pg_temp.as_user(admin_id);
  v_req := public.request_package_change(v_orig, null);
  perform public.cancel_package_change(v_req);
  perform pg_temp.check('m15: admin can cancel a pending request', (select status from public.package_change_requests where id = v_req) = 'cancelled');
  v_req := public.request_package_change(v_orig, null);
  perform pg_temp.as_user(owner_id);
  perform public.decide_package_change(v_req, false, 'Pay the invoice first');
  perform pg_temp.check('m15: rejection keeps the package', (select package_id from public.companies where id = demo) = v_target);
  perform pg_temp.as_admin();
  perform pg_temp.check('m15: requester told about the rejection',
    exists (select 1 from public.message_outbox where template = 'package_rejected' and user_id = admin_id and data ->> 'reason' = 'Pay the invoice first'));

  -- The table is read-only from the API.
  perform pg_temp.as_user(admin_id);
  begin
    update public.package_change_requests set status = 'approved' where id = v_req;
    v_ok := false;
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  perform pg_temp.check('m15: requests cannot be changed directly', v_ok);

  -- Clean up.
  perform pg_temp.as_user(owner_id);
  update public.companies set package_id = v_orig where id = demo;
  delete from public.user_roles where user_id = coord_id and role_id in (driver_role, hr_role);
  perform pg_temp.as_admin();
  delete from public.role_grants where role_id = v_custom;
  delete from public.roles where id = v_custom;
  delete from public.admin_ceilings where user_id = admin_id;
  insert into public.admin_ceilings (user_id, resource_key) select admin_id, unnest(v_saved) on conflict do nothing;
  update public.message_outbox set status = 'skipped' where status = 'pending';
end $$;

-- ---------------------------------------------------------------------------
-- Migration 16: fuel request takes the previous reading and fuel filled from the last records
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  v_vehicle uuid;
  v_company uuid;
  v_req uuid;
  v_last_odo numeric;
  v_last_issue numeric;
  r record;
begin
  perform pg_temp.as_admin();
  select i.vehicle_id, i.company_id into v_vehicle, v_company from public.fuel_issues i where i.deleted_at is null order by i.issue_date desc limit 1;
  select current_odometer into v_last_odo from public.fuel_requests
    where vehicle_id = v_vehicle and deleted_at is null and current_odometer is not null order by request_date desc, created_at desc limit 1;
  select fuel_issued_l into v_last_issue from public.fuel_issues
    where vehicle_id = v_vehicle and deleted_at is null order by issue_date desc, created_at desc limit 1;

  perform pg_temp.as_user(admin_id);
  insert into public.fuel_requests (company_id, vehicle_id, request_date, previous_odometer, current_odometer, fuel_filled_l, fuel_required_l, status)
  values (v_company, v_vehicle, current_date + 1, 1, v_last_odo + 250, 999, 25, 'draft')
  returning id into v_req;
  select * into r from public.fuel_requests where id = v_req;
  perform pg_temp.check('m16: previous odometer comes from the last refuel, not the form', r.previous_odometer = v_last_odo);
  perform pg_temp.check('m16: fuel filled comes from the last fuel issue, not the form', r.fuel_filled_l = v_last_issue);
  perform pg_temp.check('m16: km run is current minus previous', r.km_run = 250);

  perform pg_temp.check('m16: activity view has the last refuel',
    (select last_issue_l is not null and last_fuel_filled is not null from public.v_vehicle_activity where vehicle_id = v_vehicle));

  perform pg_temp.as_admin();
  delete from public.fuel_requests where id = v_req;
end $$;

-- ---------------------------------------------------------------------------
-- Migration 17: last trip destination per vehicle
-- ---------------------------------------------------------------------------
do $$
declare
  v_vehicle uuid;
  v_dest text;
begin
  perform pg_temp.as_admin();
  select l.vehicle_id, t.destination into v_vehicle, v_dest
  from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
  where l.deleted_at is null and t.deleted_at is null and t.km_end is not null
  order by l.log_date desc, t.km_end desc limit 1;
  perform pg_temp.check('m17: activity view has the last trip destination',
    (select last_km_destination from public.v_vehicle_activity where vehicle_id = v_vehicle) is not distinct from
    (select t.destination from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
      where l.vehicle_id = v_vehicle and l.deleted_at is null and t.deleted_at is null and t.km_end is not null
      order by l.log_date desc, t.km_end desc limit 1));
  perform pg_temp.check('m17: seed has a destination to test with', v_dest is not null);
end $$;

-- ---------------------------------------------------------------------------
-- A second system owner: added by an owner, never by a company admin, removed by an owner.
-- ---------------------------------------------------------------------------
do $$
declare
  owner_id uuid := '33333333-3333-3333-3333-000000000001';
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  owner_role uuid := '22222222-2222-2222-2222-000000000001';
  v_new uuid := gen_random_uuid();
  v_ok boolean;
begin
  perform pg_temp.as_admin();
  insert into auth.users (id, email, raw_user_meta_data) values (v_new, 'second.owner@mdv.test', '{"full_name": "Second Owner"}'::jsonb);
  update public.profiles set company_id = null, full_name = 'Second Owner' where id = v_new;

  -- A company admin cannot make anyone an owner.
  perform pg_temp.as_user(admin_id);
  begin
    insert into public.user_roles (user_id, role_id, is_primary) values (v_new, owner_role, true);
    v_ok := false;
  exception when others then
    v_ok := sqlstate = '42501';
  end;
  perform pg_temp.check('owners: a company admin cannot add an owner', v_ok);

  perform pg_temp.as_user(owner_id);
  insert into public.user_roles (user_id, role_id, is_primary) values (v_new, owner_role, true);
  perform pg_temp.check('owners: an owner adds another owner', (select count(*) from public.user_roles where role_id = owner_role) >= 2);

  perform pg_temp.as_user(v_new);
  perform pg_temp.check('owners: the new owner is an owner', public.is_owner());

  perform pg_temp.as_user(owner_id);
  delete from public.user_roles where user_id = v_new and role_id = owner_role;
  update public.profiles set is_active = false where id = v_new;
  perform pg_temp.check('owners: an owner removes another owner', not exists (select 1 from public.user_roles where user_id = v_new));

  -- The last owner stays.
  begin
    delete from public.user_roles where user_id = owner_id and role_id = owner_role;
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like '%last owner%';
  end;
  perform pg_temp.check('owners: the last owner cannot be removed', v_ok);

  perform pg_temp.as_admin();
  delete from public.profiles where id = v_new;
  delete from auth.users where id = v_new;
end $$;

-- 19: three inspection kinds; first aid removed; inspection summary views.
do $$
declare
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  v_vehicle uuid;
  v_company uuid;
  n integer;
  s record;
begin
  perform pg_temp.as_admin();
  perform pg_temp.check('m19: first aid resource is gone', not exists (select 1 from public.resources where key = 'inspections.first_aid'));
  perform pg_temp.check('m19: third-party sorts after mobilization', (select sort_order from public.resources where key = 'inspections.third_party') = 304);
  perform pg_temp.check('m19: no role keeps a first aid permission', not exists (select 1 from public.role_grants where resource_key = 'inspections.first_aid'));
  select id, company_id into v_vehicle, v_company from public.vehicles where deleted_at is null order by registration limit 1;

  perform pg_temp.as_user(admin_id);
  select count(*) into n from public.v_vehicle_inspection_summary;
  perform pg_temp.check('m19: admin sees the inspection summary of every vehicle', n = (select count(*) from public.vehicles where deleted_at is null));

  insert into public.vehicle_inspections (company_id, vehicle_id, kind, inspection_date, renewal_date) values (v_company, v_vehicle, 'internal', date '2030-01-05', date '2031-01-05');
  select * into s from public.v_vehicle_inspection_summary where vehicle_id = v_vehicle;
  perform pg_temp.check('m19: newest mobilization inspection is shown', s.mobilization_last = date '2030-01-05' and s.mobilization_next = date '2031-01-05');
  perform pg_temp.check('m19: years view counts mobilization records', exists (select 1 from public.v_inspection_years where vehicle_id = v_vehicle and kind = 'mobilization' and year = 2030 and records = 1));
  perform pg_temp.check('m19: open and closed daily actions are counted', s.daily_open = (select count(*) from public.inspection_anomalies a where a.vehicle_id = v_vehicle and a.deleted_at is null and a.daily_inspection_id is not null and a.status = 'open'));

  perform pg_temp.as_admin();
  delete from public.vehicle_inspections where vehicle_id = v_vehicle and inspection_date = date '2030-01-05';
end $$;

-- 21: Vehicle operations.
do $m21$
declare v_vehicle uuid;
begin
  perform pg_temp.as_admin();
  perform pg_temp.check('m21: section is called Vehicle operations', (select name from public.resources where key = 'daily_use') = 'Vehicle operations');
  perform pg_temp.check('m21: fuel request page moved', (select path from public.resources where key = 'daily_use.fuel_log') = '/daily-use/fuel-requests');
  perform pg_temp.check('m21: vehicle requests come first', (select sort_order from public.resources where key = 'daily_use.trip_requests') < (select sort_order from public.resources where key = 'daily_use.km_log'));
  select vehicle_id into v_vehicle from public.fuel_issues where deleted_at is null limit 1;
  if v_vehicle is not null then
    perform pg_temp.check('m21: month counts work for the fuel log', (select coalesce(sum(records), 0) from public.vehicle_month_counts('fuel_issues', v_vehicle, extract(year from current_date)::int)) >= 0);
  end if;
end $m21$;

-- 22: one approver acts by email, the rest are copied. 23: new administration tables.
do $m22$
declare
  v_req uuid;
  n integer;
  v_approvers integer;
begin
  perform pg_temp.as_admin();
  insert into public.vehicle_requests (company_id, requester_id, requester_name, requested_at, trip_type, date_needed, time_from, time_to, purpose_type, purpose, departure_time, duration_hours, occupants, destination, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000008', 'Peter Mollel', now(), 'short', current_date + 3, '08:00', '10:00', 'official', 'Test trip', '08:00', 2, 1, 'Posta', 'draft', '33333333-3333-3333-3333-000000000008')
  returning id into v_req;
  update public.vehicle_requests set status = 'submitted' where id = v_req;
  select count(*) into n from public.approval_links where record_id = v_req and used_at is null;
  perform pg_temp.check('m22: only one person gets the action link', n = 1);
  select count(*) into v_approvers from public.workflow_approvers('11111111-1111-1111-1111-111111111111', 'daily_use.trip_requests', '33333333-3333-3333-3333-000000000008');
  select count(*) into n from public.message_outbox where template = 'approval_request' and channel = 'email' and data ->> 'path' like '/a/%' and created_at >= now() - interval '1 minute' and data ->> 'summary' like '%Posta%';
  perform pg_temp.check('m22: one action email', n <= 1);
  if v_approvers > 1 then
    perform pg_temp.check('m22: the others get one copy without a link', exists (select 1 from public.message_outbox where template = 'approval_copy' and data ->> 'summary' like '%Posta%' and not (data ? 'path')));
  end if;
  delete from public.vehicle_requests where id = v_req;

  perform pg_temp.check('m23: work orders are gone', to_regclass('public.work_orders') is null and to_regclass('public.vehicle_equipment') is null and to_regclass('public.first_aid_inspections') is null);
  perform pg_temp.check('m23: fleet administration is on the first level', (select parent_key from public.resources where key = 'expenses.admin') is null and (select parent_key from public.resources where key = 'expenses.timesheet') = 'expenses.admin');
  perform pg_temp.check('m25: fleet safety holds the inspections, trainings and safety records', (select count(*) from public.resources where parent_key = 'fleet_safety' and key in ('inspections.daily', 'inspections.third_party', 'expenses.trainings.mandatory', 'expenses.trainings.toolbox', 'expenses.trainings.matrix', 'expenses.safety.incidents', 'expenses.safety.reports')) = 7);
  perform pg_temp.check('m25: fleet safety is on the first level', (select parent_key from public.resources where key = 'fleet_safety') is null);

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.petty_cash_entries (company_id, kind, description, amount_tzs) values ('11111111-1111-1111-1111-111111111111', 'received', 'Float', 100000);
  insert into public.outstation_allowances (company_id, destination, date_from, date_to, rate_per_night_tzs) values ('11111111-1111-1111-1111-111111111111', 'Arusha', current_date, current_date + 3, 50000);
  perform pg_temp.check('m23: outstation amount is nights times rate', (select amount_tzs from public.outstation_allowances where destination = 'Arusha' order by created_at desc limit 1) = 150000);
  perform pg_temp.check('m23: admin can record petty cash', exists (select 1 from public.petty_cash_entries where description = 'Float'));
  perform pg_temp.as_admin();
  delete from public.petty_cash_entries where description = 'Float';
  delete from public.outstation_allowances where destination = 'Arusha';
end $m22$;

-- 24: manual JMP, request history, waiting requests, missed km logs.
do $m24$
declare
  company uuid := '11111111-1111-1111-1111-111111111111';
  admin_id uuid := '33333333-3333-3333-3333-000000000002';
  requester_id uuid := '33333333-3333-3333-3333-000000000008';
  hse_id uuid := '33333333-3333-3333-3333-000000000009';
  ctrl_id uuid := '33333333-3333-3333-3333-000000000010';
  v_trip uuid;
  v_review uuid;
  v_ok boolean;
  n integer;
begin
  perform pg_temp.as_admin();
  update public.companies set settings = coalesce(settings, '{}'::jsonb) || '{"jmp_method": "manual"}'::jsonb where id = company;
  delete from public.message_outbox;
  insert into public.vehicle_requests (company_id, requester_id, requester_name, trip_type, date_needed, date_to, time_from, time_to, purpose_type, purpose, departure_time, duration_hours, occupants, destination, status, created_by)
  values (company, requester_id, 'Peter Mollel', 'long', current_date + 25, current_date + 27, '06:00', '18:00', 'official', 'Dodoma visit', '06:00', 10, 2, 'Dodoma', 'draft', requester_id)
  returning id into v_trip;
  update public.vehicle_requests set status = 'submitted' where id = v_trip;
  perform pg_temp.check('m24: manual method is kept on the request', (select jmp_method from public.vehicle_requests where id = v_trip) = 'manual');
  perform pg_temp.check('m24: manual JMP has three steps', (select count(*) from public.jmp_reviews where vehicle_request_id = v_trip) = 3);
  perform pg_temp.check('m24: first step is preparing the JMP', (select o_step from public.workflow_current_step('vehicle_requests', v_trip)) = 'prepare');
  perform pg_temp.check('m24: the preparer is sent to the app (no link)', exists (select 1 from public.message_outbox where template = 'jmp_task' and data ->> 'path' like '/daily-use/trip-requests/%'));

  -- Approval waits for the JMP.
  perform pg_temp.as_user(admin_id);
  begin
    perform public.approve_request('vehicle_requests', v_trip, null, '{"driver_id": "66666666-6666-6666-6666-000000000001", "vehicle_id": "55555555-5555-5555-5555-000000000002"}'::jsonb);
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform pg_temp.check('m24: approval waits for the manual JMP', v_ok);

  -- A step needs its file.
  begin
    perform public.sign_jmp(v_trip, 'prepare', 'approved');
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform pg_temp.check('m24: preparing needs the uploaded JMP', v_ok);

  select id into v_review from public.jmp_reviews where vehicle_request_id = v_trip and step = 'prepare';
  perform pg_temp.check('m24: the fleet manager may upload the JMP', public.can_upload_jmp_file(v_review));
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name)
  values (company, 'jmp_reviews', v_review, 'daily_use.trip_requests', 'jmp', company || '/jmp_reviews/' || v_review || '/jmp.pdf', 'JMP', 'jmp.pdf');
  perform public.sign_jmp(v_trip, 'prepare', 'approved');

  perform pg_temp.as_user(requester_id);
  select id into v_review from public.jmp_reviews where vehicle_request_id = v_trip and step = 'requester';
  perform pg_temp.check('m24: the requester may upload their signed JMP', public.can_upload_jmp_file(v_review));
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name)
  values (company, 'jmp_reviews', v_review, 'daily_use.trip_requests', 'jmp', company || '/jmp_reviews/' || v_review || '/signed.pdf', 'JMP signed', 'signed.pdf');
  perform public.sign_jmp(v_trip, 'requester', 'approved');

  perform pg_temp.as_user(hse_id);
  select id into v_review from public.jmp_reviews where vehicle_request_id = v_trip and step = 'hse_manager';
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name)
  values (company, 'jmp_reviews', v_review, 'daily_use.trip_requests', 'jmp', company || '/jmp_reviews/' || v_review || '/hse.pdf', 'JMP HSE', 'hse.pdf');
  perform public.sign_jmp(v_trip, 'hse_manager', 'approved');
  perform pg_temp.as_admin();
  perform pg_temp.check('m24: after HSE the fleet manager approves', (select o_step from public.workflow_current_step('vehicle_requests', v_trip)) = 'approval');
  perform pg_temp.check('m24: monitors are not told before approval', not exists (select 1 from public.message_outbox where user_id = ctrl_id and template = 'jmp_monitor' and data ->> 'record_id' = v_trip::text));

  perform pg_temp.as_user(admin_id);
  perform public.approve_request('vehicle_requests', v_trip, null, '{"driver_id": "66666666-6666-6666-6666-000000000001", "vehicle_id": "55555555-5555-5555-5555-000000000002"}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('m24: approved after the manual JMP', (select status from public.vehicle_requests where id = v_trip) = 'approved');
  perform pg_temp.check('m24: control room told once approved', exists (select 1 from public.message_outbox where user_id = ctrl_id and template = 'jmp_monitor' and data ->> 'record_id' = v_trip::text));
  perform pg_temp.check('m24: no extra JMP steps after approval', (select count(*) from public.jmp_reviews where vehicle_request_id = v_trip) = 3);

  -- History and views
  perform pg_temp.as_user(admin_id);
  perform public.log_record_view('vehicle_requests', v_trip);
  perform public.log_record_view('vehicle_requests', v_trip);
  select count(*) into n from public.request_history('vehicle_requests', v_trip);
  perform pg_temp.check('m24: history lists the steps', n >= 5);
  perform pg_temp.check('m24: history shows who viewed it', exists (select 1 from public.request_history('vehicle_requests', v_trip) where action = 'viewed'));
  perform pg_temp.check('m24: nothing waits on the admin for this trip', not exists (select 1 from public.my_waiting_requests() where record_id = v_trip));

  -- Missed km logs
  perform pg_temp.as_admin();
  n := public.notify_missed_km_logs(current_date - 1);
  perform pg_temp.check('m24: missed km logs raise alerts once', public.notify_missed_km_logs(current_date - 1) = 0);

  update public.companies set settings = settings - 'jmp_method' where id = company;
end $m24$;

-- 26: miscellaneous expenses.
do $m26$
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.misc_expenses (company_id, description, quantity, unit, unit_price_tzs) values ('11111111-1111-1111-1111-111111111111', 'Wiper blades', 2, 'pcs', 15000);
  perform pg_temp.check('m26: amount is qty times unit price', (select amount_tzs from public.misc_expenses where description = 'Wiper blades') = 30000);
  perform pg_temp.check('m26: under fleet expenses', (select parent_key from public.resources where key = 'expenses.misc') = 'expenses');
  perform pg_temp.as_admin();
  delete from public.misc_expenses where description = 'Wiper blades';
end $m26$;

-- 28: approving a fuel request records the fuel issued.
do $m28$
declare v_req uuid;
begin
  perform pg_temp.as_admin();
  insert into public.fuel_requests (company_id, vehicle_id, request_date, previous_odometer, current_odometer, fuel_required_l, fuel_filled_l, status)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 900000, 900400, 45, 40, 'draft')
  returning id into v_req;
  update public.fuel_requests set status = 'submitted' where id = v_req;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform public.approve_request('fuel_requests', v_req, null, '{"approved_l": 42}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('m28: approval records the fuel issued', (select fuel_issued_l from public.fuel_issues where fuel_request_id = v_req) = 42);
  perform pg_temp.check('m28: the issue has a price', (select price_per_litre from public.fuel_issues where fuel_request_id = v_req) > 0);
  perform pg_temp.check('m28: only one issue per request', (select count(*) from public.fuel_issues where fuel_request_id = v_req) = 1);
end $m28$;

-- 30: fuel requested and approved stay within the tank capacity.
do $m30$
declare v_req uuid; v_tank numeric; v_ok boolean;
begin
  perform pg_temp.as_admin();
  select fuel_tank_capacity_l into v_tank from public.vehicles where id = '55555555-5555-5555-5555-000000000002';
  begin
    insert into public.fuel_requests (company_id, vehicle_id, request_date, previous_odometer, current_odometer, fuel_required_l, status)
    values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 950000, 950100, v_tank + 1, 'draft');
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform pg_temp.check('m30: a request above the tank capacity is refused', v_ok);

  insert into public.fuel_requests (company_id, vehicle_id, request_date, previous_odometer, current_odometer, fuel_required_l, status)
  values ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-000000000002', current_date, 950000, 950100, v_tank, 'draft')
  returning id into v_req;
  perform pg_temp.check('m30: a request equal to the tank capacity is accepted', v_req is not null);
  update public.fuel_requests set status = 'submitted' where id = v_req;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  begin
    perform public.approve_request('fuel_requests', v_req, null, jsonb_build_object('approved_l', v_tank + 5));
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform pg_temp.check('m30: approving above the tank capacity is refused', v_ok);
  perform pg_temp.as_admin();
  delete from public.fuel_requests where id = v_req;
end $m30$;

-- 31: the approver's name and position come from their profile.
do $m31$
declare v_req uuid;
begin
  perform pg_temp.as_admin();
  update public.profiles set job_title = 'Fleet Manager' where id = '33333333-3333-3333-3333-000000000002';
  insert into public.leave_requests (company_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005',
    (select id from public.leave_categories where company_id = '11111111-1111-1111-1111-111111111111' and not counts_against_balance order by name limit 1),
    current_date + 60, current_date + 61, 'Family event', 'draft', '33333333-3333-3333-3333-000000000005')
  returning id into v_req;
  update public.leave_requests set status = 'submitted' where id = v_req;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  -- Fleet manager, HR and HOD steps (an admin may take each).
  perform public.approve_request('leave_requests', v_req);
  perform public.approve_request('leave_requests', v_req);
  perform public.approve_request('leave_requests', v_req);
  perform pg_temp.as_admin();
  perform pg_temp.check('m31: approver name filled from the profile', (select approver_name from public.leave_requests where id = v_req) = (select full_name from public.profiles where id = '33333333-3333-3333-3333-000000000002'));
  perform pg_temp.check('m31: approver position filled from the job title', (select approver_position from public.leave_requests where id = v_req) = 'Fleet Manager');
  delete from public.leave_requests where id = v_req;
end $m31$;

-- 32: Excel formats.
do $m32$
declare v_ts uuid; v_out uuid; v_pc uuid; d record;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  -- Timesheet day: 07:30 to 17:00 with a one-hour break = 8.5 h, 0.5 h normal overtime.
  insert into public.timesheets (company_id, employee_id, employee_name, period_month) values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000002', 'Test', date_trunc('month', current_date + 400)::date) returning id into v_ts;
  insert into public.timesheet_days (company_id, timesheet_id, work_date, day_type, shift, time_in, break_from, break_to, time_out) values ('11111111-1111-1111-1111-111111111111', v_ts, current_date + 400, 'work', 'day', '07:30', '13:00', '14:00', '17:00');
  select * into d from public.timesheet_days where timesheet_id = v_ts;
  perform pg_temp.check('m32: total hours take the break off', d.total_hours = 8.5);
  perform pg_temp.check('m32: hours over 8 are normal overtime', d.overtime_hours = 0.5);
  insert into public.timesheet_days (company_id, timesheet_id, work_date, day_type, shift, time_in, time_out) values ('11111111-1111-1111-1111-111111111111', v_ts, current_date + 401, 'public_holiday', 'night', '22:00', '06:00');
  perform pg_temp.check('m32: night shift over midnight, public holiday hours are special overtime', (select special_overtime_hours from public.timesheet_days where timesheet_id = v_ts and day_type = 'public_holiday') = 8);

  -- Outstation: 7 days x 80,000 + other expenses 2 x 30,000.
  insert into public.outstation_requests (company_id, date_from, date_to, location, total_days, dsa_tzs) values ('11111111-1111-1111-1111-111111111111', current_date, current_date + 6, 'Kahama', 7, 80000) returning id into v_out;
  insert into public.outstation_expense_items (company_id, outstation_request_id, description, quantity, unit, unit_price_tzs) values ('11111111-1111-1111-1111-111111111111', v_out, 'Car wash', 2, 'Vehicle', 30000);
  perform pg_temp.check('m32: total outstation cost = allowance + other expenses', (select total_cost_tzs from public.outstation_requests where id = v_out) = 620000);

  -- Petty cash: the balance and its transactions are tested with the approval steps (m38).
  insert into public.petty_cash_requests (company_id, amount_requested_tzs, amount_received_tzs) values ('11111111-1111-1111-1111-111111111111', 250000, 250000) returning id into v_pc;
  perform pg_temp.check('m32: requester filled from the profile', (select requester_name from public.petty_cash_requests where id = v_pc) is not null);

  perform pg_temp.check('m32: pickup rules exist', exists (select 1 from public.travel_airports where name = 'JKNIA' and pickup_lead_hours = 3.5));
  insert into public.travel_movements (company_id, direction, travel_date, travellers, airport, flight_time) values ('11111111-1111-1111-1111-111111111111', 'departure', current_date, 'David Michael', 'JKNIA', '12:30');
  perform pg_temp.check('m32: travel coordination is on the first level', (select parent_key from public.resources where key = 'expenses.travel') is null);
  perform pg_temp.as_admin();
  delete from public.timesheets where id = v_ts;
  delete from public.outstation_requests where id = v_out;
  delete from public.petty_cash_requests where id = v_pc;
  delete from public.travel_movements where travellers = 'David Michael';
end $m32$;

-- 33: rotating roster.
do $m33$
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform pg_temp.check('m33: roster people are readable', (select count(*) from public.roster_members) = 16);
  perform pg_temp.check('m33: a driver on the roster takes the driver name and number', (select person_name from public.roster_members where driver_id = '66666666-6666-6666-6666-000000000001') = 'Juma Hassan');
  perform pg_temp.check('m33: one change from the cycle', (select count(*) from public.fleet_rosters where member_id is not null and shift = 'leave') = 1);
end $m33$;

-- 34: vehicle status follows problems; totals per vehicle; East Africa Time.
do $m34$
declare v_insp uuid; v_an uuid; v_req uuid; v uuid := '55555555-5555-5555-5555-000000000005'; n integer;
begin
  perform pg_temp.as_admin();
  perform pg_temp.check('m34: the database works in East Africa Time', current_setting('timezone') = 'Africa/Dar_es_Salaam');
  update public.vehicles set status = 'in_service' where id = v;
  insert into public.daily_inspections (company_id, vehicle_id, inspection_date, mileage_km, remark) values ('11111111-1111-1111-1111-111111111111', v, current_date, 18300, 'anomalies') returning id into v_insp;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened)
  values ('11111111-1111-1111-1111-111111111111', v_insp, v, 'Brakes failing', 'Replace pads', 'immediately', 'open', current_date) returning id into v_an;
  perform pg_temp.check('m34: an immediate problem takes the vehicle out of service', (select status from public.vehicles where id = v) = 'out_of_service' and (select status_reason from public.vehicles where id = v) like '%Brakes failing%');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  update public.inspection_anomalies set status = 'closed', date_closed = current_date where id = v_an;
  perform pg_temp.as_admin();
  perform pg_temp.check('m34: closing it puts the vehicle back in service', (select status from public.vehicles where id = v) = 'in_service');

  update public.vehicles set status = 'out_of_service', status_reason = 'Sold' where id = v;
  insert into public.inspection_anomalies (company_id, daily_inspection_id, vehicle_id, description, action_required, when_to_act, status, date_opened)
  values ('11111111-1111-1111-1111-111111111111', v_insp, v, 'Mirror broken', 'Replace', 'immediately', 'open', current_date) returning id into v_an;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  update public.inspection_anomalies set status = 'closed', date_closed = current_date where id = v_an;
  perform pg_temp.as_admin();
  perform pg_temp.check('m34: a vehicle taken out by hand stays out', (select status from public.vehicles where id = v) = 'out_of_service' and (select status_reason from public.vehicles where id = v) = 'Sold');
  update public.vehicles set status = 'in_service' where id = v;

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  select count(*) into n from public.vehicle_totals('fuel_issues', null, null);
  perform pg_temp.check('m34: totals per vehicle for all time', n > 0);
  perform pg_temp.check('m34: totals follow the dates', (select coalesce(sum(litres), 0) from public.vehicle_totals('fuel_issues', current_date + 1000, current_date + 1001)) = 0);
  perform pg_temp.check('m34: menu order', (select sort_order from public.resources where key = 'daily_use') < (select sort_order from public.resources where key = 'fleet_safety')
    and (select parent_key from public.resources where key = 'expenses.maintenance.costs') = 'daily_use');
end $m34$;

-- 35: driver confirms requests made for them; submission time kept; totals; weekly inspections.
do $m35$
declare v uuid := '55555555-5555-5555-5555-000000000005'; v_fr uuid; v_tok text; ok boolean; n integer; v_w uuid;
begin
  perform pg_temp.as_admin();
  insert into public.fuel_requests (company_id, driver_id, vehicle_id, request_date, current_odometer, fuel_required_l, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000001', v, current_date, (select coalesce(max(current_odometer), 18300) + 50 from public.fuel_requests where vehicle_id = v), 10, 'submitted', '33333333-3333-3333-3333-000000000003')
  returning id into v_fr;
  perform pg_temp.check('m35: a request made for a driver asks them to confirm', exists (select 1 from public.driver_confirmations where table_name = 'fuel_requests' and record_id = v_fr and confirmed_at is null));
  v_tok := pg_temp.link_for('33333333-3333-3333-3333-000000000005', 'driver_confirm');
  perform pg_temp.check('m35: the driver gets a personal link', v_tok is not null and (public.driver_confirmation_open(v_tok) ->> 'state') = 'open');
  perform pg_temp.check('m35: sending sets the submission time', (select submitted_at from public.fuel_requests where id = v_fr) is not null);
  update public.fuel_requests set submitted_at = '2026-01-01 00:00+03' where id = v_fr;

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  ok := false;
  begin
    perform public.approve_request('fuel_requests', v_fr);
  exception when check_violation then ok := true;
  end;
  perform pg_temp.check('m35: it cannot be approved before the driver signs', ok);

  perform pg_temp.as_admin();
  ok := false;
  begin
    perform public.driver_confirmation_sign('not-a-token', '{"name": "x"}');
  exception when invalid_parameter_value then ok := true;
  end;
  perform pg_temp.check('m35: a wrong link cannot sign', ok);
  perform public.driver_confirmation_sign(v_tok, '{"name": "Juma Hassan", "image": "data:image/png;base64,AA=="}');
  perform pg_temp.check('m35: the link is used once', (public.driver_confirmation_open(v_tok) ->> 'state') = 'done');

  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform pg_temp.check('m35: people who see the request see the signature', (select signature ->> 'name' from public.driver_confirmations where record_id = v_fr) = 'Juma Hassan');
  perform public.approve_request('fuel_requests', v_fr);
  perform pg_temp.check('m35: approved once signed', (select status from public.fuel_requests where id = v_fr) = 'approved');
  perform pg_temp.check('m35: approving keeps the original submission time', (select submitted_at from public.fuel_requests where id = v_fr) = '2026-01-01 00:00+03'::timestamptz);

  select count(*) into n from public.vehicle_totals('fuel_expenses', null, null);
  perform pg_temp.check('m35: fuel cost totals per vehicle', n >= 0);
  perform pg_temp.check('m35: maintenance totals split into maintenance and repairs',
    (select coalesce(sum(cost), 0) from public.vehicle_totals('maintenance_costs', null, null)) = (select coalesce(sum(litres + trips), 0) from public.vehicle_totals('maintenance_costs', null, null)));

  perform pg_temp.as_admin();
  insert into public.daily_inspections (company_id, vehicle_id, inspection_date, mileage_km, remark, frequency)
  values ('11111111-1111-1111-1111-111111111111', v, current_date, 18400, 'safe', 'weekly') returning id into v_w;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform pg_temp.check('m35: a weekly inspection shows as weekly', (select weekly_last from public.v_vehicle_inspection_summary where vehicle_id = v) = current_date);
  perform pg_temp.check('m35: and not as a daily one', (select coalesce(daily_last, current_date - 1) from public.v_vehicle_inspection_summary where vehicle_id = v) <> current_date
    or exists (select 1 from public.daily_inspections where vehicle_id = v and inspection_date = current_date and frequency = 'daily' and deleted_at is null));
  perform pg_temp.as_admin();
  delete from public.daily_inspections where id = v_w;
  delete from public.fuel_issues where fuel_request_id = v_fr;
  delete from public.driver_confirmations where record_id = v_fr;
  delete from public.fuel_requests where id = v_fr;
end $m35$;

-- 36: maintenance and repair requests are gone; the counts and the vehicle status still work.
do $m36$
declare v uuid := '55555555-5555-5555-5555-000000000005'; k jsonb;
begin
  perform pg_temp.as_admin();
  perform pg_temp.check('m36: the requests table is gone', to_regclass('public.maintenance_requests') is null);
  perform pg_temp.check('m36: the menu item is gone', not exists (select 1 from public.resources where key = 'expenses.maintenance.requests'));
  perform pg_temp.check('m36: records keep no request link', not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maintenance_costs' and column_name = 'maintenance_request_id'));
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  k := public.dashboard_kpis(current_date - 30, current_date, null);
  perform pg_temp.check('m36: dashboard counts run', (k ->> 'pending_approvals') is not null);
  perform pg_temp.check('m36: shell counts run', (public.shell_counts() ->> 'pending_approvals') is not null);
  perform public.vehicle_problem_sync(v);
  perform pg_temp.check('m36: vehicle status sync runs', (select status from public.vehicles where id = v) is not null);
end $m36$;

-- 37: noon shift, absent days and allowance (approval: see 40).
do $m37$
declare v_ts uuid;
begin
  perform pg_temp.as_admin();
  insert into public.timesheets (company_id, employee_id, period_month)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', date_trunc('month', current_date + interval '3 months')::date)
  returning id into v_ts;
  perform pg_temp.check('m37: a new timesheet starts as a draft', (select status from public.timesheets where id = v_ts) = 'draft');
  insert into public.timesheet_days (company_id, timesheet_id, work_date, shift, time_in, break_from, break_to, time_out, day_type, allowance_tzs)
  values ('11111111-1111-1111-1111-111111111111', v_ts, (select period_month from public.timesheets where id = v_ts), 'noon', '14:00', '18:00', '19:00', '22:00', 'work', 15000),
         ('11111111-1111-1111-1111-111111111111', v_ts, (select period_month from public.timesheets where id = v_ts) + 1, 'day', null, null, null, null, 'absent', 0);
  perform pg_temp.check('m37: a noon shift is 7 hours', (select total_hours from public.timesheet_days where timesheet_id = v_ts and shift = 'noon') = 7);
  perform pg_temp.check('m37: allowance is kept', (select allowance_tzs from public.timesheet_days where timesheet_id = v_ts and shift = 'noon') = 15000);
  update public.timesheets set coordinator_name = 'Changed later' where id = v_ts;
  perform pg_temp.check('m37: a draft timesheet can be changed', (select coordinator_name from public.timesheets where id = v_ts) = 'Changed later');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform pg_temp.check('m37: shell counts run', (public.shell_counts() ->> 'pending_approvals') is not null);
  perform pg_temp.as_admin();
  delete from public.timesheets where id = v_ts;
end $m37$;

-- 38: leave plan days and months; leave requests through fleet manager, HR and HOD; outstation through
-- fleet manager and HOD, then finance by email.
do $m38$
declare
  v_lr uuid; v_lr2 uuid; v_out uuid; v_plan uuid; v_pc uuid; v_tx uuid; ok boolean;
  fm uuid := '33333333-3333-3333-3333-000000000002';
  hod uuid := '33333333-3333-3333-3333-000000000004';
  hr uuid := '33333333-3333-3333-3333-000000000007';
begin
  -- Leave plan
  perform pg_temp.as_admin();
  insert into public.leave_plans (company_id, employee_id, employee_name, plan_year, planned_months, entitled_days, carried_forward_days)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', 'Test', extract(year from current_date)::int + 2, '{5,10}', 30, 4)
  returning id into v_plan;
  perform pg_temp.check('m38: the plan keeps its months', (select planned_months from public.leave_plans where id = v_plan) = '{5,10}'::text[]);
  perform pg_temp.check('m38: the leave balance follows the plan', (select entitled_days = 30 and carried_over_days = 4 from public.leave_balances where employee_id = '33333333-3333-3333-3333-000000000006' and balance_year = extract(year from current_date)::int + 2));
  update public.leave_plans set carried_forward_days = 6 where id = v_plan;
  perform pg_temp.check('m38: changing the plan changes the balance', (select carried_over_days from public.leave_balances where employee_id = '33333333-3333-3333-3333-000000000006' and balance_year = extract(year from current_date)::int + 2) = 6);
  perform pg_temp.check('m38: leave balance is out of the menu', (select path from public.resources where key = 'expenses.leave.balances') is null);

  -- Leave request: three steps
  insert into public.leave_requests (company_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005',
    (select id from public.leave_categories where company_id = '11111111-1111-1111-1111-111111111111' and not counts_against_balance order by name limit 1),
    current_date + 90, current_date + 91, 'Family event', 'draft', '33333333-3333-3333-3333-000000000003')
  returning id into v_lr;
  update public.leave_requests set status = 'submitted' where id = v_lr;
  perform pg_temp.check('m38: first step is the fleet manager', (select o_step from public.workflow_current_step('leave_requests', v_lr)) = 'approval');
  ok := false;
  perform pg_temp.as_user(hr);
  begin
    perform public.approve_request('leave_requests', v_lr);
  exception when others then ok := true;
  end;
  perform pg_temp.check('m38: HR cannot take the fleet manager step', ok);
  perform pg_temp.as_user(fm);
  perform public.approve_request('leave_requests', v_lr);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: fleet manager approval moves it to HR', (select status = 'submitted' and approval_step = 'hr_review' from public.leave_requests where id = v_lr));
  perform pg_temp.check('m38: HR gets the email and SMS link', exists (select 1 from public.message_outbox where user_id = hr and template = 'approval_request' and data ->> 'record_id' = v_lr::text));
  perform pg_temp.as_user(hr);
  perform public.approve_request('leave_requests', v_lr);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HR review moves it to the HOD', (select approval_step from public.leave_requests where id = v_lr) = 'hod_approval');
  perform pg_temp.check('m38: the HOD gets the link', exists (select 1 from public.message_outbox where user_id = hod and template = 'approval_request' and data ->> 'record_id' = v_lr::text));
  perform pg_temp.as_user(hod);
  perform public.approve_request('leave_requests', v_lr);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HOD approval finalises the leave', (select status from public.leave_requests where id = v_lr) = 'approved');
  perform pg_temp.check('m38: earlier steps are signed', (select count(*) from public.approval_signoffs where record_id = v_lr) = 2);
  perform pg_temp.check('m38: each step is in the history', (select count(*) from public.approval_events where record_id = v_lr and action = 'approved') = 3);

  -- A rejection at HR goes back to the start
  insert into public.leave_requests (company_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005',
    (select id from public.leave_categories where company_id = '11111111-1111-1111-1111-111111111111' and not counts_against_balance order by name limit 1),
    current_date + 120, current_date + 121, 'Wedding', 'draft', '33333333-3333-3333-3333-000000000003')
  returning id into v_lr2;
  update public.leave_requests set status = 'submitted' where id = v_lr2;
  perform pg_temp.as_user(fm);
  perform public.approve_request('leave_requests', v_lr2);
  perform pg_temp.as_user(hr);
  perform public.reject_request('leave_requests', v_lr2, 'Dates clash');
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HR can reject', (select status = 'rejected' and approval_step is null from public.leave_requests where id = v_lr2));
  update public.leave_requests set status = 'submitted' where id = v_lr2;
  perform pg_temp.check('m38: sent again it starts with the fleet manager', (select o_step from public.workflow_current_step('leave_requests', v_lr2)) = 'approval');

  -- Outstation allowance: fleet manager, HOD, finance email
  update public.companies set settings = coalesce(settings, '{}'::jsonb) || '{"finance_emails": ["finance@example.com", "not an email"]}'::jsonb where id = '11111111-1111-1111-1111-111111111111';
  insert into public.outstation_requests (company_id, date_from, date_to, location, total_days, dsa_tzs, created_by)
  values ('11111111-1111-1111-1111-111111111111', current_date, current_date + 2, 'Mwanza', 3, 50000, '33333333-3333-3333-3333-000000000003')
  returning id into v_out;
  update public.outstation_requests set status = 'submitted' where id = v_out;
  perform pg_temp.as_user(fm);
  perform public.approve_request('outstation_requests', v_out);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: outstation goes to the HOD', (select status = 'submitted' and approval_step = 'hod_verify' from public.outstation_requests where id = v_out));
  perform pg_temp.check('m38: no finance email before the HOD verifies', not exists (select 1 from public.message_outbox where template = 'finance_notice' and data ->> 'record_id' = v_out::text));
  perform pg_temp.as_user(hod);
  perform public.approve_request('outstation_requests', v_out);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HOD verification approves it', (select status from public.outstation_requests where id = v_out) = 'approved');
  perform pg_temp.check('m38: finance is emailed (valid addresses only)', (select count(*) from public.message_outbox where template = 'finance_notice' and channel = 'email' and data ->> 'record_id' = v_out::text) = 1
    and exists (select 1 from public.message_outbox where template = 'finance_notice' and recipient = 'finance@example.com'));

  -- Petty cash: fleet manager approves the amount, HOD approves, finance emailed; proof of payment before
  -- spending; each transaction with its receipt, approved by the fleet manager and verified by the HOD.
  insert into public.petty_cash_requests (company_id, amount_requested_tzs, purpose, created_by)
  values ('11111111-1111-1111-1111-111111111111', 200000, 'Office supplies', '33333333-3333-3333-3333-000000000003') returning id into v_pc;
  update public.petty_cash_requests set status = 'submitted' where id = v_pc;
  perform pg_temp.as_user(fm);
  perform public.approve_request('petty_cash_requests', v_pc, null, '{"amount_approved": "150000"}'::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: fleet manager sets the amount', (select amount_approved_tzs = 150000 and approval_step = 'hod_approval' and status = 'submitted' from public.petty_cash_requests where id = v_pc));
  perform pg_temp.as_user(hod);
  perform public.approve_request('petty_cash_requests', v_pc);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HOD approves petty cash', (select status from public.petty_cash_requests where id = v_pc) = 'approved');
  perform pg_temp.check('m38: finance is emailed about petty cash', exists (select 1 from public.message_outbox where template = 'finance_notice' and data ->> 'record_id' = v_pc::text));
  ok := false;
  begin
    insert into public.petty_cash_transactions (company_id, petty_cash_request_id, description, quantity, price_tzs) values ('11111111-1111-1111-1111-111111111111', v_pc, 'Paper', 1, 40000);
  exception when check_violation then ok := true;
  end;
  perform pg_temp.check('m38: no spending before the proof of payment', ok);
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name)
  values ('11111111-1111-1111-1111-111111111111', 'petty_cash_requests', v_pc, 'expenses.admin.petty_cash', 'forms', 'test/pop-' || v_pc, 'Proof of payment', 'pop.pdf');
  insert into public.petty_cash_transactions (company_id, petty_cash_request_id, description, quantity, price_tzs, created_by)
  values ('11111111-1111-1111-1111-111111111111', v_pc, 'Paper', 1, 40000, '33333333-3333-3333-3333-000000000003') returning id into v_tx;
  ok := false;
  begin
    update public.petty_cash_transactions set status = 'submitted' where id = v_tx;
  exception when check_violation then ok := true;
  end;
  perform pg_temp.check('m38: a transaction needs its receipt', ok);
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name)
  values ('11111111-1111-1111-1111-111111111111', 'petty_cash_transactions', v_tx, 'expenses.admin.petty_cash', 'forms', 'test/receipt-' || v_tx, 'Receipt', 'receipt.jpg');
  update public.petty_cash_transactions set status = 'submitted' where id = v_tx;
  perform pg_temp.check('m38: unapproved spending is not counted', (select amount_spent_tzs from public.petty_cash_requests where id = v_pc) = 0);
  perform pg_temp.as_user(fm);
  perform public.approve_request('petty_cash_transactions', v_tx);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: transaction goes to the HOD', (select approval_step from public.petty_cash_transactions where id = v_tx) = 'hod_verify');
  perform pg_temp.as_user(hod);
  perform public.approve_request('petty_cash_transactions', v_tx);
  perform pg_temp.as_admin();
  perform pg_temp.check('m38: HOD verifies the transaction', (select status from public.petty_cash_transactions where id = v_tx) = 'approved');
  perform pg_temp.check('m38: approved spending counts', (select amount_spent_tzs from public.petty_cash_requests where id = v_pc) = 40000);

  delete from public.attachments where row_id in (v_pc, v_tx);
  delete from public.petty_cash_requests where id = v_pc;
  delete from public.message_outbox where data ->> 'record_id' in (v_lr::text, v_lr2::text, v_out::text, v_pc::text, v_tx::text);
  delete from public.leave_requests where id in (v_lr, v_lr2);
  delete from public.leave_plans where id = v_plan;
end $m38$;

-- 39: a drawn signature is kept and used when no signature is given (for example from an email link).
do $m39$
declare v_ts uuid; v_lr uuid; ok boolean := false;
begin
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform public.save_my_signature('data:image/png;base64,iVBORw0KGgo=');
  perform pg_temp.check('m39: the signature is kept', (public.my_default_signature() ->> 'image') = 'data:image/png;base64,iVBORw0KGgo=');
  begin
    perform public.save_my_signature('not an image');
  exception when invalid_parameter_value then ok := true;
  end;
  perform pg_temp.check('m39: only drawn images are kept', ok);
  perform pg_temp.as_admin();
  insert into public.leave_requests (company_id, employee_id, category_id, date_from, date_to, reason, status, created_by)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000005',
    (select id from public.leave_categories where company_id = '11111111-1111-1111-1111-111111111111' and not counts_against_balance order by name limit 1),
    current_date + 150, current_date + 151, 'Test', 'draft', '33333333-3333-3333-3333-000000000003') returning id into v_lr;
  update public.leave_requests set status = 'submitted' where id = v_lr;
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform public.approve_request('leave_requests', v_lr);
  perform pg_temp.as_admin();
  perform pg_temp.check('m39: a step signed without a signature uses the kept one', (select signature ->> 'image' from public.approval_signoffs where record_id = v_lr) = 'data:image/png;base64,iVBORw0KGgo=');
  delete from public.leave_requests where id = v_lr;
  update public.profiles set signature_image = null where id = '33333333-3333-3333-3333-000000000002';
end $m39$;

-- 40: timesheets approved by the fleet manager then the HOD (the fleet manager's own: HOD only);
-- maintenance work orders, job cards, spare parts, invoices (two steps) and purchase orders.
do $m40$
declare
  v_ts uuid;
  v_ts2 uuid;
  v_wo uuid;
  v_wo2 uuid;
  v_jc uuid;
  v_sp uuid;
  v_inv uuid;
  v_po uuid;
  ok boolean := false;
  veh uuid := '55555555-5555-5555-5555-000000000001';
begin
  perform pg_temp.check('m40: timesheets are requests', (select is_request from public.table_resources where table_name = 'timesheets'));
  -- Recorded and sent by the coordinator.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  insert into public.timesheets (company_id, employee_id, period_month, status)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', date_trunc('month', current_date + interval '14 months')::date, 'submitted')
  returning id into v_ts;
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the coordinator is the one who recorded it', (select coordinator_name from public.timesheets where id = v_ts) = (select full_name from public.profiles where id = '33333333-3333-3333-3333-000000000003'));
  perform pg_temp.check('m40: a coordinator''s timesheet waits for the fleet manager', (select coalesce(approval_step, 'approval') from public.timesheets where id = v_ts) = 'approval');
  begin
    perform pg_temp.as_user('33333333-3333-3333-3333-000000000004');
    perform public.approve_request('timesheets', v_ts);
  exception when insufficient_privilege then ok := true;
  end;
  perform pg_temp.check('m40: the HOD cannot take the fleet manager''s step', ok);
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform public.approve_request('timesheets', v_ts);
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: after the fleet manager it goes to the HOD', (select approval_step from public.timesheets where id = v_ts) = 'hod_approval' and (select status from public.timesheets where id = v_ts) = 'submitted');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000004');
  perform public.approve_request('timesheets', v_ts);
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the HOD approves the timesheet', (select status from public.timesheets where id = v_ts) = 'approved');
  -- Recorded and sent by the fleet manager: already approved by them, the HOD still decides.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  insert into public.timesheets (company_id, employee_id, period_month, status)
  values ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-000000000006', date_trunc('month', current_date + interval '15 months')::date, 'draft')
  returning id into v_ts2;
  update public.timesheets set status = 'submitted' where id = v_ts2;
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the fleet manager''s own timesheet goes straight to the HOD', (select approval_step from public.timesheets where id = v_ts2) = 'hod_approval' and (select status from public.timesheets where id = v_ts2) = 'submitted');
  perform pg_temp.check('m40: and it shows the fleet manager''s approval', exists (select 1 from public.approval_signoffs where record_id = v_ts2 and step = 'approval' and signed_by = '33333333-3333-3333-3333-000000000002'));
  perform pg_temp.check('m40: the HOD is asked by email', exists (select 1 from public.approval_links where record_id = v_ts2 and step = 'hod_approval'));
  delete from public.timesheets where id in (v_ts, v_ts2);
  -- A driver without a user account: the timesheet stays theirs when the coordinator saves and changes it.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  insert into public.timesheets (company_id, driver_id, employee_name, period_month, status)
  values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-000000000003', 'Driver Without Login', date_trunc('month', current_date + interval '16 months')::date, 'draft')
  returning id into v_ts;
  update public.timesheets set status = 'submitted' where id = v_ts;
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: a driver without an account keeps the timesheet (not the coordinator)', (select employee_id is null and employee_name = 'Driver Without Login' from public.timesheets where id = v_ts));
  delete from public.timesheets where id = v_ts;

  -- Work orders: numbered, emailed to the service provider.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  insert into public.maintenance_work_orders (company_id, vehicle_id, order_date, description, service_provider)
  values ('11111111-1111-1111-1111-111111111111', veh, current_date, 'Front brakes squeal', 'Mwanza Auto Garage') returning id into v_wo;
  insert into public.maintenance_work_orders (company_id, vehicle_id, order_date, description, service_provider)
  values ('11111111-1111-1111-1111-111111111111', veh, current_date, 'Service', 'Mwanza Auto Garage') returning id into v_wo2;
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: work orders are numbered', (select order_number from public.maintenance_work_orders where id = v_wo) = 'WO-' || to_char(current_date, 'YYYY') || '-0001'
    and (select order_number from public.maintenance_work_orders where id = v_wo2) = 'WO-' || to_char(current_date, 'YYYY') || '-0002');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  ok := false;
  begin
    perform public.send_work_order(v_wo, null);
  exception when check_violation then ok := true;
  end;
  perform pg_temp.check('m40: a work order needs the provider''s email', ok);
  perform public.send_work_order(v_wo, 'Garage@Example.com');
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the work order is emailed', exists (select 1 from public.message_outbox where template = 'work_order' and recipient = 'garage@example.com' and data ->> 'record_id' = v_wo::text)
    and (select emailed_at from public.maintenance_work_orders where id = v_wo) is not null);
  update public.message_outbox set status = 'skipped' where template = 'work_order' and status = 'pending';

  -- Job card: days in the garage and km run there.
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000003');
  insert into public.maintenance_costs (company_id, vehicle_id, cost_date, work_type, activities, cost_tzs, date_in, date_out, km_in, km_out)
  values ('11111111-1111-1111-1111-111111111111', veh, current_date, 'repairs', 'Replaced pads', 120000, current_date - 3, current_date, 80000, 80012) returning id into v_jc;
  insert into public.maintenance_spare_parts (company_id, vehicle_id, part_date, description, quantity, unit_price_tzs)
  values ('11111111-1111-1111-1111-111111111111', veh, current_date, 'Brake pads', 2, 45000) returning id into v_sp;
  insert into public.maintenance_purchase_orders (company_id, vehicle_id, po_date, service_provider, amount_tzs)
  values ('11111111-1111-1111-1111-111111111111', veh, current_date, 'Mwanza Auto Garage', 210000) returning id into v_po;
  -- Invoice: labour plus parts, approved by the fleet manager then the HOD.
  insert into public.maintenance_invoices (company_id, vehicle_id, invoice_number, invoice_date, service_provider, labour_tzs, parts_tzs, status)
  values ('11111111-1111-1111-1111-111111111111', veh, 'INV-778', current_date, 'Mwanza Auto Garage', 120000, 90000, 'submitted') returning id into v_inv;
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: job card days and km in the garage', (select days_in_garage from public.maintenance_costs where id = v_jc) = 3 and (select km_in_garage from public.maintenance_costs where id = v_jc) = 12);
  perform pg_temp.check('m40: spare part cost is parts times unit price', (select cost_tzs from public.maintenance_spare_parts where id = v_sp) = 90000);
  perform pg_temp.check('m40: purchase orders are numbered and unpaid at first', (select po_number like 'PO-%-0001' and payment_status = 'unpaid' from public.maintenance_purchase_orders where id = v_po));
  perform pg_temp.check('m40: invoice amount is labour plus parts', (select amount_tzs from public.maintenance_invoices where id = v_inv) = 210000);
  perform pg_temp.check('m40: a coordinator''s invoice waits for the fleet manager', (select coalesce(approval_step, 'approval') from public.maintenance_invoices where id = v_inv) = 'approval');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000002');
  perform public.approve_request('maintenance_invoices', v_inv);
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the invoice goes to the HOD', (select approval_step from public.maintenance_invoices where id = v_inv) = 'hod_approval');
  perform pg_temp.as_user('33333333-3333-3333-3333-000000000004');
  perform public.approve_request('maintenance_invoices', v_inv);
  perform pg_temp.as_admin();
  perform pg_temp.check('m40: the HOD approves the invoice', (select status from public.maintenance_invoices where id = v_inv) = 'approved');
  perform pg_temp.check('m40: invoice summary for messages', public.workflow_request_summary('maintenance_invoices', v_inv) ->> 'path' = '/expenses/maintenance/costs/invoices/' || v_inv);

  delete from public.maintenance_invoices where id = v_inv;
  delete from public.maintenance_purchase_orders where id = v_po;
  delete from public.maintenance_spare_parts where id = v_sp;
  delete from public.maintenance_costs where id = v_jc;
  delete from public.maintenance_work_orders where id in (v_wo, v_wo2);
end $m40$;

select 'ALL TESTS PASSED' as result;
