-- (1) Timesheet: per company, each role says whether its users are listed on the timesheet (not
--     every role keeps one). Set in Settings, Roles. Users with no role, or with at least one role
--     that is listed, show; users whose every role is hidden do not (unless they already have days).
-- (2) Outstation allowance: verified by the HOD, finance gets an email with a personal link to pay it:
--     they record the amount paid and upload the proof of payment (like petty cash).
-- (3) Petty cash transactions: a draft (or rejected) one can be changed by anyone who records petty
--     cash, not only the person who recorded it.
-- (4) The Dar es Salaam airport is JNIA (Julius Nyerere International Airport).

-- ---------------------------------------------------------------------------
-- (1) Roles hidden from the timesheet
-- ---------------------------------------------------------------------------
create table if not exists public.timesheet_hidden_roles (
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (company_id, role_id)
);
alter table public.timesheet_hidden_roles enable row level security;
drop policy if exists timesheet_hidden_roles_select on public.timesheet_hidden_roles;
create policy timesheet_hidden_roles_select on public.timesheet_hidden_roles for select to authenticated
  using (company_id = public.my_company_id() or public.is_owner());
grant select on public.timesheet_hidden_roles to authenticated;
grant all on public.timesheet_hidden_roles to service_role;

-- Changed only through this function: the role must belong to the company (or be a system role).
create or replace function public.set_role_on_timesheet(p_company uuid, p_role uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_company is null or p_role is null then
    raise exception 'Choose a company and a role' using errcode = '22023';
  end if;
  if not (public.is_owner() or (p_company = public.my_company_id() and public.has_permission('settings.roles', 'edit'))) then
    raise exception 'You cannot change the roles of this company' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles where id = p_role and (company_id is null or company_id = p_company)) then
    raise exception 'This role is not in the company' using errcode = '22023';
  end if;
  if p_on then
    delete from public.timesheet_hidden_roles where company_id = p_company and role_id = p_role;
  else
    insert into public.timesheet_hidden_roles (company_id, role_id) values (p_company, p_role) on conflict do nothing;
  end if;
  return p_on;
