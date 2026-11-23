-- Timesheets, once a month per employee:
-- (1) Days are added on the employee's month page; the month's timesheet is made with the first day.
-- (2) On the last day of the month (from 16:00, Tanzania time) the employee gets a personal link by
--     email and SMS to check the month and sign it. Their signature sends it to the fleet manager,
--     then the HOD. It can also be sent sooner from the page, or signed there on the coordinator's
--     device. A rejected month is corrected and sent to the employee again.
-- (3) One timesheet per employee and month.

-- ---------------------------------------------------------------------------
-- Personal links also for timesheets (the employee may have no driver record)
-- ---------------------------------------------------------------------------
alter table public.driver_confirmations drop constraint if exists driver_confirmations_table_name_check;
alter table public.driver_confirmations add constraint driver_confirmations_table_name_check check (table_name in ('fuel_requests', 'timesheets'));
alter table public.driver_confirmations alter column driver_id drop not null;
alter table public.driver_confirmations add column if not exists employee_id uuid references public.profiles(id) on delete cascade;
alter table public.driver_confirmations drop constraint if exists driver_confirmations_person_check;
alter table public.driver_confirmations add constraint driver_confirmations_person_check check (driver_id is not null or employee_id is not null);

drop policy if exists driver_confirmations_select on public.driver_confirmations;
create policy driver_confirmations_select on public.driver_confirmations for select to authenticated
  using (company_id = public.my_company_id()
    and public.has_permission(case table_name when 'timesheets' then 'expenses.timesheet' else 'daily_use.fuel_log' end, 'view'));

alter table public.timesheets add column if not exists sent_to_employee_at timestamptz;

-- (3) One timesheet per employee and month (skipped, with a notice, if old data has two).
do $$
begin
  if exists (
    select 1 from public.timesheets where deleted_at is null and employee_id is not null
    group by employee_id, period_month having count(*) > 1
  ) then
    raise notice 'Some employees have two timesheets for one month; the one-per-month rule is not added. Remove the extra ones, then run this again.';
  else
    create unique index if not exists timesheets_employee_month_uq on public.timesheets (employee_id, period_month)
      where deleted_at is null and employee_id is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- (2) Sending the month to the employee
-- ---------------------------------------------------------------------------
-- Internal: makes a new personal link (older open ones stop working) and sends it.
create or replace function public.timesheet_send_link(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  ts public.timesheets;
  p public.profiles;
  d public.drivers;
  v_token text := replace(gen_random_uuid()::text, '-', '');
  v_email text;
  v_phone text;
  v_days integer;
  v_hours numeric;
  v_ot numeric;
  v_month text;
  v_company_name text;
  v_at timestamptz := now();
begin
  select * into ts from public.timesheets where id = p_id and deleted_at is null;
  if ts.id is null then raise exception 'Timesheet not found' using errcode = 'P0002', hint = 'not_found'; end if;
  if ts.status not in ('draft', 'rejected') then
    raise exception 'This month is already signed by the employee' using errcode = '23514', hint = 'already_sent';
  end if;
  select count(*), coalesce(sum(total_hours), 0), coalesce(sum(overtime_hours), 0) + coalesce(sum(special_overtime_hours), 0)
    into v_days, v_hours, v_ot from public.timesheet_days where timesheet_id = p_id and deleted_at is null;
  if v_days = 0 then raise exception 'Add the days of the month first' using errcode = '23514', hint = 'no_days'; end if;

  if ts.employee_id is not null then select * into p from public.profiles where id = ts.employee_id; end if;
  if coalesce(ts.driver_id, p.driver_id) is not null then select * into d from public.drivers where id = coalesce(ts.driver_id, p.driver_id); end if;
  if p.id is null and d.id is null then
    raise exception 'This timesheet has no employee account to send it to' using errcode = '23514', hint = 'no_employee';
  end if;
  v_email := coalesce(nullif(trim(coalesce(p.email, '')), ''), nullif(trim(coalesce(d.email, '')), ''));
  v_phone := coalesce(nullif(trim(coalesce(d.phone, '')), ''), nullif(trim(coalesce(p.phone, '')), ''));
  if v_email is null and v_phone is null then
    raise exception 'The employee has no email or phone number. Add one, or let them sign on this device.' using errcode = '23514', hint = 'no_contact';
  end if;

  update public.driver_confirmations set expires_at = now() - interval '1 second'
  where table_name = 'timesheets' and record_id = p_id and confirmed_at is null and expires_at > now();
  insert into public.driver_confirmations (company_id, table_name, record_id, driver_id, employee_id, requested_by, token_hash)
  values (ts.company_id, 'timesheets', p_id, d.id, p.id, auth.uid(), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));

  v_month := trim(to_char(ts.period_month, 'FMMonth YYYY'));
  select name into v_company_name from public.companies where id = ts.company_id;
  perform public.workflow_enqueue(ts.company_id, p.id, v_email, v_phone, 'timesheet_confirm', jsonb_build_object(
    'name', coalesce(nullif(split_part(coalesce(p.full_name, d.full_name, ts.employee_name, ''), ' ', 1), ''), 'there'),
    'company', coalesce(v_company_name, ''),
    'month', v_month,
    'summary', v_days || ' days, ' || rtrim(to_char(v_hours, 'FM999,990.99'), '.') || ' hours, ' || rtrim(to_char(v_ot, 'FM999,990.99'), '.') || ' hours overtime',
    'record_table', 'timesheets',
    'record_id', p_id,
    'path', '/c/' || v_token,
    'expires', to_char(now() + interval '14 days', 'DD Mon YYYY')));
  if p.id is not null then
    perform public.notify_user(p.id, 'approval', 'Sign your timesheet for ' || v_month,
      'Open the link in your email or SMS to check your days and sign. It then goes to the fleet manager and the HOD.', null, ts.company_id);
  end if;
  update public.timesheets set sent_to_employee_at = v_at where id = p_id;
  return v_at;
