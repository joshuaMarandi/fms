-- 24: Two ways to run a long trip's journey management plan (JMP), set by the company admin:
--   automatic (as before): the fleet manager approves, the HSE manager signs, the JMP is complete.
--   manual: one of fleet manager, HOD or HSE prepares the JMP and uploads it; the requester downloads,
--           signs and uploads it; the HSE manager signs and attaches it; the fleet manager reviews,
--           signs and approves.
--   In both, the control room and the emergency response commander are only emailed (no signing).
-- Also: request history (created, emailed, viewed, decided) for the request documents, a check for
-- requests waiting on the signed-in user, and in-app alerts when a vehicle has no km log for yesterday.

-- ---------------------------------------------------------------------------
-- JMP method
-- ---------------------------------------------------------------------------
create or replace function public.company_jmp_method(p_company uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when (settings ->> 'jmp_method') = 'manual' then 'manual' else 'automatic' end from public.companies where id = p_company;
$$;

alter table public.vehicle_requests add column if not exists jmp_method text;
alter table public.vehicle_requests drop constraint if exists vehicle_requests_jmp_method_check;
alter table public.vehicle_requests add constraint vehicle_requests_jmp_method_check check (jmp_method is null or jmp_method in ('automatic', 'manual'));
alter table public.vehicle_requests add column if not exists jmp_monitors_notified_at timestamptz;

create or replace function public.request_jmp_method(p_request uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(jmp_method, 'automatic') from public.vehicle_requests where id = p_request;
$$;

-- Company admins choose the method (one settings key, merged into the rest).
create or replace function public.set_company_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_key not in ('jmp_method') then
    raise exception 'Unknown setting %', p_key using errcode = '22023';
  end if;
  if not public.has_permission('settings.company', 'edit') then
    raise exception 'You cannot change company settings' using errcode = '42501', hint = 'permission_denied';
  end if;
  update public.companies set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = public.my_company_id();
end;
$$;
grant execute on function public.set_company_setting(text, jsonb) to authenticated;

-- Who may prepare and upload a manual JMP (besides trip approvers and HSE).
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('daily_use.trip_requests.jmp_prepare', 'daily_use.trip_requests', 'JMP: prepare and upload (manual JMP)', null, null, null, 409, false, false)
on conflict (key) do update set name = excluded.name, parent_key = excluded.parent_key;

alter table public.jmp_reviews drop constraint if exists jmp_reviews_step_check;
alter table public.jmp_reviews add constraint jmp_reviews_step_check check (step in ('prepare', 'requester', 'hse_manager', 'control_room', 'emergency_commander'));

create or replace function public.workflow_step_label(p_step text)
returns text language sql immutable as $$
  select case p_step
    when 'approval' then 'Approval'
    when 'prepare' then 'Prepare and upload the journey management plan'
    when 'requester' then 'Requester signs the journey management plan'
    when 'hse_manager' then 'HSE manager sign-off (journey management plan)'
    when 'control_room' then 'Control room (journey management plan)'
    when 'emergency_commander' then 'Emergency response commander (journey management plan)'
    else initcap(replace(p_step, '_', ' ')) end;
$$;

-- The step waiting now. Vehicle requests: a pending JMP step first (manual JMP before approval,
-- automatic JMP after it), else the approval while submitted.
create or replace function public.workflow_current_step(p_table text, p_id uuid, out o_step text, out o_resource text)
returns record language plpgsql stable security definer set search_path = public as $$
declare
  v_status text;
begin
  if p_table = 'leave_requests' then
    select status::text into v_status from public.leave_requests where id = p_id and deleted_at is null;
    if v_status = 'submitted' then o_step := 'approval'; o_resource := 'expenses.leave.requests'; end if;
  elsif p_table = 'vehicle_requests' then
    select status::text into v_status from public.vehicle_requests where id = p_id and deleted_at is null;
    if v_status in ('submitted', 'approved') then
      select step, required_resource into o_step, o_resource from public.jmp_reviews
      where vehicle_request_id = p_id and decision is null and step in ('prepare', 'requester', 'hse_manager')
      order by step_order limit 1;
      if o_step is null and v_status = 'submitted' then
        o_step := 'approval'; o_resource := 'daily_use.trip_requests';
      end if;
    end if;
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
    if (v_row ->> 'trip_type') = 'long' and coalesce(v_row ->> 'jmp_method', 'automatic') = 'automatic' then
      -- Automatic JMP: the HSE manager signs after the approval. Control room and the emergency
      -- response commander are emailed once it is complete; they do not sign.
      insert into public.jmp_reviews (company_id, vehicle_request_id, step, step_order, required_resource, created_by)
      values ((v_row ->> 'company_id')::uuid, p_id, 'hse_manager', 1, 'daily_use.trip_requests.jmp_hse', auth.uid())
      on conflict (vehicle_request_id, step) do update set decision = null, signed_at = null, signature = null, reviewer_id = null, rejection_reason = null
        where public.jmp_reviews.decision = 'rejected';
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

create or replace function public.request_status_guard()
returns trigger language plpgsql as $$
declare
  v_resource text := tg_argv[0];
  v_link text := tg_argv[1];
  v_approving boolean := coalesce(current_setting('fms.approving', true), 'off') = 'on';
  v_workflow boolean := tg_table_name in ('leave_requests', 'vehicle_requests');
begin
  if v_workflow then
    perform set_config('fms.workflow_record', new.id::text, true);
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception 'A new request must start as draft or submitted' using errcode = '23514', hint = 'illegal_transition';
    end if;
    if new.status = 'submitted' then
      perform public.notify_approvers(new.company_id, v_resource,
        format('%s awaiting approval', (select name from public.resources where key = v_resource)),
        'A request was submitted and needs a decision.', v_link || '/' || new.id);
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  -- Long trips remember the JMP method in force when first sent.
  if tg_table_name = 'vehicle_requests' then
    if new.status = 'submitted' and (to_jsonb(new) ->> 'trip_type') = 'long' and (to_jsonb(new) ->> 'jmp_method') is null then
      new.jmp_method := public.company_jmp_method(new.company_id);
    end if;
  end if;

  -- Resume a long trip at the JMP step that rejected it.
  if tg_table_name = 'vehicle_requests' and new.status = 'submitted' and old.status in ('draft', 'rejected')
     and exists (select 1 from public.jmp_reviews where vehicle_request_id = new.id and decision = 'rejected') then
    update public.jmp_reviews set decision = null, reviewer_id = null, signed_at = null, signature = null, rejection_reason = null
    where vehicle_request_id = new.id and decision = 'rejected';
    new.rejection_reason := null;
    -- Automatic: the approval stands and the HSE step starts again. Manual: the JMP comes before the approval.
    if coalesce(to_jsonb(new) ->> 'jmp_method', 'automatic') = 'automatic' then
      new.status := 'approved';
    end if;
    return new;
  end if;

  -- Manual JMP: the fleet manager approves only after it is prepared, signed by the requester and by HSE.
  if tg_table_name = 'vehicle_requests' and old.status = 'submitted' and new.status = 'approved'
     and exists (select 1 from public.jmp_reviews where vehicle_request_id = new.id and step in ('prepare', 'requester', 'hse_manager') and decision is distinct from 'approved') then
    raise exception 'The journey management plan must be prepared, signed by the requester and signed by HSE before approval'
      using errcode = '23514', hint = 'jmp_pending';
  end if;

  if new.status in ('approved', 'rejected') and not v_approving then
    raise exception 'Approvals and rejections must go through approve_request or reject_request'
      using errcode = '42501', hint = 'use_rpc';
  end if;

  if not (
       (old.status = 'draft' and new.status = 'submitted')
    or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'draft'))
    or (old.status = 'approved' and new.status = 'completed')
    or (old.status = 'approved' and new.status = 'rejected' and tg_table_name = 'vehicle_requests')
    or (old.status = 'rejected' and new.status in ('draft', 'submitted'))
  ) then
    raise exception 'Illegal status change from % to %', old.status, new.status using errcode = '23514', hint = 'illegal_transition';
  end if;

  if new.status = 'rejected' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;

  if new.status = 'submitted' then
    perform public.notify_approvers(new.company_id, v_resource,
      format('%s awaiting approval', (select name from public.resources where key = v_resource)),
      'A request was submitted and needs a decision.', v_link || '/' || new.id);
  end if;
  return new;
