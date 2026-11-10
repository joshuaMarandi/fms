-- MDV Fleet Management System
-- Migration 4: RPC functions (approve, reject, sign JMP, submit timesheet, save role grants, reports),
-- reminders with their sync triggers and daily job, and storage buckets with policies.

-- ---------------------------------------------------------------------------
-- Request approval RPCs
-- ---------------------------------------------------------------------------
create or replace function public.request_row_access(p_table text, p_id uuid, p_action public.permission_action, out o_resource text, out o_row jsonb)
returns record language plpgsql security definer set search_path = public as $$
declare
  v_driver uuid;
begin
  select resource_key into o_resource from public.table_resources where table_name = p_table and is_request;
  if o_resource is null then
    raise exception 'Unknown request table %', p_table using errcode = '22023', hint = 'unknown_table';
  end if;
  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.deleted_at is null', p_table) into o_row using p_id;
  if o_row is null then
    raise exception 'Request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  v_driver := nullif(o_row ->> 'driver_id', '')::uuid;
  if not public.row_access(o_resource, p_action, (o_row ->> 'company_id')::uuid, (o_row ->> 'created_by')::uuid, v_driver) then
    raise exception 'You do not have permission to % this request', p_action using errcode = '42501', hint = 'permission_denied';
  end if;
end;
$$;

