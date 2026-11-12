-- FMS
-- Migration 14: approval workflow messages for leave and vehicle requests (email and SMS with a
-- personal link that works without signing in), editable email and SMS templates, and the engine
-- type of a vehicle with fuel prices per engine type.

-- ---------------------------------------------------------------------------
-- Engine type and fuel prices per engine type
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists engine_type text;
alter table public.vehicles drop constraint if exists vehicles_engine_type_check;
alter table public.vehicles add constraint vehicles_engine_type_check
  check (engine_type is null or engine_type in ('diesel', 'petrol', 'electric', 'gas'));

alter table public.fuel_prices add column if not exists engine_type text not null default 'all';
alter table public.fuel_prices drop constraint if exists fuel_prices_engine_type_check;
alter table public.fuel_prices add constraint fuel_prices_engine_type_check
  check (engine_type in ('all', 'diesel', 'petrol', 'electric', 'gas'));
alter table public.fuel_prices drop constraint if exists fuel_prices_company_id_effective_from_key;
alter table public.fuel_prices drop constraint if exists fuel_prices_company_engine_from_key;
alter table public.fuel_prices add constraint fuel_prices_company_engine_from_key unique (company_id, engine_type, effective_from);

-- Price in force for an engine type on a date: the latest price for that engine type, else the
-- latest price for all engine types, else the older company setting, else 0.
create or replace function public.fuel_price_on(p_company uuid, p_date date, p_engine_type text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select price_per_litre from public.fuel_prices
      where company_id = p_company and deleted_at is null and engine_type = p_engine_type
        and effective_from <= coalesce(p_date, current_date)
      order by effective_from desc limit 1),
    (select price_per_litre from public.fuel_prices
      where company_id = p_company and deleted_at is null and engine_type = 'all'
        and effective_from <= coalesce(p_date, current_date)
      order by effective_from desc limit 1),
    (select nullif(settings ->> 'fuel_price_per_litre', '')::numeric from public.companies where id = p_company),
    0);
$$;
grant execute on function public.fuel_price_on(uuid, date, text) to authenticated;

create or replace function public.fuel_price_on(p_company uuid, p_date date default current_date)
returns numeric language sql stable security definer set search_path = public as $$
  select public.fuel_price_on(p_company, p_date, 'all');
$$;

create or replace function public.vehicle_engine_type(p_vehicle uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(engine_type, 'all') from public.vehicles where id = p_vehicle;
$$;

create or replace function public.fuel_issues_defaults()
returns trigger language plpgsql as $$
declare
  v_tank numeric;
begin
  if coalesce(new.price_per_litre, 0) = 0 then
    new.price_per_litre := public.fuel_price_on(new.company_id, new.issue_date, public.vehicle_engine_type(new.vehicle_id));
  end if;
  if new.balance_l is null then
    select fuel_tank_capacity_l into v_tank from public.vehicles where id = new.vehicle_id;
    if v_tank is not null and new.fuel_filled_l is not null then
      new.balance_l := greatest(v_tank - new.fuel_issued_l, 0);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fuel_expenses_defaults()
returns trigger language plpgsql as $$
declare v_target numeric;
begin
  if coalesce(new.price_per_litre, 0) = 0 then
    new.price_per_litre := public.fuel_price_on(new.company_id, new.expense_date, public.vehicle_engine_type(new.vehicle_id));
  end if;
  if new.target_km_per_l is null then
    select target_km_per_l into v_target from public.vehicles where id = new.vehicle_id;
    new.target_km_per_l := v_target;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Message templates: wording only. Placeholders such as {name} stay; the values come from the record.
-- company_id null is the platform default kept by the owner; a company row overrides it.
-- ---------------------------------------------------------------------------
insert into public.resources (key, parent_key, name, path, icon, sort_order) values
  ('settings.templates', 'settings', 'Email and SMS templates', '/settings/templates', 'mail', 906)
on conflict (key) do nothing;

-- Whoever may see or edit the company settings may see or edit the templates.
insert into public.role_grants (role_id, resource_key, actions, scope)
select g.role_id, 'settings.templates', g.actions, g.scope from public.role_grants g
where g.resource_key = 'settings.company'
on conflict (role_id, resource_key) do nothing;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  key text not null,
  content jsonb not null default '{}'::jsonb,       -- subject, heading, greeting, paragraphs, button, note or text (SMS)
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists message_templates_company_key on public.message_templates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);
-- Own audit trigger: the shared one would fill a missing company_id, and null means the platform default here.
create or replace function public.message_templates_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.company_id := old.company_id;
    new.key := old.key;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists message_templates_audit on public.message_templates;
