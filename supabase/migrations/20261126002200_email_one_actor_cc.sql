-- 22: Approval emails go to one person who acts; everyone else responsible gets a copy.
--   * The step's approver (one person) gets the email with the action button (a personal link) and the SMS.
--     Chosen in this order: an approver for the requester's own department, then a named approver
--     before company admins and owners, then by name.
--   * The other people who may approve get one copy email (they are in CC), with no action button.
--   * The result email to the requester (approved or rejected) copies the approvers.
-- The others can still decide from inside the app, as before; only the email action is limited.

create or replace function public.workflow_request_resource(p_table text)
returns text language sql immutable as $$
  select case p_table when 'leave_requests' then 'expenses.leave.requests' when 'vehicle_requests' then 'daily_use.trip_requests' end;
$$;

-- Approvers of a resource for a request, best first (rank 1 is the one who acts by email).
create or replace function public.workflow_approvers(p_company uuid, p_resource text, p_requester uuid)
returns table (user_id uuid, full_name text, email text, phone text, wants_email boolean, rank bigint)
language sql stable security definer set search_path = public as $$
  with req as (select department from public.profiles where id = p_requester),
  cand as (
    select pr.id, pr.full_name, pr.email, pr.phone, pr.department, pr.notification_prefs,
           public.permission_scope_for(pr.id, p_resource, 'approve') as scope,
           exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                   where ur.user_id = pr.id and (r.is_admin or r.is_owner)) as is_admin
    from public.profiles pr
    where pr.company_id = p_company and pr.is_active and pr.id is distinct from p_requester
  )
  select c.id, c.full_name, nullif(trim(coalesce(c.email, '')), ''), c.phone,
         coalesce((c.notification_prefs ->> 'email')::boolean, true),
         row_number() over (
           order by (c.scope = 'department' and c.department is not null and c.department = (select department from req)) desc,
                    c.is_admin asc, c.full_name, c.id)
  from cand c
  where c.scope in ('all', 'department');
$$;

-- The current step: a personal link and the action email to one approver; a copy to the rest.
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

  select * into v_actor from public.workflow_approvers(v_company, v_resource, v_created_by) where rank = 1;
  if v_actor.user_id is null then return 0; end if;

  for p in select * from public.workflow_approvers(v_company, v_resource, v_created_by) where rank > 1 order by rank loop
    v_cc_names := coalesce(v_cc_names, '{}') || coalesce(nullif(p.full_name, ''), p.email);
    if p.email is not null and p.wants_email then
      v_cc := coalesce(v_cc, '{}') || p.email;
    end if;
  end loop;

  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.approval_links (company_id, user_id, table_name, record_id, step, token_hash)
  values (v_company, v_actor.user_id, p_table, p_id, v_step, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  perform public.workflow_enqueue(v_company, v_actor.user_id, null, null, 'approval_request', jsonb_build_object(
    'name', coalesce(nullif(v_actor.full_name, ''), 'there'),
    'company', coalesce(v_company_name, ''),
    'request', public.workflow_request_label(p_table),
    'step', public.workflow_step_label(v_step),
    'requester', v_summary ->> 'requester',
    'summary', v_summary ->> 'summary',
    'details', v_summary -> 'details',
    'copied', coalesce(array_to_string(v_cc_names, ', '), ''),
    'path', '/a/' || v_token,
    'expires', to_char(now() + interval '14 days', 'DD Mon YYYY')));

  -- One copy for everyone else responsible: no action button.
  if cardinality(v_cc) > 0 then
    insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
    values (v_company, null, 'email', v_cc[1], 'approval_copy', jsonb_build_object(
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

-- The requester hears the outcome; the approvers are copied.
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
      'path', v_summary ->> 'path'));
end;
$$;
