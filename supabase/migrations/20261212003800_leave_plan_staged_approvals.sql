-- (1) Leave plan: planned months, entitled days (28 a year) and days carried forward, kept in step with
--     the leave balance. Leave balance leaves the menu.
-- (2) Leave requests go through three steps: fleet manager approval, HR review, HOD final approval.
-- (3) Outstation allowance goes through two: fleet manager approval, HOD verification; then finance is
--     emailed (finance has no account). Every step is sent by email and SMS with a direct link.
-- (4) Petty cash: the fleet manager approves the amount, the HOD approves, finance is emailed. Once the
--     money is given the requester attaches proof of payment; only then can the money be spent. Each
--     transaction is its own record with its receipt, approved by the fleet manager and verified by the HOD.

-- ---------------------------------------------------------------------------
-- (1) Leave plan
-- ---------------------------------------------------------------------------
alter table public.leave_plans
  add column if not exists planned_months text[] not null default '{}',
  add column if not exists entitled_days numeric(5,1) not null default 28,
  add column if not exists carried_forward_days numeric(5,1) not null default 0;
alter table public.leave_plans drop constraint if exists leave_plans_planned_months_check;
alter table public.leave_plans add constraint leave_plans_planned_months_check check (planned_months <@ array['1','2','3','4','5','6','7','8','9','10','11','12']);

-- Existing plans take their months from their leave periods, and their days from the leave balance.
update public.leave_plans p set planned_months = coalesce((
  select array_agg(m::text order by m) from (select distinct m
  from public.leave_plan_rows r
  cross join lateral generate_series(
    case when extract(year from r.date_from) < p.plan_year then 1 else extract(month from r.date_from)::int end,
    case when extract(year from r.date_to) > p.plan_year then 12 else extract(month from r.date_to)::int end) m
  where r.leave_plan_id = p.id and r.deleted_at is null) x), '{}')
where planned_months = '{}';
update public.leave_plans p set entitled_days = b.entitled_days, carried_forward_days = b.carried_over_days
from public.leave_balances b
where b.employee_id = p.employee_id and b.balance_year = p.plan_year and b.deleted_at is null;

-- The leave balance (used to check leave requests) follows the plan.
create or replace function public.leave_plans_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id is null or new.deleted_at is not null then return null; end if;
  update public.leave_balances set entitled_days = new.entitled_days, carried_over_days = new.carried_forward_days, deleted_at = null
  where employee_id = new.employee_id and balance_year = new.plan_year;
  if not found then
    insert into public.leave_balances (company_id, driver_id, employee_id, balance_year, entitled_days, carried_over_days, created_by)
    values (new.company_id, new.driver_id, new.employee_id, new.plan_year, new.entitled_days, new.carried_forward_days, new.created_by);
  end if;
  return null;
end;
$$;
drop trigger if exists leave_plans_balance on public.leave_plans;
create trigger leave_plans_balance after insert or update of employee_id, plan_year, entitled_days, carried_forward_days, deleted_at on public.leave_plans
  for each row execute function public.leave_plans_balance();

-- Leave balance: kept for its data, out of the menu.
update public.resources set path = null where key = 'expenses.leave.balances';

-- ---------------------------------------------------------------------------
-- (2) and (3) Requests with several approval steps
-- ---------------------------------------------------------------------------
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.leave.requests.hr', 'expenses.leave.requests', 'Leave requests: HR review', null, null, null, 554, false, false),
  ('expenses.leave.requests.hod', 'expenses.leave.requests', 'Leave requests: HOD final approval', null, null, null, 554, false, false),
  ('expenses.admin.outstation.hod', 'expenses.admin.outstation', 'Outstation allowance: HOD verification', null, null, null, 560, false, false),
  ('expenses.admin.petty_cash.hod', 'expenses.admin.petty_cash', 'Petty cash: HOD approval and verification', null, null, null, 557, false, false)
on conflict (key) do update set name = excluded.name, parent_key = excluded.parent_key;