create trigger message_templates_audit before insert or update on public.message_templates for each row execute function public.message_templates_audit();

alter table public.message_templates enable row level security;
drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates for select to authenticated
  using ((company_id is null and (public.is_owner() or public.has_permission('settings.templates', 'view')))
      or (company_id = public.my_company_id() and public.has_permission('settings.templates', 'view')));
drop policy if exists message_templates_write on public.message_templates;
create policy message_templates_write on public.message_templates for all to authenticated
  using ((company_id is null and public.is_owner())
      or (company_id = public.my_company_id() and public.has_permission('settings.templates', 'edit')))
  with check ((company_id is null and public.is_owner())
      or (company_id = public.my_company_id() and public.has_permission('settings.templates', 'edit')));
grant all on public.message_templates to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Outbox: every email and SMS of the approval workflow, sent by the app server.
-- Approval links: one per approver and step, stored as a hash; the raw token is only in the message.
-- Approval events: the history of a request (submitted, approved, rejected, resubmitted).
-- None of these are readable through the API; the app reads them with the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid,
  channel text not null check (channel in ('email', 'sms')),
  recipient text not null,
  template text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  provider_ref text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);
create index if not exists message_outbox_pending on public.message_outbox (created_at) where status in ('pending', 'sending');
alter table public.message_outbox enable row level security;
revoke all on public.message_outbox from public, anon, authenticated;
grant all on public.message_outbox to service_role;

create table if not exists public.approval_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  table_name text not null check (table_name in ('leave_requests', 'vehicle_requests')),
  record_id uuid not null,
  step text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approval_links_record on public.approval_links (table_name, record_id) where used_at is null;
alter table public.approval_links enable row level security;
revoke all on public.approval_links from public, anon, authenticated;
grant all on public.approval_links to service_role;

create table if not exists public.approval_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  step text not null,
  action text not null check (action in ('submitted', 'resubmitted', 'approved', 'rejected')),
  actor_id uuid,
  actor_name text,
  reason text,
  via text not null default 'app' check (via in ('app', 'link')),
  created_at timestamptz not null default now()
);
create index if not exists approval_events_record on public.approval_events (table_name, record_id, created_at);
alter table public.approval_events enable row level security;
-- Visible with the request itself: anyone who may view the request table's resource in the company.
drop policy if exists approval_events_select on public.approval_events;
create policy approval_events_select on public.approval_events for select to authenticated
  using (company_id = public.my_company_id()
    and public.has_permission(case table_name when 'leave_requests' then 'expenses.leave.requests' else 'daily_use.trip_requests' end, 'view'));
revoke all on public.approval_events from public, anon, authenticated;
grant select on public.approval_events to authenticated;
grant all on public.approval_events to service_role;

-- ---------------------------------------------------------------------------
-- Workflow helpers
-- ---------------------------------------------------------------------------
create or replace function public.workflow_step_label(p_step text)
returns text language sql immutable as $$
  select case p_step
    when 'approval' then 'Approval'
    when 'hse_manager' then 'HSE manager sign-off (journey management plan)'
    when 'control_room' then 'Control room sign-off (journey management plan)'
    when 'emergency_commander' then 'Emergency response commander sign-off (journey management plan)'
    else initcap(replace(p_step, '_', ' ')) end;
$$;

create or replace function public.workflow_request_label(p_table text)
returns text language sql immutable as $$
  select case p_table when 'leave_requests' then 'leave request' when 'vehicle_requests' then 'vehicle request' else 'request' end;
$$;