end;
$$;
revoke all on function public.set_role_on_timesheet(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_role_on_timesheet(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- (2) Outstation allowance: finance pays through a personal link
-- ---------------------------------------------------------------------------
alter table public.outstation_requests add column if not exists amount_paid_tzs numeric(14,2);
alter table public.finance_links drop constraint if exists finance_links_table_name_check;
alter table public.finance_links add constraint finance_links_table_name_check check (table_name in ('petty_cash_requests', 'outstation_requests'));
drop policy if exists finance_links_select on public.finance_links;
create policy finance_links_select on public.finance_links for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission(
    case table_name when 'outstation_requests' then 'expenses.admin.outstation' else 'expenses.admin.petty_cash' end, 'view'));

create or replace function public.finance_notify(p_table text, p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_company_name text;
  v_emails jsonb;
  v_summary jsonb := public.workflow_request_summary(p_table, p_id);
  v_signers text;
  v_token text;
  v_amount numeric;
  e text;
  n integer := 0;
begin
  execute format('select company_id from public.%I where id = $1', p_table) into v_company using p_id;
  select name, coalesce(settings -> 'finance_emails', '[]'::jsonb) into v_company_name, v_emails from public.companies where id = v_company;
  select string_agg(coalesce(signer_name, '') || ' (' || public.workflow_step_label_for(p_table, step) || ')', ', ' order by created_at) into v_signers
  from public.approval_signoffs where table_name = p_table and record_id = p_id;
  if p_table = 'petty_cash_requests' then
    select coalesce(amount_approved_tzs, amount_requested_tzs) into v_amount from public.petty_cash_requests where id = p_id;
  elsif p_table = 'outstation_requests' then
    select total_cost_tzs into v_amount from public.outstation_requests where id = p_id;
  end if;
  for e in select trim(x) from jsonb_array_elements_text(case when jsonb_typeof(v_emails) = 'array' then v_emails else '[]'::jsonb end) x loop
    if e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      if p_table in ('petty_cash_requests', 'outstation_requests') then
        v_token := replace(gen_random_uuid()::text, '-', '');
        insert into public.finance_links (company_id, table_name, record_id, email, token_hash)
        values (v_company, p_table, p_id, lower(e), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
        insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
        values (v_company, null, 'email', e, case p_table when 'outstation_requests' then 'outstation_finance' else 'petty_cash_finance' end, jsonb_build_object(
          'record_table', p_table,
          'record_id', p_id,
          'name', 'Finance team',
          'company', coalesce(v_company_name, ''),
          'requester', v_summary ->> 'requester',
          'summary', v_summary ->> 'summary',
          'details', v_summary -> 'details',
          'amount', 'TZS ' || trim(to_char(coalesce(v_amount, 0), 'FM999,999,999,990')),
          'approver', coalesce(v_signers, ''),
          'verifier', coalesce((select full_name from public.profiles where id = auth.uid()), ''),
          'path', '/f/' || v_token,
          'expires', to_char(now() + interval '30 days', 'DD Mon YYYY')));
      else
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
      end if;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.finance_notify(text, uuid) from public, anon, authenticated;

-- The finance page: what to pay. Petty cash keeps its fields; an outstation allowance comes with
-- its own lines ("rows": label and value) and the amount to pay.
create or replace function public.finance_link_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.finance_links;
  r public.petty_cash_requests;
  o record;
  v_state text := 'open';
  v_done public.finance_links;
  v_status text;
  v_verified text;
begin
  select * into l from public.finance_links where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if l.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into v_done from public.finance_links where table_name = l.table_name and record_id = l.record_id and used_at is not null order by used_at desc limit 1;
  select string_agg(coalesce(signer_name, '') || ' (' || public.workflow_step_label_for(l.table_name, step) || ')', ', ' order by created_at) into v_verified
  from public.approval_signoffs where table_name = l.table_name and record_id = l.record_id;

  if l.table_name = 'outstation_requests' then
    select x.*, d.full_name as driver_name, d.phone as driver_phone, v.registration, p.full_name as hod
      into o
    from public.outstation_requests x
    left join public.drivers d on d.id = x.driver_id
    left join public.vehicles v on v.id = x.vehicle_id
    left join public.profiles p on p.id = x.approved_by
    where x.id = l.record_id and x.deleted_at is null;
    if o.id is null then return jsonb_build_object('state', 'not_found'); end if;
    v_status := o.status::text;
  else
    select * into r from public.petty_cash_requests where id = l.record_id and deleted_at is null;
    if r.id is null then return jsonb_build_object('state', 'not_found'); end if;
    v_status := r.status::text;
  end if;

  if v_done.id is not null then v_state := 'done';
  elsif l.expires_at < now() then v_state := 'expired';
  elsif v_status <> 'approved' then v_state := 'expired';
  end if;

  if l.table_name = 'outstation_requests' then
    return jsonb_build_object(
      'state', v_state,
      'kind', 'outstation',
      'company', (select name from public.companies where id = l.company_id),
      'amount', o.total_cost_tzs,
      'rows', jsonb_build_array(
        jsonb_build_object('label', 'Driver', 'value', concat_ws(', ', o.driver_name, o.driver_phone)),
        jsonb_build_object('label', 'Vehicle', 'value', coalesce(o.registration, '—')),
        jsonb_build_object('label', 'Location', 'value', coalesce(o.location, '—')),
        jsonb_build_object('label', 'Dates', 'value', to_char(o.date_from, 'DD Mon YYYY') || ' to ' || to_char(o.date_to, 'DD Mon YYYY')),
        jsonb_build_object('label', 'Total days', 'value', o.total_days::text),
        jsonb_build_object('label', 'DSA per day', 'value', 'TZS ' || trim(to_char(coalesce(o.dsa_tzs, 0), 'FM999,999,999,990'))),
        jsonb_build_object('label', 'Allowance', 'value', 'TZS ' || trim(to_char(coalesce(o.allowance_tzs, 0), 'FM999,999,999,990'))),
        jsonb_build_object('label', 'Other expenses', 'value', 'TZS ' || trim(to_char(coalesce(o.other_total_tzs, 0), 'FM999,999,999,990'))),
        jsonb_build_object('label', 'Total to pay', 'value', 'TZS ' || trim(to_char(coalesce(o.total_cost_tzs, 0), 'FM999,999,999,990'))),
        jsonb_build_object('label', 'Approved by', 'value', coalesce(nullif(concat_ws(', ', v_verified, o.hod || ' (HOD)'), ''), '—'))),
      'given_by', v_done.given_by,
      'given_at', v_done.used_at,
      'amount_given', v_done.amount_given);
  end if;

  return jsonb_build_object(
    'state', v_state,
    'kind', 'petty_cash',
    'company', (select name from public.companies where id = l.company_id),
    'requester', r.requester_name,
    'position', r.position,
    'purpose', r.purpose,
    'request_date', r.request_date,
    'amount_requested', r.amount_requested_tzs,
    'amount_approved', coalesce(r.amount_approved_tzs, r.amount_requested_tzs),
    'verified_by', v_verified,
    'hod', (select full_name from public.profiles where id = r.approved_by),
    'given_by', v_done.given_by,
    'given_at', v_done.used_at,
    'amount_given', v_done.amount_given);
end;
$$;

-- Finance has paid: the amount, who paid, and the proof of payment (already in storage).
create or replace function public.finance_link_give(p_token text, p_amount numeric, p_given_by text, p_file jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.finance_links;
  v_status text;
  v_created_by uuid;
  v_resource text;
  v_path text;
  v_text text;
begin
  select * into l from public.finance_links where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if l.id is null then raise exception 'This link is not valid' using errcode = '22023', hint = 'link_not_found'; end if;
  if exists (select 1 from public.finance_links where table_name = l.table_name and record_id = l.record_id and used_at is not null) then
    raise exception 'The money for this request is already recorded' using errcode = '22023', hint = 'link_done';
  end if;
  if l.expires_at < now() then raise exception 'This link has expired' using errcode = '22023', hint = 'link_expired'; end if;
  execute format('select status::text, created_by from public.%I where id = $1 and deleted_at is null for update', l.table_name)
    into v_status, v_created_by using l.record_id;
  if v_status is distinct from 'approved' then raise exception 'This request is no longer open for payment' using errcode = '22023', hint = 'link_expired'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount given' using errcode = '22023', hint = 'amount_required'; end if;
  if coalesce(trim(p_given_by), '') = '' then raise exception 'Enter your name' using errcode = '22023', hint = 'name_required'; end if;
  if p_file is null or coalesce(p_file ->> 'path', '') = '' then raise exception 'Upload the proof of payment' using errcode = '22023', hint = 'proof_required'; end if;

  v_resource := case l.table_name when 'outstation_requests' then 'expenses.admin.outstation' else 'expenses.admin.petty_cash' end;
  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name, mime_type, size_bytes)
  values (l.company_id, l.table_name, l.record_id, v_resource, coalesce(p_file ->> 'bucket', 'forms'), p_file ->> 'path',
    'Proof of payment', coalesce(p_file ->> 'file_name', 'proof'), p_file ->> 'mime_type', nullif(p_file ->> 'size_bytes', '')::bigint);
  if l.table_name = 'outstation_requests' then
    update public.outstation_requests set amount_paid_tzs = round(p_amount, 2) where id = l.record_id;
    v_path := '/administration/outstation/' || l.record_id;
    v_text := ' from finance paid TZS ' || trim(to_char(p_amount, 'FM999,999,999,990')) || ' for this outstation allowance and uploaded the proof of payment.';
  else
    update public.petty_cash_requests set amount_received_tzs = round(p_amount, 2) where id = l.record_id;
    v_path := '/administration/petty-cash/' || l.record_id;
    v_text := ' from finance gave TZS ' || trim(to_char(p_amount, 'FM999,999,999,990')) || ' and uploaded the proof of payment. You can now record what you spend.';
  end if;
  update public.finance_links set used_at = now(), given_by = left(trim(p_given_by), 120), amount_given = round(p_amount, 2) where id = l.id;
  perform public.audit_write('finance_give', l.table_name, l.record_id::text, null,
    jsonb_build_object('amount', p_amount, 'given_by', p_given_by, 'email', l.email), l.company_id);
  if v_created_by is not null then
    perform public.notify_user(v_created_by, 'approval',
      case l.table_name when 'outstation_requests' then 'Outstation allowance paid' else 'Petty cash given' end,
      left(trim(p_given_by), 120) || v_text, v_path, l.company_id);
  end if;
  return jsonb_build_object('ok', true, 'company_id', l.company_id, 'record_id', l.record_id, 'table_name', l.table_name);
end;
$$;

create or replace function public.finance_link_target(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company_id', l.company_id, 'record_id', l.record_id, 'table_name', l.table_name)
  from public.finance_links l where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and l.used_at is null and l.expires_at > now();
$$;

revoke all on function public.finance_link_open(text) from public, anon, authenticated;
revoke all on function public.finance_link_give(text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.finance_link_target(text) from public, anon, authenticated;
grant execute on function public.finance_link_open(text) to service_role;
grant execute on function public.finance_link_give(text, numeric, text, jsonb) to service_role;
grant execute on function public.finance_link_target(text) to service_role;

-- ---------------------------------------------------------------------------
-- (3) A draft transaction can be changed by anyone who records petty cash
-- ---------------------------------------------------------------------------
drop policy if exists petty_cash_transactions_own_draft_update on public.petty_cash_transactions;
create policy petty_cash_transactions_own_draft_update on public.petty_cash_transactions for update to authenticated
  using (company_id = public.my_company_id() and deleted_at is null
         and status in ('draft', 'rejected') and public.has_permission('expenses.admin.petty_cash', 'create'))
  with check (company_id = public.my_company_id());

-- ---------------------------------------------------------------------------
-- (4) JKNIA is JNIA
-- ---------------------------------------------------------------------------
update public.travel_movements set
  terminal = regexp_replace(terminal, '^JKNIA\M', 'JNIA'),
  airport = regexp_replace(airport, '^JKNIA\M', 'JNIA'),
  transport_to = regexp_replace(transport_to, '^JKNIA\M', 'JNIA'),
  pickup_from = regexp_replace(pickup_from, '^JKNIA\M', 'JNIA')
where terminal ~ '^JKNIA\M' or airport ~ '^JKNIA\M' or transport_to ~ '^JKNIA\M' or pickup_from ~ '^JKNIA\M';