alter table public.approval_links drop constraint if exists approval_links_table_name_check;
alter table public.approval_links add constraint approval_links_table_name_check check (table_name in ('leave_requests', 'vehicle_requests', 'outstation_requests', 'petty_cash_requests', 'petty_cash_transactions'));

alter table public.leave_requests add column if not exists approval_step text;
alter table public.outstation_requests add column if not exists approval_step text;
alter table public.petty_cash_requests add column if not exists approval_step text;
alter table public.petty_cash_requests add column if not exists amount_approved_tzs numeric(14,2);

-- Petty cash transactions become records of their own, each approved.
alter table public.petty_cash_transactions
  add column if not exists status public.request_status not null default 'draft',
  add column if not exists rejection_reason text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approver_signature jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists approval_step text;
-- Transactions recorded before this change were checked on paper.
update public.petty_cash_transactions set status = 'approved', approved_at = coalesce(updated_at, created_at) where status = 'draft';
update public.table_resources set is_request = true where table_name = 'petty_cash_transactions';

create or replace function public.is_staged(p_table text)
returns boolean language sql immutable as $$
  select p_table in ('leave_requests', 'outstation_requests', 'petty_cash_requests', 'petty_cash_transactions');
$$;

-- The steps in order, with the permission (approve) each needs.
create or replace function public.staged_steps(p_table text)
returns table (step text, resource text, ord integer) language sql immutable as $$
  select s.step, s.resource, s.ord from (values
    ('leave_requests', 'approval', 'expenses.leave.requests', 1),
    ('leave_requests', 'hr_review', 'expenses.leave.requests.hr', 2),
    ('leave_requests', 'hod_approval', 'expenses.leave.requests.hod', 3),
    ('outstation_requests', 'approval', 'expenses.admin.outstation', 1),
    ('outstation_requests', 'hod_verify', 'expenses.admin.outstation.hod', 2),
    ('petty_cash_requests', 'approval', 'expenses.admin.petty_cash', 1),
    ('petty_cash_requests', 'hod_approval', 'expenses.admin.petty_cash.hod', 2),
    ('petty_cash_transactions', 'approval', 'expenses.admin.petty_cash', 1),
    ('petty_cash_transactions', 'hod_verify', 'expenses.admin.petty_cash.hod', 2)
  ) s(tbl, step, resource, ord)
  where s.tbl = p_table;
$$;

-- The signed-in person holds the current step of a submitted request. Returns the step.
create or replace function public.staged_check(p_table text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_step text;
  v_resource text;
  v_scope text;
begin
  execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.deleted_at is null', p_table) into v_row using p_id;
  if v_row is null then
    raise exception 'Request not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be decided' using errcode = '23514', hint = 'illegal_transition';
  end if;
  v_step := coalesce(v_row ->> 'approval_step', 'approval');
  select s.resource into v_resource from public.staged_steps(p_table) s where s.step = v_step;
  v_scope := public.permission_scope_for(auth.uid(), v_resource, 'approve');
  if (v_row ->> 'company_id')::uuid is distinct from public.my_company_id() or v_scope is null
     or (v_scope = 'own' and (v_row ->> 'created_by')::uuid is distinct from auth.uid()) then
    raise exception 'You do not have permission to decide this step (%)', public.workflow_step_label(v_step) using errcode = '42501', hint = 'permission_denied';
  end if;
  return v_step;
end;
$$;

-- Approve the current step. Not the last step: record it and move on to the next one (its approver is
-- emailed and texted). The last step: tell the caller, which approves the request.
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
  select v_company, p_table, p_id, v_step, auth.uid(), pr.full_name, nullif(trim(coalesce(pr.job_title, '')), ''), p_signature
  from public.profiles pr where pr.id = auth.uid();
  perform set_config('fms.workflow_record', p_id::text, true);
  perform public.workflow_notify_step(p_table, p_id);
  return jsonb_build_object('final', false, 'row', v_row);
end;
$$;

-- Who signed each earlier step (the last step is the request's own approver fields).
create table if not exists public.approval_signoffs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  step text not null,
  signed_by uuid,
  signer_name text,
  signer_position text,
  signature jsonb,
  created_at timestamptz not null default now()
);
create index if not exists approval_signoffs_record on public.approval_signoffs (table_name, record_id, created_at);
alter table public.approval_signoffs enable row level security;
drop policy if exists approval_signoffs_select on public.approval_signoffs;
create policy approval_signoffs_select on public.approval_signoffs for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission(public.workflow_request_resource(table_name), 'view'));
revoke all on public.approval_signoffs from public, anon, authenticated;
grant select on public.approval_signoffs to authenticated;
grant all on public.approval_signoffs to service_role;