-- Requester, short summary and details (label and value pairs) of a request, for messages and the link page.
create or replace function public.workflow_request_summary(p_table text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v jsonb;
begin
  if p_table = 'leave_requests' then
    select l.*, coalesce(nullif(e.full_name, ''), d.full_name, c.full_name) as who, cat.name as category
      into r
    from public.leave_requests l
    left join public.profiles e on e.id = l.employee_id
    left join public.drivers d on d.id = l.driver_id
    left join public.profiles c on c.id = l.created_by
    left join public.leave_categories cat on cat.id = l.category_id
    where l.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', null,
      'summary', coalesce(r.category, 'Leave') || ', ' || to_char(r.date_from, 'DD Mon YYYY') || ' to ' || to_char(r.date_to, 'DD Mon YYYY'),
      'path', '/expenses/leave/requests/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Employee', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Leave type', 'value', coalesce(r.category, '')),
        jsonb_build_object('label', 'From', 'value', to_char(r.date_from, 'DD Mon YYYY')),
        jsonb_build_object('label', 'To', 'value', to_char(r.date_to, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Days', 'value', r.total_days::text)
      ) || case when coalesce(r.reason, '') <> '' then jsonb_build_array(jsonb_build_object('label', 'Reason', 'value', r.reason)) else '[]'::jsonb end);
  elsif p_table = 'vehicle_requests' then
    select q.*, coalesce(nullif(q.requester_name, ''), c.full_name) as who, coalesce(nullif(q.requester_phone, ''), c.phone) as who_phone
      into r
    from public.vehicle_requests q
    left join public.profiles c on c.id = q.created_by
    where q.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', initcap(r.trip_type) || ' trip to ' || coalesce(r.destination, '') || ' on ' || to_char(r.date_needed, 'DD Mon YYYY'),
      'path', '/daily-use/trip-requests/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Requested by', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Trip', 'value', case r.trip_type when 'long' then 'Long trip' else 'Short trip' end),
        jsonb_build_object('label', 'Date', 'value', to_char(r.date_needed, 'DD Mon YYYY') || coalesce(' to ' || to_char(r.date_to, 'DD Mon YYYY'), '')),
        jsonb_build_object('label', 'Time', 'value', coalesce(to_char(r.time_from, 'HH24:MI'), '') || coalesce(' to ' || to_char(r.time_to, 'HH24:MI'), '')),
        jsonb_build_object('label', 'Destination', 'value', coalesce(r.destination, '')),
        jsonb_build_object('label', 'Purpose', 'value', coalesce(r.purpose, '')),
        jsonb_build_object('label', 'People', 'value', coalesce(r.occupants::text, ''))
      ));
  else
    return null;
  end if;
  return v;
end;
$$;

-- The step waiting for a decision: 'approval' while submitted, the first unsigned JMP step while a long
-- trip is approved, else null (the request reached its end).
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
    if v_status = 'submitted' then
      o_step := 'approval'; o_resource := 'daily_use.trip_requests';
    elsif v_status = 'approved' then
      select step, required_resource into o_step, o_resource from public.jmp_reviews
      where vehicle_request_id = p_id and decision is null order by step_order limit 1;
    end if;
  end if;
end;
$$;