create or replace function public.approve_request(p_table text, p_id uuid, p_signature jsonb default null, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resource text;
  v_row jsonb;
  v_after jsonb;
  v_name text;
  v_title text;
  v_step text;
  v_order integer := 0;
begin
  select o_resource, o_row into v_resource, v_row from public.request_row_access(p_table, p_id, 'approve');
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be approved' using errcode = '23514', hint = 'illegal_transition';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();

  perform set_config('fms.approving', 'on', true);
  execute format(
    'update public.%I set status = ''approved'', approved_by = $1, approved_at = now(), approver_signature = $2, rejection_reason = null
     where id = $3 returning to_jsonb(%I.*)', p_table, p_table)
    into v_after using auth.uid(), coalesce(p_signature, jsonb_build_object('name', v_name, 'user_id', auth.uid(), 'signed_at', now(), 'method', 'tick')), p_id;

  -- Table-specific approval data
  if p_table = 'fuel_requests' then
    update public.fuel_requests set approved_l = coalesce((p_extra ->> 'approved_l')::numeric, fuel_required_l) where id = p_id;
  elsif p_table in ('maintenance_requests', 'leave_requests') then
    execute format('update public.%I set approver_name = coalesce($1, approver_name, $3), approver_position = coalesce($2, approver_position) where id = $4', p_table)
      using p_extra ->> 'approver_name', p_extra ->> 'approver_position', v_name, p_id;
  elsif p_table = 'vehicle_requests' then
    insert into public.vehicle_assignments (company_id, vehicle_request_id, driver_id, vehicle_id, approver_name, approver_signature, jmp_attachment_id, created_by)
    values ((v_row ->> 'company_id')::uuid, p_id, nullif(p_extra ->> 'driver_id', '')::uuid, nullif(p_extra ->> 'vehicle_id', '')::uuid,
            v_name, p_signature, nullif(p_extra ->> 'jmp_attachment_id', '')::uuid, auth.uid());
    if (v_row ->> 'trip_type') = 'long' then
      for v_step in select unnest(array['hse_manager', 'control_room', 'emergency_commander']) loop
        v_order := v_order + 1;
        insert into public.jmp_reviews (company_id, vehicle_request_id, step, step_order, required_resource, created_by)
        values ((v_row ->> 'company_id')::uuid, p_id, v_step, v_order,
          case v_step when 'hse_manager' then 'daily_use.trip_requests.jmp_hse'
                      when 'control_room' then 'daily_use.trip_requests.jmp_control_room'
                      else 'daily_use.trip_requests.jmp_erc' end, auth.uid())
        on conflict (vehicle_request_id, step) do nothing;
      end loop;
      -- Tell the HSE manager(s) the JMP is ready to sign.
      perform public.notify_approvers((v_row ->> 'company_id')::uuid, 'daily_use.trip_requests.jmp_hse',
        'Journey management plan ready for HSE sign-off', 'A long trip was approved and its JMP needs your signature.',
        '/daily-use/trip-requests/' || p_id);
    end if;
  end if;
  perform set_config('fms.approving', 'off', true);

  select name into v_title from public.resources where key = v_resource;
  perform public.audit_write('approve', p_table, p_id::text, v_row, v_after, (v_row ->> 'company_id')::uuid);
  perform public.notify_user((v_row ->> 'created_by')::uuid, 'approval', v_title || ' approved',
    'Your request was approved by ' || coalesce(v_name, 'the manager') || '.', replace(replace(v_resource, '.', '/'), '_', '-') || '/' || p_id,
    (v_row ->> 'company_id')::uuid);
  return v_after;
end;
$$;

create or replace function public.reject_request(p_table text, p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resource text;
  v_row jsonb;
  v_after jsonb;
  v_name text;
  v_title text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;
  select o_resource, o_row into v_resource, v_row from public.request_row_access(p_table, p_id, 'approve');
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be rejected' using errcode = '23514', hint = 'illegal_transition';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();

  perform set_config('fms.approving', 'on', true);
  execute format(
    'update public.%I set status = ''rejected'', approved_by = $1, approved_at = now(), rejection_reason = $2
     where id = $3 returning to_jsonb(%I.*)', p_table, p_table)
    into v_after using auth.uid(), trim(p_reason), p_id;
  perform set_config('fms.approving', 'off', true);

  select name into v_title from public.resources where key = v_resource;
  perform public.audit_write('reject', p_table, p_id::text, v_row, v_after, (v_row ->> 'company_id')::uuid);
  perform public.notify_user((v_row ->> 'created_by')::uuid, 'rejection', v_title || ' rejected',
    'Reason: ' || trim(p_reason), replace(replace(v_resource, '.', '/'), '_', '-') || '/' || p_id, (v_row ->> 'company_id')::uuid);
  return v_after;
end;
$$;

-- Three-step JMP sign-off for long trips. Each step needs its own role (resource).
create or replace function public.sign_jmp(p_request_id uuid, p_step text, p_decision text, p_signature jsonb default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_review public.jmp_reviews;
  v_req public.vehicle_requests;
  v_name text;
  v_pending integer;
  v_next public.jmp_reviews;
begin
  select * into v_req from public.vehicle_requests where id = p_request_id and deleted_at is null;
  if v_req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  select * into v_review from public.jmp_reviews where vehicle_request_id = p_request_id and step = p_step;
  if v_review.id is null then raise exception 'No JMP step % on this request', p_step using errcode = 'P0002'; end if;
  if v_review.decision is not null then raise exception 'This step is already signed' using errcode = '23514', hint = 'already_signed'; end if;
  if not public.row_access(v_review.required_resource, 'approve', v_req.company_id, v_req.created_by) then
    raise exception 'You do not have the role required to sign this JMP step' using errcode = '42501', hint = 'permission_denied';
  end if;
  if exists (select 1 from public.jmp_reviews r where r.vehicle_request_id = p_request_id and r.step_order < v_review.step_order and r.decision is distinct from 'approved') then
    raise exception 'Earlier JMP steps must be signed first' using errcode = '23514', hint = 'out_of_order';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected' using errcode = '22023'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();

  update public.jmp_reviews set
    reviewer_id = auth.uid(), signed_at = now(), decision = p_decision, rejection_reason = nullif(trim(p_reason), ''),
    signature = coalesce(p_signature, jsonb_build_object('name', v_name, 'user_id', auth.uid(), 'signed_at', now(), 'method', 'tick'))
  where id = v_review.id returning * into v_review;

  if p_decision = 'rejected' then
    perform set_config('fms.approving', 'on', true);
    update public.vehicle_requests set status = 'rejected', rejection_reason = 'JMP ' || p_step || ': ' || trim(p_reason) where id = p_request_id;
    perform set_config('fms.approving', 'off', true);
    perform public.notify_user(v_req.created_by, 'rejection', 'Long trip JMP rejected', trim(p_reason), '/daily-use/trip-requests/' || p_request_id, v_req.company_id);
  else
    select count(*) into v_pending from public.jmp_reviews where vehicle_request_id = p_request_id and decision is distinct from 'approved';
    if v_pending = 0 then
      perform public.notify_user(v_req.created_by, 'approval', 'Long trip fully cleared', 'All JMP reviews are complete.', '/daily-use/trip-requests/' || p_request_id, v_req.company_id);
    else
      select * into v_next from public.jmp_reviews where vehicle_request_id = p_request_id and decision is null order by step_order limit 1;
      perform public.notify_approvers(v_req.company_id, v_next.required_resource, 'JMP review needed',
        'The journey management plan is ready for your review.', '/daily-use/trip-requests/' || p_request_id);
    end if;
  end if;
  perform public.audit_write('sign_jmp', 'jmp_reviews', v_review.id::text, null, to_jsonb(v_review), v_req.company_id);
  return to_jsonb(v_review);
end;
$$;

-- Submit a timesheet: needs at least one day row; the generic status guard notifies approvers.
create or replace function public.submit_timesheet(p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v public.timesheets;
begin
  if not exists (select 1 from public.timesheet_days where timesheet_id = p_id and deleted_at is null) then
    raise exception 'Add at least one day before submitting' using errcode = '23514', hint = 'empty_timesheet';
  end if;
  update public.timesheets set status = 'submitted' where id = p_id and status in ('draft', 'rejected') returning * into v;
  if v.id is null then raise exception 'Timesheet not found or not editable' using errcode = 'P0002'; end if;
  return to_jsonb(v);
end;
$$;

-- Generic submit for any request table (draft -> submitted). RLS and the status guard apply.
create or replace function public.submit_request(p_table text, p_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from public.table_resources where table_name = p_table and is_request) then
    raise exception 'Unknown request table %', p_table using errcode = '22023';
  end if;
  execute format('update public.%I set status = ''submitted'' where id = $1 and status in (''draft'', ''rejected'') returning to_jsonb(%I.*)', p_table, p_table)
    into v using p_id;
  if v is null then raise exception 'Request not found or not editable' using errcode = 'P0002'; end if;
  return v;
end;
$$;

-- Save a role's whole grant matrix in one transaction. The triggers enforce the ceiling.
create or replace function public.save_role_grants(p_role_id uuid, p_grants jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  g jsonb;
  n integer := 0;
  v_keys text[];
begin
  select coalesce(array_agg(x ->> 'resource_key'), '{}') into v_keys from jsonb_array_elements(p_grants) x
    where jsonb_array_length(coalesce(x -> 'actions', '[]'::jsonb)) > 0;

  delete from public.role_grants where role_id = p_role_id and not (resource_key = any(v_keys));

  for g in select * from jsonb_array_elements(p_grants) loop
    if jsonb_array_length(coalesce(g -> 'actions', '[]'::jsonb)) = 0 then
      continue;
    end if;
    insert into public.role_grants (role_id, resource_key, actions, scope)
    values (p_role_id, g ->> 'resource_key',
      (select array_agg(a::public.permission_action) from jsonb_array_elements_text(g -> 'actions') a),
      coalesce((g ->> 'scope')::public.grant_scope, 'all'))
    on conflict (role_id, resource_key) do update set actions = excluded.actions, scope = excluded.scope;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Copy a role (name, description, grants). Owner or admin within ceiling.
create or replace function public.copy_role(p_source_role uuid, p_name text, p_description text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into public.roles (name, description, company_id) values (p_name, p_description, public.my_company_id()) returning id into v_id;
  insert into public.role_grants (role_id, resource_key, actions, scope)
  select v_id, resource_key, actions, scope from public.role_grants where role_id = p_source_role;
  return v_id;
end;
$$;

-- Plain-language preview of a role's grants.
create or replace function public.role_preview(p_role_id uuid)
returns table (sentence text) language sql stable security invoker set search_path = public as $$
  select format('%s can %s %s for %s',
    r.name,
    array_to_string(array(select case a when 'view' then 'view' when 'create' then 'add' when 'edit' then 'edit'
      when 'delete' then 'delete' when 'approve' then 'approve' else 'export' end from unnest(g.actions) a), ', '),
    res.name,
    case g.scope when 'all' then 'all records' when 'department' then 'their department' else 'their own records' end)
  from public.role_grants g
  join public.roles r on r.id = g.role_id
  join public.resources res on res.key = g.resource_key
  where g.role_id = p_role_id
  order by res.sort_order;
$$;

-- Owner switches the active company.
create or replace function public.switch_company(p_company uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can switch companies' using errcode = '42501';
  end if;
  update public.profiles set company_id = p_company where id = auth.uid();
end;
$$;

-- Mark notifications read.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports (RLS applies because the function is security invoker)
-- ---------------------------------------------------------------------------
create or replace function public.generate_report(p_type text, p_filters jsonb default '{}'::jsonb)
returns setof jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  d_from date := coalesce((p_filters ->> 'from')::date, (current_date - interval '12 months')::date);
  d_to date := coalesce((p_filters ->> 'to')::date, current_date);
  v_vehicle uuid := nullif(p_filters ->> 'vehicle_id', '')::uuid;
  v_driver uuid := nullif(p_filters ->> 'driver_id', '')::uuid;
  v_resource text;
begin
  v_resource := case p_type
    when 'fuel' then 'expenses.fuel'
    when 'fleet_cost' then 'expenses'
    when 'maintenance' then 'expenses.maintenance'
    when 'compliance' then 'fleet'
    when 'training' then 'expenses.trainings'
    when 'leave' then 'expenses.leave'
    when 'timesheet' then 'expenses.timesheet'
    when 'incidents' then 'expenses.safety'
    else null end;
  if v_resource is null then
    raise exception 'Unknown report type %', p_type using errcode = '22023';
  end if;
  if not public.has_permission(v_resource, 'view') then
    raise exception 'No access to this report' using errcode = '42501', hint = 'permission_denied';
  end if;

  if p_type = 'fuel' then
    return query
      select jsonb_build_object('date', f.expense_date, 'vehicle', v.registration, 'km_run', f.km_run, 'litres', f.fuel_consumed_l,
        'target_km_per_l', f.target_km_per_l, 'attained_km_per_l', f.attained_km_per_l, 'price_per_litre', f.price_per_litre, 'amount_tzs', f.amount_tzs)
      from public.fuel_expenses f join public.vehicles v on v.id = f.vehicle_id
      where f.deleted_at is null and f.expense_date between d_from and d_to and (v_vehicle is null or f.vehicle_id = v_vehicle)
      order by f.expense_date desc;
  elsif p_type = 'fleet_cost' then
    return query
      select jsonb_build_object('month', m.month, 'vehicle', m.registration, 'category', m.category, 'amount_tzs', m.amount)
      from (
        select date_trunc('month', expense_date)::date as month, v.registration, 'fuel' as category, sum(amount_tzs) as amount
          from public.fuel_expenses f join public.vehicles v on v.id = f.vehicle_id
          where f.deleted_at is null and expense_date between d_from and d_to and (v_vehicle is null or f.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', cost_date)::date, v.registration, 'maintenance', sum(cost_tzs)
          from public.maintenance_costs c join public.vehicles v on v.id = c.vehicle_id
          where c.deleted_at is null and cost_date between d_from and d_to and (v_vehicle is null or c.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', request_date)::date, v.registration, 'tyres', sum(total_cost_tzs)
          from public.tyre_requests t join public.vehicles v on v.id = t.vehicle_id
          where t.deleted_at is null and t.status in ('approved', 'completed') and request_date between d_from and d_to and (v_vehicle is null or t.vehicle_id = v_vehicle)
          group by 1, 2
        union all
        select date_trunc('month', request_date)::date, v.registration, 'washing', sum(cost_tzs)
          from public.wash_requests w join public.vehicles v on v.id = w.vehicle_id
          where w.deleted_at is null and w.status in ('approved', 'completed') and request_date between d_from and d_to and (v_vehicle is null or w.vehicle_id = v_vehicle)
          group by 1, 2
      ) m order by m.month desc, m.registration, m.category;
  elsif p_type = 'maintenance' then
    return query
      select jsonb_build_object('date', c.cost_date, 'vehicle', v.registration, 'work_type', c.work_type, 'provider', c.service_provider,
        'activities', c.activities, 'cost_tzs', c.cost_tzs, 'days_out', w.total_days, 'mileage_during_repairs', w.mileage_during_repairs)
      from public.maintenance_costs c join public.vehicles v on v.id = c.vehicle_id
      left join public.work_orders w on w.id = c.work_order_id
      where c.deleted_at is null and c.cost_date between d_from and d_to and (v_vehicle is null or c.vehicle_id = v_vehicle)
      order by c.cost_date desc;
  elsif p_type = 'compliance' then
    return query
      select jsonb_build_object('type', r.reminder_type, 'title', r.title, 'due_date', r.due_date, 'due_km', r.due_km,
        'vehicle', v.registration, 'driver', d.full_name,
        'state', case when r.due_date is null then 'valid' when r.due_date < current_date then 'overdue'
                      when r.due_date <= current_date + 30 then 'due_soon' else 'valid' end)
      from public.reminders r left join public.vehicles v on v.id = r.vehicle_id left join public.drivers d on d.id = r.driver_id
      where r.deleted_at is null and r.status <> 'done' and (v_vehicle is null or r.vehicle_id = v_vehicle) and (v_driver is null or r.driver_id = v_driver)
      order by r.due_date nulls last;
  elsif p_type = 'training' then
    return query
      select jsonb_build_object('driver', d.full_name, 'courses', t.courses, 'date_completed', t.date_completed, 'trainer', t.trainer,
        'cost_tzs', t.cost_tzs, 'refresher_date', t.refresher_date)
      from public.mandatory_trainings t join public.drivers d on d.id = t.driver_id
      where t.deleted_at is null and (v_driver is null or t.driver_id = v_driver)
        and (t.date_completed is null or t.date_completed between d_from and d_to)
      order by t.date_completed desc nulls last;
  elsif p_type = 'leave' then
    return query
      select jsonb_build_object('employee', coalesce(d.full_name, p.full_name), 'category', c.name, 'from', l.date_from, 'to', l.date_to,
        'days', l.total_days, 'status', l.status)
      from public.leave_requests l left join public.drivers d on d.id = l.driver_id left join public.profiles p on p.id = l.employee_id
      left join public.leave_categories c on c.id = l.category_id
      where l.deleted_at is null and l.date_from between d_from and d_to and (v_driver is null or l.driver_id = v_driver)
      order by l.date_from desc;
  elsif p_type = 'timesheet' then
    return query
      select jsonb_build_object('employee', t.employee_name, 'month', t.period_month, 'normal_hours', t.total_normal_hours,
        'overtime_hours', t.total_overtime_hours, 'status', t.status)
      from public.timesheets t
      where t.deleted_at is null and t.period_month between date_trunc('month', d_from)::date and d_to and (v_driver is null or t.driver_id = v_driver)
      order by t.period_month desc, t.employee_name;
  elsif p_type = 'incidents' then
    return query
      select jsonb_build_object('occurred_at', i.occurred_at, 'region', i.region, 'district', i.district, 'road', i.road_name,
        'driver', i.driver_name, 'injuries', i.injuries_count, 'fatalities', i.fatalities_count, 'status', i.status, 'description', i.description)
      from public.incidents i
      where i.deleted_at is null and i.occurred_at::date between d_from and d_to and (v_driver is null or i.driver_id = v_driver)
      order by i.occurred_at desc;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminders: one row for every field marked Reminder; triggers keep them current
-- ---------------------------------------------------------------------------
create or replace function public.sync_reminder()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text := tg_argv[0];
  v_column text := tg_argv[1];
  v_resource text := tg_argv[2];
  v_label text := tg_argv[3];
  v_mode text := coalesce(tg_argv[4], 'date');     -- date | km
  j jsonb;
  v_due date;
  v_due_km numeric;
  v_vehicle uuid;
  v_driver uuid;
  v_subject text;
  v_deleted boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.reminders where source_table = tg_table_name and source_id = old.id and reminder_type = v_type;
    return old;
  end if;
  j := to_jsonb(new);
  v_deleted := (j ->> 'deleted_at') is not null;
  v_vehicle := nullif(j ->> 'vehicle_id', '')::uuid;
  v_driver := nullif(j ->> 'driver_id', '')::uuid;
  if v_mode = 'km' then
    v_due_km := (j ->> v_column)::numeric;
  else
    v_due := (j ->> v_column)::date;
  end if;

  if v_deleted or (v_due is null and v_due_km is null) then
    delete from public.reminders where source_table = tg_table_name and source_id = new.id and reminder_type = v_type;
    return new;
  end if;

  if v_vehicle is not null then
    select registration into v_subject from public.vehicles where id = v_vehicle;
  elsif v_driver is not null then
    select full_name into v_subject from public.drivers where id = v_driver;
  end if;

  insert into public.reminders (company_id, reminder_type, source_table, source_id, resource_key, vehicle_id, driver_id, title, due_date, due_km, status, created_by)
  values (new.company_id, v_type, tg_table_name, new.id, v_resource, v_vehicle, v_driver,
          v_label || coalesce(': ' || v_subject, ''), v_due, v_due_km, 'pending', new.created_by)
  on conflict (source_table, source_id, reminder_type) do update set
    due_date = excluded.due_date,
    due_km = excluded.due_km,
    title = excluded.title,
    vehicle_id = excluded.vehicle_id,
    driver_id = excluded.driver_id,
    deleted_at = null,
    -- A moved date starts the cycle again.
    status = case when public.reminders.due_date is distinct from excluded.due_date or public.reminders.due_km is distinct from excluded.due_km
                  then 'pending'::public.reminder_status else public.reminders.status end,
    last_notified_at = case when public.reminders.due_date is distinct from excluded.due_date or public.reminders.due_km is distinct from excluded.due_km
                  then null else public.reminders.last_notified_at end;
  return new;
end;
$$;

create trigger vehicle_inspections_reminder after insert or update or delete on public.vehicle_inspections
  for each row execute function public.sync_reminder('inspection_renewal', 'renewal_date', 'fleet.inspection_status', 'Vehicle inspection renewal');
create trigger vehicle_insurance_reminder after insert or update or delete on public.vehicle_insurance
  for each row execute function public.sync_reminder('insurance_end', 'end_date', 'fleet.insurance', 'Insurance expires');
create trigger service_schedules_reminder after insert or update or delete on public.service_schedules
  for each row execute function public.sync_reminder('next_service', 'next_service_km', 'fleet.maintenance_schedule', 'Service due', 'km');
create trigger driver_licences_reminder after insert or update or delete on public.driver_licences
  for each row execute function public.sync_reminder('licence_expiry', 'expiry_date', 'drivers.licence', 'Driving licence expires');
create trigger driver_osha_reminder after insert or update or delete on public.driver_osha
  for each row execute function public.sync_reminder('osha_redo', 'redo_date', 'drivers.osha', 'OSHA fit-for-work redo');
create trigger third_party_inspections_reminder after insert or update or delete on public.third_party_inspections
  for each row execute function public.sync_reminder('third_party_renewal', 'renewal_date', 'inspections.third_party', 'Third-party inspection renewal');
create trigger mandatory_trainings_reminder after insert or update or delete on public.mandatory_trainings
  for each row execute function public.sync_reminder('training_refresher', 'refresher_date', 'expenses.trainings.mandatory', 'Training refresher due');

-- Daily job: find due reminders, create notifications, mark them notified.
create or replace function public.process_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  v_lead_days integer;
  v_lead_km integer;
  v_roles uuid[];
  v_odometer numeric;
  v_due boolean;
  v_body text;
  n integer := 0;
begin
  for r in
    select rem.*, v.odometer_km
    from public.reminders rem
    left join public.vehicles v on v.id = rem.vehicle_id
    where rem.deleted_at is null and rem.status <> 'done'
      and (rem.last_notified_at is null or rem.last_notified_at < now() - interval '7 days')
  loop
    select lead_days, lead_km, notify_role_ids into v_lead_days, v_lead_km, v_roles
    from public.reminder_settings s where s.company_id = r.company_id and s.reminder_type = r.reminder_type and s.deleted_at is null;
    v_lead_days := coalesce(v_lead_days, 30);
    v_lead_km := coalesce(v_lead_km, 500);
    v_odometer := r.odometer_km;

    v_due := (r.due_date is not null and r.due_date <= current_date + v_lead_days)
          or (r.due_km is not null and v_odometer is not null and v_odometer >= r.due_km - v_lead_km);
    if not v_due then continue; end if;

    v_body := case
      when r.due_date is not null and r.due_date < current_date then format('Overdue since %s', to_char(r.due_date, 'DD Mon YYYY'))
      when r.due_date is not null then format('Due on %s (%s days left)', to_char(r.due_date, 'DD Mon YYYY'), r.due_date - current_date)
      when r.due_km is not null then format('Due at %s km (vehicle at %s km)', r.due_km, coalesce(v_odometer, 0))
      else 'Due' end;

    for p in
      select pr.id from public.profiles pr
      where pr.company_id = r.company_id and pr.is_active
        and (
          (pr.driver_id is not null and pr.driver_id = r.driver_id)
          or exists (select 1 from public.user_roles ur where ur.user_id = pr.id and ur.role_id = any(coalesce(v_roles, '{}')))
          or (coalesce(cardinality(v_roles), 0) = 0 and public.permission_scope_for(pr.id, r.resource_key, 'view') = 'all')
        )
    loop
      perform public.notify_user(p.id, 'reminder', r.title, v_body,
        case when r.vehicle_id is not null then '/fleet/' || r.vehicle_id when r.driver_id is not null then '/drivers/' || r.driver_id else '/dashboard' end,
        r.company_id, r.id);
      n := n + 1;
    end loop;

    update public.reminders set status = 'notified', last_notified_at = now() where id = r.id;
  end loop;
  return n;
end;
$$;

-- Schedule the daily run where pg_cron is available (Supabase); a no-op elsewhere.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('fms-process-reminders', '0 6 * * *', $cmd$select public.process_due_reminders();$cmd$);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard helpers
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_kpis(p_from date default (current_date - 30), p_to date default current_date, p_vehicle uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb := '{}'::jsonb;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_prev_to date := p_from - 1;
begin
  v := v || jsonb_build_object(
    'vehicles_total', (select count(*) from public.vehicles where deleted_at is null and (p_vehicle is null or id = p_vehicle)),
    'vehicles_in_service', (select count(*) from public.vehicles where deleted_at is null and status = 'in_service' and (p_vehicle is null or id = p_vehicle)),
    'vehicles_in_garage', (select count(*) from public.vehicles where deleted_at is null and status = 'in_garage' and (p_vehicle is null or id = p_vehicle)),
    'pending_approvals', (
      (select count(*) from public.fuel_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.vehicle_requests where deleted_at is null and status = 'submitted') +
      (select count(*) from public.maintenance_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.tyre_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.wash_requests where deleted_at is null and status = 'submitted' and (p_vehicle is null or vehicle_id = p_vehicle)) +
      (select count(*) from public.leave_requests where deleted_at is null and status = 'submitted') +
      (select count(*) from public.timesheets where deleted_at is null and status = 'submitted')),
    'expiring_30', (select count(*) from public.reminders where deleted_at is null and status <> 'done' and due_date between current_date and current_date + 30 and (p_vehicle is null or vehicle_id = p_vehicle)),
    'overdue', (select count(*) from public.reminders where deleted_at is null and status <> 'done' and due_date < current_date and (p_vehicle is null or vehicle_id = p_vehicle)),
    'open_anomalies', (select count(*) from public.inspection_anomalies where deleted_at is null and status = 'open' and (p_vehicle is null or vehicle_id = p_vehicle)),
    'fuel_cost', (select coalesce(sum(amount_tzs), 0) from public.fuel_expenses where deleted_at is null and expense_date between p_from and p_to and (p_vehicle is null or vehicle_id = p_vehicle)),
    'fuel_cost_prev', (select coalesce(sum(amount_tzs), 0) from public.fuel_expenses where deleted_at is null and expense_date between v_prev_from and v_prev_to and (p_vehicle is null or vehicle_id = p_vehicle)),
    'incidents', (select count(*) from public.incidents where deleted_at is null and occurred_at::date between p_from and p_to),
    'incidents_prev', (select count(*) from public.incidents where deleted_at is null and occurred_at::date between v_prev_from and v_prev_to)
  );
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage buckets and policies (Supabase storage schema)
-- ---------------------------------------------------------------------------
do $$
declare
  b text;
  v_has_storage boolean;
begin
  select exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') into v_has_storage;
  if not v_has_storage then
    return;
  end if;
  foreach b in array array['vehicle-docs', 'driver-docs', 'inspection-scans', 'jmp', 'incident-files', 'forms'] loop
    insert into storage.buckets (id, name, public) values (b, b, false) on conflict (id) do nothing;
  end loop;
end $$;

-- Object paths are company_id/table/row_id/filename. Access follows the attachments row.
create or replace function public.storage_object_allowed(p_bucket text, p_name text, p_action public.permission_action)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_company uuid;
  v_table text;
  v_row uuid;
  v_resource text;
  v_sensitive boolean;
begin
  if cardinality(v_parts) < 4 then return false; end if;
  begin
    v_company := v_parts[1]::uuid;
    v_row := v_parts[3]::uuid;
  exception when others then
    return false;
  end;
  v_table := v_parts[2];
  if v_company is distinct from public.my_company_id() then return false; end if;

  select a.resource_key, a.is_sensitive into v_resource, v_sensitive
  from public.attachments a where a.bucket = p_bucket and a.path = p_name and a.deleted_at is null;

  if v_resource is null then
    -- No attachment row yet (upload in progress): fall back to the table's resource.
    select resource_key into v_resource from public.table_resources where table_name = v_table;
    v_sensitive := p_bucket = 'driver-docs';
  end if;
  if v_resource is null then return false; end if;
  if v_sensitive and p_action = 'view' and not public.has_permission('drivers.documents', 'view') then return false; end if;
  return public.has_permission(v_resource, p_action) or (p_action = 'create' and public.has_permission(v_resource, 'edit'));
end;
$$;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  execute $p$create policy fms_storage_select on storage.objects for select to authenticated
    using (bucket_id in ('vehicle-docs', 'driver-docs', 'inspection-scans', 'jmp', 'incident-files', 'forms')
      and public.storage_object_allowed(bucket_id, name, 'view'))$p$;
  execute $p$create policy fms_storage_insert on storage.objects for insert to authenticated
    with check (bucket_id in ('vehicle-docs', 'driver-docs', 'inspection-scans', 'jmp', 'incident-files', 'forms')
      and public.storage_object_allowed(bucket_id, name, 'create'))$p$;
  execute $p$create policy fms_storage_update on storage.objects for update to authenticated
    using (public.storage_object_allowed(bucket_id, name, 'edit'))$p$;
  execute $p$create policy fms_storage_delete on storage.objects for delete to authenticated
    using (public.storage_object_allowed(bucket_id, name, 'delete'))$p$;
end $$;

-- ---------------------------------------------------------------------------
-- Grants for the API roles
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
