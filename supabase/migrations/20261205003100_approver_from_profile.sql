-- 31: Approving a leave or maintenance request no longer asks for the approver's name and position:
-- they come from the signed-in person's profile (full name and job title).

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
begin
  select o_resource, o_row into v_resource, v_row from public.request_row_access(p_table, p_id, 'approve');
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be approved' using errcode = '23514', hint = 'illegal_transition';
  end if;
  select full_name, nullif(trim(coalesce(job_title, '')), '') into v_name, v_title_job from public.profiles where id = auth.uid();

  perform set_config('fms.approving', 'on', true);
  execute format(
    'update public.%I set status = ''approved'', approved_by = $1, approved_at = now(), approver_signature = $2, rejection_reason = null
     where id = $3 returning to_jsonb(%I.*)', p_table, p_table)
    into v_after using auth.uid(), coalesce(p_signature, jsonb_build_object('name', v_name, 'user_id', auth.uid(), 'signed_at', now(), 'method', 'tick')), p_id;

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