-- A request sent again starts from the first step.
create or replace function public.staged_reset_step()
returns trigger language plpgsql as $$
begin
  if new.status in ('draft', 'submitted') and (tg_op = 'INSERT' or old.status is distinct from new.status) and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.approval_step := null;
  end if;
  return new;
end;
$$;
drop trigger if exists leave_requests_reset_step on public.leave_requests;
create trigger leave_requests_reset_step before insert or update of status on public.leave_requests for each row execute function public.staged_reset_step();
drop trigger if exists petty_cash_requests_reset_step on public.petty_cash_requests;
create trigger petty_cash_requests_reset_step before insert or update of status on public.petty_cash_requests for each row execute function public.staged_reset_step();
drop trigger if exists petty_cash_transactions_reset_step on public.petty_cash_transactions;
create trigger petty_cash_transactions_reset_step before insert or update of status on public.petty_cash_transactions for each row execute function public.staged_reset_step();
drop trigger if exists petty_cash_transactions_status on public.petty_cash_transactions;
create trigger petty_cash_transactions_status before insert or update on public.petty_cash_transactions
  for each row execute function public.request_status_guard('expenses.admin.petty_cash', '/administration/petty-cash/transactions');
drop trigger if exists petty_cash_transactions_submitted_at on public.petty_cash_transactions;
create trigger petty_cash_transactions_submitted_at before insert or update of status on public.petty_cash_transactions
  for each row execute function public.set_submitted_at();
drop trigger if exists outstation_requests_reset_step on public.outstation_requests;
create trigger outstation_requests_reset_step before insert or update of status on public.outstation_requests for each row execute function public.staged_reset_step();

-- Approval history is visible with the request.
drop policy if exists approval_events_select on public.approval_events;
create policy approval_events_select on public.approval_events for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission(public.workflow_request_resource(table_name), 'view'));

create or replace function public.workflow_request_resource(p_table text)
returns text language sql immutable as $$
  select case p_table
    when 'leave_requests' then 'expenses.leave.requests'
    when 'vehicle_requests' then 'daily_use.trip_requests'
    when 'outstation_requests' then 'expenses.admin.outstation'
    when 'petty_cash_requests' then 'expenses.admin.petty_cash'
    when 'petty_cash_transactions' then 'expenses.admin.petty_cash' end;
$$;

create or replace function public.workflow_request_label(p_table text)
returns text language sql immutable as $$
  select case p_table when 'leave_requests' then 'leave request' when 'vehicle_requests' then 'vehicle request' when 'outstation_requests' then 'outstation allowance' when 'petty_cash_requests' then 'petty cash request' when 'petty_cash_transactions' then 'petty cash transaction' else 'request' end;
$$;

create or replace function public.workflow_step_label(p_step text)
returns text language sql immutable as $$
  select case p_step
    when 'approval' then 'Approval'
    when 'hr_review' then 'HR review'
    when 'hod_approval' then 'HOD final approval'
    when 'hod_verify' then 'HOD verification'
    when 'prepare' then 'Prepare and upload the journey management plan'
    when 'requester' then 'Requester signs the journey management plan'
    when 'hse_manager' then 'HSE manager sign-off (journey management plan)'
    when 'control_room' then 'Control room (journey management plan)'
    when 'emergency_commander' then 'Emergency response commander (journey management plan)'
    else initcap(replace(p_step, '_', ' ')) end;