end;
$$;
revoke all on function public.timesheet_send_link(uuid) from public, anon, authenticated;

-- From the month page: send now (or again after a rejection or a lost link).
create or replace function public.timesheet_send_to_employee(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.timesheets where id = p_id and deleted_at is null;
  if v_company is null or v_company is distinct from public.my_company_id() then
    raise exception 'Timesheet not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not public.has_permission('expenses.timesheet', 'edit') and not public.has_permission('expenses.timesheet', 'create') then
    raise exception 'You do not have permission to send timesheets' using errcode = '42501', hint = 'permission_denied';
  end if;
  return public.timesheet_send_link(p_id);
end;
$$;
revoke all on function public.timesheet_send_to_employee(uuid) from public, anon;
grant execute on function public.timesheet_send_to_employee(uuid) to authenticated;

-- The employee has signed: keep the signature and send the month to the fleet manager.
create or replace function public.timesheet_employee_signed(p_id uuid, p_signature jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.timesheets set employee_signature = p_signature, status = 'submitted'
  where id = p_id and status in ('draft', 'rejected') and deleted_at is null;
  if not found then
    raise exception 'This month is already signed' using errcode = '22023', hint = 'link_done';
  end if;
end;
$$;
revoke all on function public.timesheet_employee_signed(uuid, jsonb) from public, anon, authenticated;

-- The employee signs on the coordinator's device (no email or phone, or they are there in person).
create or replace function public.timesheet_sign_on_device(p_id uuid, p_signature jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  ts public.timesheets;
  p public.profiles;
  v_sig jsonb;
begin
  select * into ts from public.timesheets where id = p_id and deleted_at is null for update;
  if ts.id is null or ts.company_id is distinct from public.my_company_id() then
    raise exception 'Timesheet not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not public.has_permission('expenses.timesheet', 'edit') and not public.has_permission('expenses.timesheet', 'create') then
    raise exception 'You do not have permission to record timesheets' using errcode = '42501', hint = 'permission_denied';
  end if;
  if ts.status not in ('draft', 'rejected') then
    raise exception 'This month is already signed by the employee' using errcode = '23514', hint = 'already_sent';
  end if;
  if not exists (select 1 from public.timesheet_days where timesheet_id = p_id and deleted_at is null) then
    raise exception 'Add the days of the month first' using errcode = '23514', hint = 'no_days';
  end if;
  if p_signature is null or coalesce(trim(p_signature ->> 'name'), '') = '' then
    raise exception 'The employee''s signature is required' using errcode = '22023', hint = 'signature_required';
  end if;
  if ts.employee_id is not null then select * into p from public.profiles where id = ts.employee_id; end if;
  v_sig := p_signature || jsonb_build_object('signed_at', now(), 'via', 'device', 'recorded_by', auth.uid());
  update public.driver_confirmations set expires_at = now() - interval '1 second'
  where table_name = 'timesheets' and record_id = p_id and confirmed_at is null and expires_at > now();
  -- Kept with the links sent, so the page shows who signed, how and when (an employee known only
  -- by name has the signature on the timesheet only).
  if coalesce(ts.driver_id, p.driver_id) is not null or p.id is not null then
    insert into public.driver_confirmations (company_id, table_name, record_id, driver_id, employee_id, requested_by, token_hash, confirmed_at, signature)
    values (ts.company_id, 'timesheets', p_id, coalesce(ts.driver_id, p.driver_id), p.id, auth.uid(),
      encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex'), now(), v_sig);
  end if;
  perform public.audit_write('employee_sign', 'timesheets', p_id::text, null, jsonb_build_object('via', 'device'), ts.company_id);
  perform public.timesheet_employee_signed(p_id, v_sig);
end;
$$;
revoke all on function public.timesheet_sign_on_device(uuid, jsonb) from public, anon;
grant execute on function public.timesheet_sign_on_device(uuid, jsonb) to authenticated;

-- Called by the app's cron: months whose last day has come (from 16:00) go to their employees, once.
-- A month missed (server down) is still sent during the first three days after it.
create or replace function public.timesheets_send_due()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := now() at time zone 'Africa/Dar_es_Salaam';
  r record;
  n integer := 0;
begin
  for r in
    select t.id, (t.period_month + interval '1 month' - interval '1 day')::date as last_day
    from public.timesheets t
    where t.deleted_at is null and t.status = 'draft' and t.sent_to_employee_at is null
      and t.period_month >= (date_trunc('month', v_now) - interval '1 month')::date
      and exists (select 1 from public.timesheet_days d where d.timesheet_id = t.id and d.deleted_at is null)
  loop
    if (v_now::date = r.last_day and extract(hour from v_now) >= 16) or (v_now::date > r.last_day and v_now::date <= r.last_day + 3) then
      begin
        perform public.timesheet_send_link(r.id);
        n := n + 1;
      exception when others then
        -- No email or phone (or no employee): left for the coordinator, who sees it on the page.
        null;
      end;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.timesheets_send_due() from public, anon, authenticated;
grant execute on function public.timesheets_send_due() to service_role;

-- ---------------------------------------------------------------------------
-- The personal link page: also timesheets (the month and its days)
-- ---------------------------------------------------------------------------
create or replace function public.driver_confirmation_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.driver_confirmations;
  r jsonb;
  v_state text := 'open';
  v_days jsonb;
begin
  select * into c from public.driver_confirmations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  if c.confirmed_at is not null then v_state := 'done';
  elsif c.expires_at < now() then v_state := 'expired';
  end if;
  execute format('select to_jsonb(x) from public.%I x where x.id = $1', c.table_name) into r using c.record_id;
  if c.table_name = 'timesheets' then
    -- Signed on the device meanwhile, or decided: this link is done.
    if v_state = 'open' and (r ->> 'status') not in ('draft', 'rejected') then v_state := 'expired'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'work_date', d.work_date, 'day_type', d.day_type, 'shift', d.shift,
        'time_in', left(d.time_in::text, 5), 'time_out', left(d.time_out::text, 5),
        'total_hours', d.total_hours, 'overtime_hours', d.overtime_hours, 'special_overtime_hours', d.special_overtime_hours,
        'allowance_tzs', d.allowance_tzs) order by d.work_date), '[]'::jsonb)
      into v_days from public.timesheet_days d where d.timesheet_id = c.record_id and d.deleted_at is null;
    r := r - 'employee_signature' - 'coordinator_signature' - 'approver_signature';
  end if;
  return jsonb_build_object(
    'state', v_state,
    'table', c.table_name,
    'record', r,
    'days', v_days,
    'driver', coalesce((select full_name from public.drivers where id = c.driver_id), (select full_name from public.profiles where id = c.employee_id)),
    'requested_by', (select full_name from public.profiles where id = coalesce(c.requested_by, (r ->> 'created_by')::uuid)),
    'vehicle', (select registration || ' (' || make || ' ' || model || ')' from public.vehicles where id = nullif(r ->> 'vehicle_id', '')::uuid),
    'company', (select name from public.companies where id = c.company_id),
    'confirmed_at', c.confirmed_at,
    'expires_at', c.expires_at);
end;
$$;

create or replace function public.driver_confirmation_sign(p_token text, p_signature jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.driver_confirmations;
  v_sig jsonb;
begin
  select * into c from public.driver_confirmations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if c.id is null then raise exception 'This link is not valid' using errcode = '22023', hint = 'link_not_found'; end if;
  if c.confirmed_at is not null then raise exception 'Already confirmed' using errcode = '22023', hint = 'link_done'; end if;
  if c.expires_at < now() then raise exception 'This link has expired' using errcode = '22023', hint = 'link_expired'; end if;
  if p_signature is null then raise exception 'A signature is required' using errcode = '22023', hint = 'signature_required'; end if;
  v_sig := p_signature || jsonb_build_object('signed_at', now(), 'via', 'link');
  update public.driver_confirmations set confirmed_at = now(), signature = v_sig where id = c.id;
  perform public.audit_write('driver_confirm', c.table_name, c.record_id::text, null,
    jsonb_build_object('driver_id', c.driver_id, 'employee_id', c.employee_id, 'confirmed_at', now()), c.company_id);
  if c.table_name = 'timesheets' then
    perform public.timesheet_employee_signed(c.record_id, v_sig);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.driver_confirmation_open(text) from public, anon, authenticated;
revoke all on function public.driver_confirmation_sign(text, jsonb) from public, anon, authenticated;
grant execute on function public.driver_confirmation_open(text) to service_role;
grant execute on function public.driver_confirmation_sign(text, jsonb) to service_role;