end;
$$;

-- Manual JMP: the three steps are created when a long trip is sent.
create or replace function public.vehicle_requests_jmp_manual()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' and new.trip_type = 'long' and new.jmp_method = 'manual' then
    insert into public.jmp_reviews (company_id, vehicle_request_id, step, step_order, required_resource, created_by) values
      (new.company_id, new.id, 'prepare', 1, 'daily_use.trip_requests.jmp_prepare', new.created_by),
      (new.company_id, new.id, 'requester', 2, 'daily_use.trip_requests', new.created_by),
      (new.company_id, new.id, 'hse_manager', 3, 'daily_use.trip_requests.jmp_hse', new.created_by)
    on conflict (vehicle_request_id, step) do nothing;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.jmp_notify_monitors(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists vehicle_requests_jmp_manual on public.vehicle_requests;
-- Named to fire before vehicle_requests_workflow (triggers run in name order).
create trigger vehicle_requests_jmp_manual after update of status on public.vehicle_requests
  for each row execute function public.vehicle_requests_jmp_manual();

-- Control room and emergency response commander: emailed (and told in the app) once the JMP is complete.
create or replace function public.jmp_notify_monitors(p_request uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.vehicle_requests;
  v_summary jsonb;
  v_company_name text;
  p record;
  n integer := 0;
begin
  select * into r from public.vehicle_requests where id = p_request;
  if r.id is null or r.trip_type <> 'long' or r.status <> 'approved' or r.jmp_monitors_notified_at is not null then return 0; end if;
  -- Complete means: the HSE manager signed and no signing step is left.
  if not exists (select 1 from public.jmp_reviews where vehicle_request_id = p_request and step = 'hse_manager' and decision = 'approved')
     or exists (select 1 from public.jmp_reviews where vehicle_request_id = p_request and step in ('prepare', 'requester', 'hse_manager') and decision is distinct from 'approved') then
    return 0;
  end if;
  v_summary := public.workflow_request_summary('vehicle_requests', p_request);
  select name into v_company_name from public.companies where id = r.company_id;
  for p in
    select pr.id, pr.full_name,
           case when public.permission_scope_for(pr.id, 'daily_use.trip_requests.jmp_control_room', 'approve') is not null then 'Control room' else 'Emergency response commander' end as role_label
    from public.profiles pr
    where pr.company_id = r.company_id and pr.is_active
      and (public.permission_scope_for(pr.id, 'daily_use.trip_requests.jmp_control_room', 'approve') is not null
        or public.permission_scope_for(pr.id, 'daily_use.trip_requests.jmp_erc', 'approve') is not null)
  loop
    perform public.notify_user(p.id, 'system', 'Long trip to monitor', coalesce(v_summary ->> 'summary', 'A long trip') || ' is cleared to go.', '/daily-use/trip-requests/' || p_request, r.company_id);
    perform public.workflow_enqueue(r.company_id, p.id, null, null, 'jmp_monitor', jsonb_build_object(
      'name', coalesce(nullif(p.full_name, ''), 'there'),
      'company', coalesce(v_company_name, ''),
      'role', p.role_label,
      'request', 'vehicle request',
      'requester', v_summary ->> 'requester',
      'summary', v_summary ->> 'summary',
      'details', v_summary -> 'details',
      'record_table', 'vehicle_requests',
      'record_id', p_request,
      'path', v_summary ->> 'path'));
    n := n + 1;
  end loop;
  update public.vehicle_requests set jmp_monitors_notified_at = now() where id = p_request;
  return n;
end;
$$;

-- A JMP file must be attached to a step that needs one.
create or replace function public.jmp_step_has_file(p_review uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attachments a where a.table_name = 'jmp_reviews' and a.row_id = p_review and a.deleted_at is null);
$$;

-- Sign (or reject) a JMP step. Manual steps need their uploaded file; the requester signs their own.
create or replace function public.sign_jmp(p_request_id uuid, p_step text, p_decision text, p_signature jsonb default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_review public.jmp_reviews;
  v_req public.vehicle_requests;
  v_name text;
  v_pending integer;
  v_allowed boolean;
  v_manual boolean;
begin
  select * into v_req from public.vehicle_requests where id = p_request_id and deleted_at is null;
  if v_req.id is null then raise exception 'Request not found' using errcode = 'P0002'; end if;
  v_manual := coalesce(v_req.jmp_method, 'automatic') = 'manual';
  select * into v_review from public.jmp_reviews where vehicle_request_id = p_request_id and step = p_step;
  if v_review.id is null then raise exception 'No JMP step % on this request', p_step using errcode = 'P0002'; end if;
  if v_review.decision is not null then raise exception 'This step is already signed' using errcode = '23514', hint = 'already_signed'; end if;
  if p_step in ('control_room', 'emergency_commander') then
    raise exception 'The control room and the emergency response commander are informed by email; they do not sign' using errcode = '23514', hint = 'not_a_signing_step';
  end if;

  v_allowed := case p_step
    when 'prepare' then public.row_access('daily_use.trip_requests.jmp_prepare', 'approve', v_req.company_id, v_req.created_by)
                     or public.row_access('daily_use.trip_requests', 'approve', v_req.company_id, v_req.created_by)
                     or public.row_access('daily_use.trip_requests.jmp_hse', 'approve', v_req.company_id, v_req.created_by)
    when 'requester' then auth.uid() in (v_req.created_by, v_req.requester_id)
    else public.row_access(v_review.required_resource, 'approve', v_req.company_id, v_req.created_by) end;
  if not coalesce(v_allowed, false) then
    raise exception 'You do not have the role required for this JMP step' using errcode = '42501', hint = 'permission_denied';
  end if;
  if exists (select 1 from public.jmp_reviews r where r.vehicle_request_id = p_request_id and r.step_order < v_review.step_order and r.decision is distinct from 'approved' and r.step not in ('control_room', 'emergency_commander')) then
    raise exception 'Earlier JMP steps must be done first' using errcode = '23514', hint = 'out_of_order';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected' using errcode = '22023'; end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;
  if p_decision = 'approved' and v_manual and not public.jmp_step_has_file(v_review.id) then
    raise exception 'Upload the journey management plan for this step first' using errcode = '23514', hint = 'jmp_file_required';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();

  update public.jmp_reviews set
    reviewer_id = auth.uid(), signed_at = now(), decision = p_decision, rejection_reason = nullif(trim(p_reason), ''),
    signature = coalesce(p_signature, jsonb_build_object('name', v_name, 'user_id', auth.uid(), 'signed_at', now(), 'method', 'tick'))
  where id = v_review.id returning * into v_review;

  if p_decision = 'rejected' then
    perform set_config('fms.approving', 'on', true);
    update public.vehicle_requests set status = 'rejected', rejection_reason = 'JMP ' || replace(p_step, '_', ' ') || ': ' || trim(p_reason) where id = p_request_id;
    perform set_config('fms.approving', 'off', true);
    perform public.notify_user(v_req.created_by, 'rejection', 'Long trip JMP rejected', trim(p_reason), '/daily-use/trip-requests/' || p_request_id, v_req.company_id);
  else
    select count(*) into v_pending from public.jmp_reviews
    where vehicle_request_id = p_request_id and decision is distinct from 'approved' and step not in ('control_room', 'emergency_commander');
    if v_pending = 0 and not v_manual then
      perform public.notify_user(v_req.created_by, 'approval', 'Long trip fully cleared', 'The journey management plan is signed. You can download it from the request.', '/daily-use/trip-requests/' || p_request_id, v_req.company_id);
      perform public.jmp_notify_monitors(p_request_id);
    end if;
  end if;
  perform public.audit_write('sign_jmp', 'jmp_reviews', v_review.id::text, null, to_jsonb(v_review), v_req.company_id);
  return to_jsonb(v_review);
end;
$$;

-- Steps still counted as pending: only the signing steps.
create or replace function public.jmp_reviews_workflow_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pending integer;
begin
  perform set_config('fms.workflow_record', new.vehicle_request_id::text, true);
  if tg_op = 'INSERT' then
    if new.step_order = 1 then
      perform public.workflow_notify_step('vehicle_requests', new.vehicle_request_id);
    end if;
    return null;
  end if;
  if new.decision = 'approved' and old.decision is distinct from 'approved' then
    perform public.workflow_event('vehicle_requests', new.vehicle_request_id, new.company_id, new.step, 'approved');
    select count(*) into v_pending from public.jmp_reviews
    where vehicle_request_id = new.vehicle_request_id and decision is distinct from 'approved' and step not in ('control_room', 'emergency_commander');
    perform public.workflow_notify_step('vehicle_requests', new.vehicle_request_id);
    if v_pending = 0 and public.request_jmp_method(new.vehicle_request_id) = 'automatic' then
      perform public.workflow_notify_requester('vehicle_requests', new.vehicle_request_id, 'approved', auth.uid(), null, new.step);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.workflow_notify_step(p_table text, p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_step text;
  v_resource text;
  v_company uuid;
  v_created_by uuid;
  v_summary jsonb;
  v_company_name text;
  v_token text;
  v_actor record;
  v_cc text[];
  v_cc_names text[];
  v_in_app boolean := false;
  p record;
begin
  select o_step, o_resource into v_step, v_resource from public.workflow_current_step(p_table, p_id);
  -- Links of earlier steps stop working once the request moves on.
  update public.approval_links set used_at = now()
  where table_name = p_table and record_id = p_id and used_at is null and step is distinct from v_step;
  if v_step is null then return 0; end if;
  -- This step was already sent.
  if exists (select 1 from public.approval_links where table_name = p_table and record_id = p_id and step = v_step and used_at is null and expires_at > now()) then
    return 0;
  end if;

  execute format('select company_id, created_by from public.%I where id = $1', p_table) into v_company, v_created_by using p_id;
  v_summary := public.workflow_request_summary(p_table, p_id);
  select name into v_company_name from public.companies where id = v_company;

  -- Manual JMP: preparing falls back to the trip approvers when nobody has the prepare role.
  if v_step = 'prepare' and not exists (select 1 from public.workflow_approvers(v_company, v_resource, v_created_by)) then
    v_resource := 'daily_use.trip_requests';
  end if;
  if v_step = 'requester' then
    -- The requester signs the prepared JMP themselves.
    select pr.id as user_id, pr.full_name, nullif(trim(coalesce(pr.email, '')), '') as email, pr.phone, true as wants_email, 1::bigint as rank
      into v_actor from public.profiles pr where pr.id = v_created_by;
  else
    select * into v_actor from public.workflow_approvers(v_company, v_resource, v_created_by) where rank = 1;
  end if;
  if v_actor.user_id is null then return 0; end if;
  -- Steps that need a file (prepare, requester, manual HSE) are done in the app, not through the email link.
  v_in_app := v_step in ('prepare', 'requester') or (v_step = 'hse_manager' and public.request_jmp_method(p_id) = 'manual');

  for p in select * from public.workflow_approvers(v_company, v_resource, v_created_by) where rank > 1 and v_step <> 'requester' order by rank loop
    v_cc_names := coalesce(v_cc_names, '{}') || coalesce(nullif(p.full_name, ''), p.email);
    if p.email is not null and p.wants_email then
      v_cc := coalesce(v_cc, '{}') || p.email;
    end if;
  end loop;

  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.approval_links (company_id, user_id, table_name, record_id, step, token_hash)
  values (v_company, v_actor.user_id, p_table, p_id, v_step, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  perform public.workflow_enqueue(v_company, v_actor.user_id, null, null, case when v_in_app then 'jmp_task' else 'approval_request' end, jsonb_build_object(
    'record_table', p_table,
    'record_id', p_id,
    'name', coalesce(nullif(v_actor.full_name, ''), 'there'),
    'company', coalesce(v_company_name, ''),
    'request', public.workflow_request_label(p_table),
    'step', public.workflow_step_label(v_step),
    'requester', v_summary ->> 'requester',
    'summary', v_summary ->> 'summary',
    'details', v_summary -> 'details',
    'copied', coalesce(array_to_string(v_cc_names, ', '), ''),
    'path', case when v_in_app then v_summary ->> 'path' else '/a/' || v_token end,
    'expires', to_char(now() + interval '14 days', 'DD Mon YYYY')));

  -- One copy for everyone else responsible: no action button.
  if cardinality(v_cc) > 0 then
    insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
    values (v_company, null, 'email', v_cc[1], 'approval_copy', jsonb_build_object(
      'record_table', p_table,
      'record_id', p_id,
      'name', 'team',
      'company', coalesce(v_company_name, ''),
      'request', public.workflow_request_label(p_table),
      'step', public.workflow_step_label(v_step),
      'requester', v_summary ->> 'requester',
      'summary', v_summary ->> 'summary',
      'details', v_summary -> 'details',
      'approver', coalesce(nullif(v_actor.full_name, ''), 'the approver'),
      'cc', to_jsonb(v_cc[2:])));
  end if;
  return 1;
end;
$$;

create or replace function public.workflow_notify_requester(p_table text, p_id uuid, p_outcome text, p_actor uuid, p_reason text default null, p_step text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_summary jsonb;
  v_company_name text;
  v_actor_name text;
  v_user uuid;
  v_cc text[];
  v_own text;
begin
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  v_summary := public.workflow_request_summary(p_table, p_id);
  if v_summary is null then return; end if;
  v_user := nullif(v_summary ->> 'requester_id', '')::uuid;
  if v_user is null then return; end if;
  select name into v_company_name from public.companies where id = v_company;
  select full_name into v_actor_name from public.profiles where id = p_actor;
  select lower(email) into v_own from public.profiles where id = v_user;
  select array_agg(a.email order by a.rank) into v_cc
  from public.workflow_approvers(v_company, public.workflow_request_resource(p_table), v_user) a
  where a.email is not null and a.wants_email and lower(a.email) is distinct from v_own;
  perform public.workflow_enqueue(v_company, v_user, null, v_summary ->> 'requester_phone',
    case p_outcome when 'approved' then 'request_approved' else 'request_rejected' end,
    jsonb_build_object(
      'name', coalesce(nullif(v_summary ->> 'requester', ''), 'there'),
      'company', coalesce(v_company_name, ''),
      'request', public.workflow_request_label(p_table),
      'step', public.workflow_step_label(coalesce(p_step, 'approval')),
      'summary', v_summary ->> 'summary',
      'details', v_summary -> 'details',
      'approver', coalesce(nullif(v_actor_name, ''), 'the approver'),
      'reason', coalesce(p_reason, ''),
      'cc', coalesce(to_jsonb(v_cc), '[]'::jsonb),
      'record_table', p_table,
      'record_id', p_id,
      'path', v_summary ->> 'path'));
end;
$$;

-- JMP files: whoever may do a step may upload its file (stored under the trip request permission,
-- so everyone on the trip can open it).
create or replace function public.can_upload_jmp_file(p_review uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_review public.jmp_reviews;
  v_req public.vehicle_requests;
begin
  select * into v_review from public.jmp_reviews where id = p_review;
  if v_review.id is null or v_review.decision is not null then return false; end if;
  select * into v_req from public.vehicle_requests where id = v_review.vehicle_request_id;
  if v_req.company_id is distinct from public.my_company_id() then return false; end if;
  return case v_review.step
    when 'prepare' then public.has_permission('daily_use.trip_requests.jmp_prepare', 'approve') or public.has_permission('daily_use.trip_requests', 'approve') or public.has_permission('daily_use.trip_requests.jmp_hse', 'approve')
    when 'requester' then auth.uid() in (v_req.created_by, v_req.requester_id)
    when 'hse_manager' then public.has_permission('daily_use.trip_requests.jmp_hse', 'approve')
    else false end;
end;
$$;
grant execute on function public.can_upload_jmp_file(uuid) to authenticated;

drop policy if exists attachments_insert_jmp on public.attachments;
create policy attachments_insert_jmp on public.attachments for insert to authenticated
  with check (company_id = public.my_company_id() and table_name = 'jmp_reviews' and public.can_upload_jmp_file(row_id));

-- Storage: the upload of a JMP file is allowed the same way (the attachment row comes after the file).
create or replace function public.storage_jmp_upload_allowed(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_row uuid;
begin
  if cardinality(v_parts) < 4 or v_parts[2] <> 'jmp_reviews' then return false; end if;
  begin
    v_row := v_parts[3]::uuid;
  exception when others then
    return false;
  end;
  return v_parts[1] = public.my_company_id()::text and public.can_upload_jmp_file(v_row);
end;
$$;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    return;
  end if;
  execute 'drop policy if exists fms_storage_insert_jmp on storage.objects';
  execute $p$create policy fms_storage_insert_jmp on storage.objects for insert to authenticated
    with check (bucket_id = 'jmp' and public.storage_jmp_upload_allowed(name))$p$;
end $$;

-- ---------------------------------------------------------------------------
-- Request history: who viewed it, and every email about it
-- ---------------------------------------------------------------------------
create table if not exists public.record_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  user_id uuid not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  views integer not null default 1,
  unique (table_name, record_id, user_id)
);
alter table public.record_views enable row level security;
revoke all on public.record_views from public, anon, authenticated;
grant all on public.record_views to service_role;

-- Called when someone opens a request (in the app or through an email link).
create or replace function public.log_record_view(p_table text, p_id uuid, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_company uuid;
begin
  if v_user is null or p_table not in ('vehicle_requests', 'fuel_requests', 'leave_requests', 'maintenance_requests') then return; end if;
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  if v_company is null then return; end if;
  -- In the app, only people of the same company count.
  if p_user is null and v_company is distinct from public.my_company_id() then return; end if;
  insert into public.record_views (company_id, table_name, record_id, user_id) values (v_company, p_table, p_id, v_user)
  on conflict (table_name, record_id, user_id) do update set last_viewed_at = now(), views = public.record_views.views + 1;
end;
$$;
revoke all on function public.log_record_view(text, uuid, uuid) from public, anon;
grant execute on function public.log_record_view(text, uuid, uuid) to authenticated, service_role;

-- Everything that happened to a request, oldest first, for its printed document.
create or replace function public.request_history(p_table text, p_id uuid)
returns table (at timestamptz, action text, who text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid;
  v_created_at timestamptz;
  v_created_by uuid;
  v_resource text;
begin
  if p_table not in ('vehicle_requests', 'fuel_requests', 'leave_requests', 'maintenance_requests') then return; end if;
  execute format('select company_id, created_at, created_by from public.%I where id = $1', p_table) into v_company, v_created_at, v_created_by using p_id;
  if v_company is null or v_company is distinct from public.my_company_id() then return; end if;
  select resource_key into v_resource from public.table_resources where table_name = p_table;
  if not public.has_permission(v_resource, 'view') and v_created_by is distinct from auth.uid() then return; end if;

  return query
  select * from (
    select v_created_at, 'created'::text, coalesce((select full_name from public.profiles where id = v_created_by), 'Unknown'), null::text
    union all
    select e.created_at, e.action, coalesce(e.actor_name, (select full_name from public.profiles where id = e.actor_id), 'Unknown'),
           public.workflow_step_label(e.step) || coalesce(': ' || e.reason, '') || case when e.via = 'link' then ' (email link)' else '' end
    from public.approval_events e where e.table_name = p_table and e.record_id = p_id
    union all
    -- Requests without the email workflow (fuel, maintenance): decisions from the audit trail.
    select a.created_at, a.action, coalesce((select full_name from public.profiles where id = a.actor_id), 'Unknown'), null
    from public.audit_log a
    where a.table_name = p_table and a.row_id = p_id::text and a.action in ('approve', 'reject')
      and not exists (select 1 from public.approval_events e where e.table_name = p_table and e.record_id = p_id)
    union all
    select j.signed_at, 'jmp_' || j.decision, coalesce((select full_name from public.profiles where id = j.reviewer_id), 'Unknown'), public.workflow_step_label(j.step)
    from public.jmp_reviews j where p_table = 'vehicle_requests' and j.vehicle_request_id = p_id and j.signed_at is not null
      and not exists (select 1 from public.approval_events e where e.table_name = p_table and e.record_id = p_id and e.step = j.step)
    union all
    select coalesce(o.sent_at, o.created_at), 'emailed', o.recipient ||
             case when jsonb_array_length(coalesce(o.data -> 'cc', '[]'::jsonb)) > 0 then ' (cc ' || (select string_agg(x, ', ') from jsonb_array_elements_text(o.data -> 'cc') x) || ')' else '' end,
           case o.template when 'approval_request' then 'Asked to decide' when 'approval_copy' then 'Copy for information' when 'request_approved' then 'Told it was approved'
                           when 'request_rejected' then 'Told it was rejected' when 'jmp_task' then 'Asked to do a JMP step' when 'jmp_monitor' then 'Told to monitor the trip' else o.template end
    from public.message_outbox o
    where o.channel = 'email' and o.status = 'sent' and o.data ->> 'record_table' = p_table and o.data ->> 'record_id' = p_id::text
    union all
    select v.first_viewed_at, 'viewed', coalesce((select full_name from public.profiles where id = v.user_id), 'Unknown'),
           case when v.views > 1 then v.views || ' times, last ' || to_char(v.last_viewed_at at time zone 'Africa/Dar_es_Salaam', 'DD Mon YYYY HH24:MI') end
    from public.record_views v where v.table_name = p_table and v.record_id = p_id
  ) h(at, action, who, detail)
  where h.at is not null
  order by h.at;
end;
$$;
grant execute on function public.request_history(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Requests waiting on the signed-in user (the screen that stays until they act)
-- ---------------------------------------------------------------------------
create or replace function public.my_waiting_requests()
returns table (record_id uuid, table_name text, step text, step_label text, summary text, requester text, since timestamptz, in_app boolean)
language sql stable security definer set search_path = public as $$
  select l.record_id, l.table_name, l.step, public.workflow_step_label(l.step),
         public.workflow_request_summary(l.table_name, l.record_id) ->> 'summary',
         public.workflow_request_summary(l.table_name, l.record_id) ->> 'requester',
         l.created_at,
         l.step in ('prepare', 'requester') or (l.step = 'hse_manager' and public.request_jmp_method(l.record_id) = 'manual')
  from public.approval_links l
  where l.user_id = auth.uid() and l.used_at is null and l.expires_at > now() and l.table_name = 'vehicle_requests'
    and (select o_step from public.workflow_current_step(l.table_name, l.record_id)) = l.step
  order by l.created_at;
$$;
grant execute on function public.my_waiting_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Missed km log: a vehicle in service with no log yesterday raises an in-app alert (once a day)
-- ---------------------------------------------------------------------------
create or replace function public.notify_missed_km_logs(p_day date default (now() at time zone 'Africa/Dar_es_Salaam')::date - 1)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v record;
  p record;
  n integer := 0;
  v_title text;
begin
  for v in
    select ve.id, ve.company_id, ve.registration
    from public.vehicles ve
    where ve.deleted_at is null and ve.status = 'in_service' and ve.created_at::date <= p_day
      and not exists (select 1 from public.km_logs l where l.vehicle_id = ve.id and l.deleted_at is null and l.log_date = p_day)
  loop
    v_title := 'No km log for ' || v.registration || ' on ' || to_char(p_day, 'DD Mon YYYY');
    for p in
      select pr.id from public.profiles pr
      where pr.company_id = v.company_id and pr.is_active
        and public.permission_scope_for(pr.id, 'daily_use.km_log', 'edit') in ('all', 'department')
        and not exists (select 1 from public.notifications x where x.user_id = pr.id and x.title = v_title)
    loop
      perform public.notify_user(p.id, 'reminder', v_title, 'The daily kilometre log was not filled in. Add it so the record stays complete.',
        '/daily-use/km-log?vehicle=' || v.id, v.company_id);
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;
revoke all on function public.notify_missed_km_logs(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('fms-missed-km-logs');
    exception when others then null;
    end;
    perform cron.schedule('fms-missed-km-logs', '30 4 * * *', $cmd$select public.notify_missed_km_logs();$cmd$);
  end if;
end $$;