$$;

create or replace function public.workflow_current_step(p_table text, p_id uuid, out o_step text, out o_resource text)
returns record language plpgsql stable security definer set search_path = public as $$
declare
  v_status text;
begin
  if public.is_staged(p_table) then
    execute format('select status::text, coalesce(approval_step, ''approval'') from public.%I where id = $1 and deleted_at is null', p_table)
      into v_status, o_step using p_id;
    if v_status = 'submitted' then
      select s.resource into o_resource from public.staged_steps(p_table) s where s.step = o_step;
    else
      o_step := null;
    end if;
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
  elsif p_table = 'outstation_requests' then
    select o.*, d.full_name as driver_name, d.phone as driver_phone, c.full_name as who, c.phone as who_phone, v.registration
      into r
    from public.outstation_requests o
    left join public.drivers d on d.id = o.driver_id
    left join public.profiles c on c.id = o.created_by
    left join public.vehicles v on v.id = o.vehicle_id
    where o.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Outstation allowance for ' || coalesce(r.driver_name, 'a driver') || ', ' || coalesce(r.location, '') || ', ' || to_char(r.date_from, 'DD Mon YYYY') || ' to ' || to_char(r.date_to, 'DD Mon YYYY'),
      'path', '/administration/outstation/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Driver', 'value', coalesce(r.driver_name, '')),
        jsonb_build_object('label', 'Vehicle', 'value', coalesce(r.registration, '')),
        jsonb_build_object('label', 'Location', 'value', coalesce(r.location, '')),
        jsonb_build_object('label', 'From', 'value', to_char(r.date_from, 'DD Mon YYYY')),
        jsonb_build_object('label', 'To', 'value', to_char(r.date_to, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Days', 'value', coalesce(r.total_days::text, '')),
        jsonb_build_object('label', 'Allowance', 'value', 'TZS ' || to_char(coalesce(r.allowance_tzs, 0), 'FM999,999,999,990')),
        jsonb_build_object('label', 'Other expenses', 'value', 'TZS ' || to_char(coalesce(r.other_total_tzs, 0), 'FM999,999,999,990')),
        jsonb_build_object('label', 'Total cost', 'value', 'TZS ' || to_char(coalesce(r.total_cost_tzs, 0), 'FM999,999,999,990'))
      ));
  elsif p_table = 'petty_cash_requests' then
    select q.*, coalesce(nullif(q.requester_name, ''), c.full_name) as who, c.phone as who_phone
      into r
    from public.petty_cash_requests q
    left join public.profiles c on c.id = q.created_by
    where q.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', 'Petty cash of TZS ' || to_char(coalesce(r.amount_approved_tzs, r.amount_requested_tzs), 'FM999,999,999,990') || coalesce(' for ' || nullif(r.purpose, ''), ''),
      'path', '/administration/petty-cash/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Requested by', 'value', coalesce(r.who, '')),
        jsonb_build_object('label', 'Position', 'value', coalesce(r.position, '')),
        jsonb_build_object('label', 'Date', 'value', to_char(r.request_date, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Purpose', 'value', coalesce(r.purpose, '')),
        jsonb_build_object('label', 'Amount requested', 'value', 'TZS ' || to_char(r.amount_requested_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Amount approved', 'value', case when r.amount_approved_tzs is null then '' else 'TZS ' || to_char(r.amount_approved_tzs, 'FM999,999,999,990') end)
      ));
  elsif p_table = 'petty_cash_transactions' then
    select x.*, q.requester_name, q.purpose as request_purpose, c.full_name as who, c.phone as who_phone
      into r
    from public.petty_cash_transactions x
    join public.petty_cash_requests q on q.id = x.petty_cash_request_id
    left join public.profiles c on c.id = x.created_by
    where x.id = p_id;
    if r.id is null then return null; end if;
    v := jsonb_build_object(
      'requester', coalesce(r.who, r.requester_name, ''),
      'requester_id', r.created_by,
      'requester_phone', r.who_phone,
      'summary', coalesce(r.description, '') || ', TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990') || ' on ' || to_char(r.txn_date, 'DD Mon YYYY'),
      'path', '/administration/petty-cash/transactions/' || p_id,
      'details', jsonb_build_array(
        jsonb_build_object('label', 'Spent by', 'value', coalesce(r.who, r.requester_name, '')),
        jsonb_build_object('label', 'Date', 'value', to_char(r.txn_date, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Description', 'value', coalesce(r.description, '')),
        jsonb_build_object('label', 'Quantity', 'value', trim(to_char(r.quantity, 'FM999,999,990.##')) || coalesce(' ' || nullif(r.unit, ''), '')),
        jsonb_build_object('label', 'Amount', 'value', 'TZS ' || to_char(r.amount_tzs, 'FM999,999,999,990')),
        jsonb_build_object('label', 'Petty cash for', 'value', coalesce(r.request_purpose, ''))
      ));
  else
    return null;
  end if;
  return v;
end;
$$;

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
  if public.is_staged(p_table) then
    -- Whoever holds the current step may reject it; the request goes back to the requester.
    perform public.staged_check(p_table, p_id);
    v_resource := public.workflow_request_resource(p_table);
    execute format('select to_jsonb(t.*) from public.%I t where t.id = $1 and t.deleted_at is null', p_table) into v_row using p_id;
  else
    select o_resource, o_row into v_resource, v_row from public.request_row_access(p_table, p_id, 'approve');
  end if;
  if (v_row ->> 'status') <> 'submitted' then
    raise exception 'Only a submitted request can be rejected' using errcode = '23514', hint = 'illegal_transition';
  end if;
  select full_name into v_name from public.profiles where id = auth.uid();

  perform set_config('fms.approving', 'on', true);
  execute format(
    'update public.%I set status = ''rejected'', approved_by = $1, approved_at = now(), rejection_reason = $2%s
     where id = $3 returning to_jsonb(%I.*)', p_table, case when public.is_staged(p_table) then ', approval_step = null' else '' end, p_table)
    into v_after using auth.uid(), trim(p_reason), p_id;
  perform set_config('fms.approving', 'off', true);

  select name into v_title from public.resources where key = v_resource;
  perform public.audit_write('reject', p_table, p_id::text, v_row, v_after, (v_row ->> 'company_id')::uuid);
  perform public.notify_user((v_row ->> 'created_by')::uuid, 'rejection', v_title || ' rejected',
    'Reason: ' || trim(p_reason), replace(replace(v_resource, '.', '/'), '_', '-') || '/' || p_id, (v_row ->> 'company_id')::uuid);
  return v_after;
end;
$$;

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

  if v_step = 'approval' or public.is_staged(v_table) then
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

-- ---------------------------------------------------------------------------
-- (3) Finance: email only, to the addresses in the company settings.
-- ---------------------------------------------------------------------------
create or replace function public.set_company_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_key not in ('jmp_method', 'finance_emails') then
    raise exception 'Unknown setting %', p_key using errcode = '22023';
  end if;
  if not public.has_permission('settings.company', 'edit') then
    raise exception 'You cannot change company settings' using errcode = '42501', hint = 'permission_denied';
  end if;
  update public.companies set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(p_key, p_value) where id = public.my_company_id();
end;
$$;

create or replace function public.finance_notify(p_table text, p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_company_name text;
  v_emails jsonb;
  v_summary jsonb := public.workflow_request_summary(p_table, p_id);
  v_signers text;
  e text;
  n integer := 0;
begin
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  select name, coalesce(settings -> 'finance_emails', '[]'::jsonb) into v_company_name, v_emails from public.companies where id = v_company;
  select string_agg(coalesce(signer_name, '') || ' (' || public.workflow_step_label(step) || ')', ', ' order by created_at) into v_signers
  from public.approval_signoffs where table_name = p_table and record_id = p_id;
  for e in select trim(x) from jsonb_array_elements_text(case when jsonb_typeof(v_emails) = 'array' then v_emails else '[]'::jsonb end) x loop
    if e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
      values (v_company, null, 'email', e, 'finance_notice', jsonb_build_object(
        'record_table', p_table,
        'record_id', p_id,
        'name', 'Finance team',
        'company', coalesce(v_company_name, ''),
        'request', public.workflow_request_label(p_table),
        'requester', v_summary ->> 'requester',
        'summary', v_summary ->> 'summary',
        'details', v_summary -> 'details',
        'approver', coalesce(v_signers, ''),
        'verifier', coalesce((select full_name from public.profiles where id = auth.uid()), '')));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.finance_notify(text, uuid) from public, anon, authenticated;

-- Outstation allowance requests send their steps by email and SMS like leave and trips.
drop trigger if exists outstation_requests_workflow on public.outstation_requests;
create trigger outstation_requests_workflow after insert or update of status on public.outstation_requests
  for each row execute function public.requests_workflow_after();
drop trigger if exists petty_cash_requests_workflow on public.petty_cash_requests;
create trigger petty_cash_requests_workflow after insert or update of status on public.petty_cash_requests
  for each row execute function public.requests_workflow_after();
drop trigger if exists petty_cash_transactions_workflow on public.petty_cash_transactions;
create trigger petty_cash_transactions_workflow after insert or update of status on public.petty_cash_transactions
  for each row execute function public.requests_workflow_after();

-- ---------------------------------------------------------------------------
-- (4) Petty cash: proof of payment before spending, a receipt for each transaction, approved spend only.
-- ---------------------------------------------------------------------------
create or replace function public.petty_cash_has_doc(p_table text, p_id uuid, p_label text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attachments a where a.table_name = p_table and a.row_id = p_id and a.deleted_at is null and lower(a.label) like lower(p_label) || '%');
$$;

create or replace function public.petty_cash_transactions_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    select status::text into v_status from public.petty_cash_requests where id = new.petty_cash_request_id and deleted_at is null;
    if v_status is distinct from 'approved' then
      raise exception 'Money can be spent only from an approved petty cash request' using errcode = '23514', hint = 'petty_cash_not_approved';
    end if;
    if not public.petty_cash_has_doc('petty_cash_requests', new.petty_cash_request_id, 'Proof of payment') then
      raise exception 'Attach the proof of payment to the petty cash request first' using errcode = '23514', hint = 'proof_of_payment_missing';
    end if;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted')
     and not public.petty_cash_has_doc('petty_cash_transactions', new.id, 'Receipt') then
    raise exception 'Upload the receipt before sending the transaction' using errcode = '23514', hint = 'receipt_missing';
  end if;
  return new;
end;
$$;
drop trigger if exists petty_cash_transactions_rules on public.petty_cash_transactions;
create trigger petty_cash_transactions_rules before insert or update of status on public.petty_cash_transactions
  for each row execute function public.petty_cash_transactions_rules();

-- Spent: approved transactions only.
create or replace function public.petty_cash_spent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.petty_cash_request_id, old.petty_cash_request_id);
begin
  update public.petty_cash_requests r set
    amount_spent_tzs = coalesce((select sum(amount_tzs) from public.petty_cash_transactions x where x.petty_cash_request_id = r.id and x.deleted_at is null and x.status = 'approved'), 0)
  where r.id = v_id;
  return null;
end;
$$;
update public.petty_cash_requests r set
  amount_spent_tzs = coalesce((select sum(amount_tzs) from public.petty_cash_transactions x where x.petty_cash_request_id = r.id and x.deleted_at is null and x.status = 'approved'), 0);

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
      perform public.workflow_event(tg_table_name, new.id, new.company_id, coalesce(to_jsonb(new) ->> 'approval_step', 'approval'), 'approved');
      -- Outstation allowance and petty cash: approved by the HOD, they go to finance by email.
      if tg_table_name in ('outstation_requests', 'petty_cash_requests') then
        perform public.finance_notify(tg_table_name, new.id);
      end if;
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
    v_step := coalesce(to_jsonb(old) ->> 'approval_step', 'approval');
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
