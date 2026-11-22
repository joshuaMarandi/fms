-- A person's signature is kept after they draw it the first time. From then on every signature box is
-- filled with it (they only press Submit or Approve), and approvals from an email link carry it too.

alter table public.profiles add column if not exists signature_image text;
alter table public.profiles drop constraint if exists profiles_signature_image_check;
alter table public.profiles add constraint profiles_signature_image_check
  check (signature_image is null or (signature_image like 'data:image/png;base64,%' and length(signature_image) <= 300000));

-- Keep (or clear, with null) the signed-in person's drawn signature.
create or replace function public.save_my_signature(p_image text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_image is not null and (p_image not like 'data:image/png;base64,%' or length(p_image) > 300000) then
    raise exception 'The signature must be a drawn image' using errcode = '22023', hint = 'bad_signature';
  end if;
  update public.profiles set signature_image = p_image where id = auth.uid();
end;
$$;
revoke all on function public.save_my_signature(text) from public, anon;
grant execute on function public.save_my_signature(text) to authenticated;

-- The signed-in person's signature now: their kept drawing, else a tick with their name.
create or replace function public.my_default_signature()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.signature_image is not null
    then jsonb_build_object('method', 'draw', 'name', p.full_name, 'user_id', p.id, 'signed_at', now(), 'image', p.signature_image)
    else jsonb_build_object('method', 'tick', 'name', p.full_name, 'user_id', p.id, 'signed_at', now()) end
  from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_default_signature() from public, anon;
grant execute on function public.my_default_signature() to authenticated;

create or replace function public.approve_request(p_table text, p_id uuid, p_signature jsonb default null, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_resource text;
  v_row jsonb;
  v_after jsonb;
  v_name text;
  v_title_job text;
  v_title text;
  v_step text;
  v_order integer := 0;
  v_staged jsonb;
begin
  -- Requests with several approval steps: an earlier step moves the request on; the last step approves it.
  if public.is_staged(p_table) then
    v_staged := public.staged_advance(p_table, p_id, p_signature, p_extra);
    if (v_staged ->> 'final')::boolean is not true then
      return v_staged -> 'row';
    end if;
    v_resource := public.workflow_request_resource(p_table);
    execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.deleted_at is null', p_table) into v_row using p_id;
  else
    select o_resource, o_row into v_resource, v_row from public.request_row_access(p_table, p_id, 'approve');
  end if;
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be approved' using errcode = '23514', hint = 'illegal_transition';
  end if;
  select full_name, nullif(trim(coalesce(job_title, '')), '') into v_name, v_title_job from public.profiles where id = auth.uid();

  perform set_config('fms.approving', 'on', true);
  execute format(
    'update public.%I set status = ''approved'', approved_by = $1, approved_at = now(), approver_signature = $2, rejection_reason = null
     where id = $3 returning to_jsonb(%I.*)', p_table, p_table)
    into v_after using auth.uid(), coalesce(p_signature, public.my_default_signature()), p_id;

  -- Table-specific approval data
  if p_table = 'fuel_requests' then
    update public.fuel_requests set approved_l = coalesce((p_extra ->> 'approved_l')::numeric, fuel_required_l) where id = p_id;
  elsif p_table in ('maintenance_requests', 'leave_requests') then
    -- The approver's name and position come from the signed-in person's profile.
    execute format('update public.%I set approver_name = coalesce(nullif(trim($1), ''''), $3, approver_name), approver_position = coalesce(nullif(trim($2), ''''), $5, approver_position) where id = $4', p_table)
      using p_extra ->> 'approver_name', p_extra ->> 'approver_position', v_name, p_id, v_title_job;
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

create or replace function public.staged_advance(p_table text, p_id uuid, p_signature jsonb, p_extra jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_step text := public.staged_check(p_table, p_id);
  v_next text;
  v_company uuid;
  v_row jsonb;
begin
  select s.step into v_next from public.staged_steps(p_table) s
  where s.ord > (select x.ord from public.staged_steps(p_table) x where x.step = v_step) order by s.ord limit 1;
  -- The fleet manager approves the petty cash amount (the amount asked for unless changed).
  if p_table = 'petty_cash_requests' and v_step = 'approval' then
    update public.petty_cash_requests set amount_approved_tzs = coalesce(nullif(p_extra ->> 'amount_approved', '')::numeric, amount_requested_tzs) where id = p_id;
  end if;
  if v_next is null then
    return jsonb_build_object('final', true);
  end if;
  execute format('update public.%I set approval_step = $1 where id = $2 returning company_id, to_jsonb(%I.*)', p_table, p_table)
    into v_company, v_row using v_next, p_id;
  perform public.workflow_event(p_table, p_id, v_company, v_step, 'approved');
  insert into public.approval_signoffs (company_id, table_name, record_id, step, signed_by, signer_name, signer_position, signature)
  select v_company, p_table, p_id, v_step, auth.uid(), pr.full_name, nullif(trim(coalesce(pr.job_title, '')), ''), coalesce(p_signature, public.my_default_signature())
  from public.profiles pr where pr.id = auth.uid();
  perform set_config('fms.workflow_record', p_id::text, true);
  perform public.workflow_notify_step(p_table, p_id);
  return jsonb_build_object('final', false, 'row', v_row);
end;
$$;

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
    signature = coalesce(p_signature, public.my_default_signature())
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