-- Messages to a person: one email and one SMS (when they have an address or number and did not turn it off).
create or replace function public.workflow_enqueue(p_company uuid, p_user uuid, p_email text, p_phone text, p_template text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prefs jsonb;
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
begin
  if p_user is not null then
    select notification_prefs, coalesce(v_email, nullif(email, '')), coalesce(v_phone, nullif(regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g'), ''))
      into v_prefs, v_email, v_phone
    from public.profiles where id = p_user and is_active;
    if not found then return; end if;
  end if;
  if v_email is not null and coalesce((v_prefs ->> 'email')::boolean, true) then
    insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
    values (p_company, p_user, 'email', v_email, p_template, p_data);
  end if;
  if v_phone is not null and coalesce((v_prefs ->> 'sms')::boolean, true) then
    insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
    values (p_company, p_user, 'sms', v_phone, p_template, p_data);
  end if;
end;
$$;

-- Send the current step of a request to everyone who may decide it, each with a personal link.
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
  p record;
  n integer := 0;
begin
  select o_step, o_resource into v_step, v_resource from public.workflow_current_step(p_table, p_id);
  -- Links of earlier steps stop working once the request moves on.
  update public.approval_links set used_at = now()
  where table_name = p_table and record_id = p_id and used_at is null and step is distinct from v_step;
  if v_step is null then return 0; end if;

  execute format('select company_id, created_by from public.%I where id = $1', p_table) into v_company, v_created_by using p_id;
  v_summary := public.workflow_request_summary(p_table, p_id);
  select name into v_company_name from public.companies where id = v_company;

  for p in
    select pr.id, pr.full_name, pr.email, pr.phone
    from public.profiles pr
    where pr.company_id = v_company and pr.is_active and pr.id is distinct from v_created_by
      and public.permission_scope_for(pr.id, v_resource, 'approve') in ('all', 'department')
  loop
    -- One open link per person and step.
    if exists (select 1 from public.approval_links where table_name = p_table and record_id = p_id and step = v_step and user_id = p.id and used_at is null and expires_at > now()) then
      continue;
    end if;
    v_token := replace(gen_random_uuid()::text, '-', '');
    insert into public.approval_links (company_id, user_id, table_name, record_id, step, token_hash)
    values (v_company, p.id, p_table, p_id, v_step, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
    perform public.workflow_enqueue(v_company, p.id, null, null, 'approval_request', jsonb_build_object(
      'name', coalesce(nullif(p.full_name, ''), 'there'),
      'company', coalesce(v_company_name, ''),
      'request', public.workflow_request_label(p_table),
      'step', public.workflow_step_label(v_step),
      'requester', v_summary ->> 'requester',
      'summary', v_summary ->> 'summary',
      'details', v_summary -> 'details',
      'path', '/a/' || v_token,
      'expires', to_char(now() + interval '14 days', 'DD Mon YYYY')));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Tell the requester the outcome (approved at the end, or rejected at any step).
create or replace function public.workflow_notify_requester(p_table text, p_id uuid, p_outcome text, p_actor uuid, p_reason text default null, p_step text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_summary jsonb;
  v_company_name text;
  v_actor_name text;
  v_user uuid;
begin
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  v_summary := public.workflow_request_summary(p_table, p_id);
  if v_summary is null then return; end if;
  v_user := nullif(v_summary ->> 'requester_id', '')::uuid;
  if v_user is null then return; end if;
  select name into v_company_name from public.companies where id = v_company;
  select full_name into v_actor_name from public.profiles where id = p_actor;
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
      'path', v_summary ->> 'path'));
end;
$$;

create or replace function public.workflow_event(p_table text, p_id uuid, p_company uuid, p_step text, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.approval_events (company_id, table_name, record_id, step, action, actor_id, actor_name, reason, via)
  values (p_company, p_table, p_id, p_step, p_action, auth.uid(), (select full_name from public.profiles where id = auth.uid()),
          nullif(trim(coalesce(p_reason, '')), ''), case when coalesce(current_setting('fms.via', true), '') = 'link' then 'link' else 'app' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- In-app notifications about a workflow request are already sent by email by the workflow,
-- so the daily digest skips them (notify_user marks them emailed).
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_company uuid default null, p_reminder uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_record text := nullif(current_setting('fms.workflow_record', true), '');
begin
  if p_user is null then return; end if;
  insert into public.notifications (company_id, user_id, kind, title, body, link, reminder_id, emailed_at)
  values (coalesce(p_company, (select company_id from public.profiles where id = p_user)), p_user, p_kind, p_title, p_body, p_link, p_reminder,
          case when v_record is not null and p_link like '%' || v_record then now() end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Status guard: a vehicle request rejected at a JMP step resumes at that step when it is sent again
-- (the approval and earlier signatures stand).
-- ---------------------------------------------------------------------------
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

  -- Resume a long trip at the JMP step that rejected it.
  if tg_table_name = 'vehicle_requests' and new.status = 'submitted' and old.status in ('draft', 'rejected')
     and exists (select 1 from public.jmp_reviews where vehicle_request_id = new.id and decision = 'rejected') then
    update public.jmp_reviews set decision = null, reviewer_id = null, signed_at = null, signature = null, rejection_reason = null
    where vehicle_request_id = new.id and decision = 'rejected';
    new.status := 'approved';
    new.rejection_reason := null;
    return new;
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

-- After a status change of a leave or vehicle request: history, then messages for the next step or the end.
create or replace function public.requests_workflow_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.status::text end;
  v_new text := new.status::text;
  v_step text;
  v_pending integer;
  v_has_jmp boolean := false;
begin
  if v_old is not distinct from v_new then return null; end if;
  perform set_config('fms.workflow_record', new.id::text, true);

  if v_new = 'submitted' then
    perform public.workflow_event(tg_table_name, new.id, new.company_id, 'approval', case when v_old = 'rejected' or v_old = 'draft' and exists (select 1 from public.approval_events e where e.table_name = tg_table_name and e.record_id = new.id and e.action = 'rejected') then 'resubmitted' else 'submitted' end);
    perform public.workflow_notify_step(tg_table_name, new.id);

  elsif v_new = 'approved' then
    if tg_table_name = 'vehicle_requests' then
      v_has_jmp := exists (select 1 from public.jmp_reviews where vehicle_request_id = new.id);
    end if;
    if v_old = 'submitted' then
      perform public.workflow_event(tg_table_name, new.id, new.company_id, 'approval', 'approved');
    else
      -- Sent again after a JMP rejection: back at the JMP step.
      select step into v_step from public.jmp_reviews where vehicle_request_id = new.id and decision is null order by step_order limit 1;
      perform public.workflow_event(tg_table_name, new.id, new.company_id, coalesce(v_step, 'approval'), 'resubmitted');
    end if;
    if tg_table_name = 'vehicle_requests' and ((to_jsonb(new) ->> 'trip_type') = 'long' or v_has_jmp) then
      -- JMP steps are created right after the approval; the jmp_reviews trigger sends the first one.
      if v_has_jmp then
        select count(*) into v_pending from public.jmp_reviews where vehicle_request_id = new.id and decision is distinct from 'approved';
        if v_pending > 0 then
          perform public.workflow_notify_step(tg_table_name, new.id);
        else
          perform public.workflow_notify_requester(tg_table_name, new.id, 'approved', auth.uid());
        end if;
      end if;
    else
      perform public.workflow_notify_step(tg_table_name, new.id);
      perform public.workflow_notify_requester(tg_table_name, new.id, 'approved', auth.uid());
    end if;

  elsif v_new = 'rejected' then
    v_step := 'approval';
    if tg_table_name = 'vehicle_requests' then
      select step into v_step from public.jmp_reviews where vehicle_request_id = new.id and decision = 'rejected' order by step_order limit 1;
      v_step := coalesce(v_step, 'approval');
    end if;
    perform public.workflow_event(tg_table_name, new.id, new.company_id, v_step, 'rejected', new.rejection_reason);
    perform public.workflow_notify_step(tg_table_name, new.id);
    perform public.workflow_notify_requester(tg_table_name, new.id, 'rejected', auth.uid(), new.rejection_reason, v_step);
  else
    perform public.workflow_notify_step(tg_table_name, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists leave_requests_workflow on public.leave_requests;
create trigger leave_requests_workflow after insert or update of status on public.leave_requests
  for each row execute function public.requests_workflow_after();
drop trigger if exists vehicle_requests_workflow on public.vehicle_requests;
create trigger vehicle_requests_workflow after insert or update of status on public.vehicle_requests
  for each row execute function public.requests_workflow_after();

-- JMP steps: the first step is created after the approval; each signature moves to the next step.
create or replace function public.jmp_reviews_workflow_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pending integer;
begin
  perform set_config('fms.workflow_record', new.vehicle_request_id::text, true);
  if tg_op = 'INSERT' then
    -- Once per approval: when the first step row arrives the step is known.
    if new.step_order = 1 then
      perform public.workflow_notify_step('vehicle_requests', new.vehicle_request_id);
    end if;
    return null;
  end if;
  if new.decision = 'approved' and old.decision is distinct from 'approved' then
    perform public.workflow_event('vehicle_requests', new.vehicle_request_id, new.company_id, new.step, 'approved');
    select count(*) into v_pending from public.jmp_reviews where vehicle_request_id = new.vehicle_request_id and decision is distinct from 'approved';
    if v_pending = 0 then
      perform public.workflow_notify_step('vehicle_requests', new.vehicle_request_id);
      perform public.workflow_notify_requester('vehicle_requests', new.vehicle_request_id, 'approved', auth.uid(), null, new.step);
    else
      perform public.workflow_notify_step('vehicle_requests', new.vehicle_request_id);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists jmp_reviews_workflow on public.jmp_reviews;
create trigger jmp_reviews_workflow after insert or update of decision on public.jmp_reviews
  for each row execute function public.jmp_reviews_workflow_after();

-- ---------------------------------------------------------------------------
-- Approval links (called by the app server with the service role; the person does not sign in)
-- ---------------------------------------------------------------------------
create or replace function public.approval_link_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.approval_links;
  v_step text;
  v_resource text;
  v_state text := 'open';
  v_status text;
begin
  select * into l from public.approval_links where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if l.id is null then
    return jsonb_build_object('state', 'not_found');
  end if;
  select o_step, o_resource into v_step, v_resource from public.workflow_current_step(l.table_name, l.record_id);
  execute format('select status::text from public.%I where id = $1', l.table_name) into v_status using l.record_id;
  if v_step is distinct from l.step then
    v_state := 'done';
  elsif l.used_at is not null then
    v_state := 'done';
  elsif l.expires_at < now() then
    v_state := 'expired';
  elsif public.permission_scope_for(l.user_id, v_resource, 'approve') is null then
    v_state := 'no_access';
  end if;
  return jsonb_build_object(
    'state', v_state,
    'link_id', l.id,
    'company_id', l.company_id,
    'user_id', l.user_id,
    'table', l.table_name,
    'record_id', l.record_id,
    'step', l.step,
    'step_label', public.workflow_step_label(l.step),
    'request_label', public.workflow_request_label(l.table_name),
    'status', v_status,
    'expires_at', l.expires_at,
    'summary', public.workflow_request_summary(l.table_name, l.record_id));
end;
$$;

-- Decide through a link: acts as the person the link was sent to, with their permissions.
create or replace function public.approval_link_decide(p_token text, p_decision text, p_reason text default null, p_extra jsonb default '{}'::jsonb, p_signature jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link jsonb := public.approval_link_open(p_token);
  v_user uuid;
  v_table text;
  v_id uuid;
  v_step text;
  v_result jsonb;
begin
  if v_link ->> 'state' <> 'open' then
    raise exception 'This link can no longer be used (%)', v_link ->> 'state' using errcode = '22023', hint = 'link_' || (v_link ->> 'state');
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;
  v_user := (v_link ->> 'user_id')::uuid;
  v_table := v_link ->> 'table';
  v_id := (v_link ->> 'record_id')::uuid;
  v_step := v_link ->> 'step';

  -- Act as the person: every permission check, audit entry and signature uses their account.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('fms.via', 'link', true);

  if v_step = 'approval' then
    if p_decision = 'approved' then
      v_result := public.approve_request(v_table, v_id, p_signature, coalesce(p_extra, '{}'::jsonb));
    else
      v_result := public.reject_request(v_table, v_id, p_reason);
    end if;
  else
    v_result := public.sign_jmp(v_id, v_step, p_decision, p_signature, p_reason);
  end if;

  update public.approval_links set used_at = now()
  where table_name = v_table and record_id = v_id and step = v_step and used_at is null;
  perform set_config('fms.via', '', true);
  return jsonb_build_object('ok', true, 'decision', p_decision, 'next', (select o_step from public.workflow_current_step(v_table, v_id)));
end;
$$;

revoke all on function public.approval_link_open(text) from public, anon, authenticated;
revoke all on function public.approval_link_decide(text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.approval_link_open(text) to service_role;
grant execute on function public.approval_link_decide(text, text, text, jsonb, jsonb) to service_role;
revoke all on function public.workflow_notify_step(text, uuid) from public, anon, authenticated;
revoke all on function public.workflow_notify_requester(text, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.workflow_enqueue(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.workflow_event(text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.workflow_request_summary(text, uuid) from public, anon, authenticated;
