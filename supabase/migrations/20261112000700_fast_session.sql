-- MDV Fleet Management System
-- Migration 7: speed. One round trip for the whole session and one for the app shell counts,
-- instead of about fifteen separate queries per page load.

-- Everything the app needs about the signed-in user, in one JSON document.
create or replace function public.session_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_company_id uuid;
  v_roles jsonb;
  v_role_ids uuid[];
  v_is_owner boolean;
  v_company jsonb;
  v_package_keys jsonb;
  v_companies jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select to_jsonb(p.*), p.company_id into v_profile, v_company_id from public.profiles p where p.id = v_uid;
  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'is_owner', r.is_owner, 'is_admin', r.is_admin, 'is_system', r.is_system, 'is_primary', ur.is_primary)
         order by ur.is_primary desc, r.name), '[]'::jsonb),
         coalesce(array_agg(r.id), '{}'),
         coalesce(bool_or(r.is_owner), false)
    into v_roles, v_role_ids, v_is_owner
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = v_uid;

  if v_company_id is not null then
    select jsonb_build_object(
             'id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'settings', c.settings,
             'status', c.status, 'subscription_start', c.subscription_start, 'subscription_end', c.subscription_end,
             'package_id', c.package_id, 'active', public.company_access_ok(c.id),
             'package', case when pk.id is null then null else jsonb_build_object(
               'id', pk.id, 'name', pk.name, 'price', pk.price, 'currency', pk.currency,
               'billing_period', pk.billing_period, 'max_vehicles', pk.max_vehicles) end)
      into v_company
    from public.companies c left join public.packages pk on pk.id = c.package_id
    where c.id = v_company_id;

    select coalesce(jsonb_agg(pr.resource_key), '[]'::jsonb) into v_package_keys
    from public.companies c join public.package_resources pr on pr.package_id = c.package_id
    where c.id = v_company_id;
  end if;

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) into v_companies
    from public.companies where deleted_at is null;
  end if;

  return jsonb_build_object(
    'profile', v_profile,
    'roles', v_roles,
    'grants', coalesce((select jsonb_agg(jsonb_build_object('role_id', g.role_id, 'resource_key', g.resource_key, 'actions', g.actions, 'scope', g.scope))
                        from public.role_grants g where g.role_id = any(v_role_ids)), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(r.*) order by r.sort_order) from public.resources r), '[]'::jsonb),
    'company', v_company,
    'package_keys', coalesce(v_package_keys, '[]'::jsonb),
    'companies', v_companies
  );
end;
$$;

-- Sidebar badges, the notification bell and its unread count, in one call.
-- Counts follow the same permission and company rules as the pages.
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
    if public.has_permission('expenses.maintenance.requests', 'approve') then
      v_pending := v_pending + (select count(*) from public.maintenance_requests where company_id = v_company and status = 'submitted' and deleted_at is null);
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
    if public.has_permission('expenses.timesheet', 'approve') then
      v_pending := v_pending + (select count(*) from public.timesheets where company_id = v_company and status = 'submitted' and deleted_at is null);
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

-- Indexes behind the counts and lists above.
create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists role_grants_role_idx on public.role_grants (role_id);
create index if not exists fuel_requests_status_idx on public.fuel_requests (company_id, status) where deleted_at is null;
create index if not exists vehicle_requests_status_idx on public.vehicle_requests (company_id, status) where deleted_at is null;
create index if not exists maintenance_requests_status_idx on public.maintenance_requests (company_id, status) where deleted_at is null;
create index if not exists tyre_requests_status_idx on public.tyre_requests (company_id, status) where deleted_at is null;
create index if not exists wash_requests_status_idx on public.wash_requests (company_id, status) where deleted_at is null;
create index if not exists leave_requests_status_idx on public.leave_requests (company_id, status) where deleted_at is null;
create index if not exists timesheets_status_idx on public.timesheets (company_id, status) where deleted_at is null;
create index if not exists inspection_anomalies_status_idx on public.inspection_anomalies (company_id, status) where deleted_at is null;
create index if not exists km_logs_vehicle_date_idx on public.km_logs (vehicle_id, log_date desc) where deleted_at is null;
create index if not exists daily_inspections_driver_date_idx on public.daily_inspections (driver_id, inspection_date desc) where deleted_at is null;
create index if not exists fuel_issues_date_idx on public.fuel_issues (company_id, issue_date desc) where deleted_at is null;
create index if not exists reminders_vehicle_idx on public.reminders (vehicle_id) where deleted_at is null;
create index if not exists reminders_driver_idx on public.reminders (driver_id) where deleted_at is null;
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists registrations_status_idx on public.company_registrations (status);

-- Email delivery from the app server: notifications not yet emailed, oldest first.
create index if not exists notifications_unsent_idx on public.notifications (created_at) where emailed_at is null;

grant execute on function public.session_context(), public.shell_counts() to authenticated;
