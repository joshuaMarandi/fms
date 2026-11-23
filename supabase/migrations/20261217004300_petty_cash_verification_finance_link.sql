-- Petty cash:
-- (1) Requests and their transactions are sent for verification (fleet manager, then HOD), not
--     approval: the emails name the steps that way.
-- (2) Once verified, finance gets an email with a personal link to give the money: they record the
--     amount given and upload the proof of payment there (no account needed). The requester is told.
-- (3) Whoever recorded a petty cash request or transaction can change it while it is a draft (or
--     rejected), even without the edit permission.

-- ---------------------------------------------------------------------------
-- (1) Step names per table
-- ---------------------------------------------------------------------------
create or replace function public.workflow_step_label_for(p_table text, p_step text)
returns text language sql immutable as $$
  select case
    when p_table in ('petty_cash_requests', 'petty_cash_transactions') and p_step = 'approval' then 'Fleet manager verification'
    when p_table in ('petty_cash_requests', 'petty_cash_transactions') and p_step in ('hod_approval', 'hod_verify') then 'HOD verification'
    else public.workflow_step_label(p_step) end;
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
    'step', public.workflow_step_label_for(p_table, v_step),
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
      'step', public.workflow_step_label_for(p_table, v_step),
      'requester', v_summary ->> 'requester',
      'summary', v_summary ->> 'summary',
      'details', v_summary -> 'details',
      'approver', coalesce(nullif(v_actor.full_name, ''), 'the approver'),
      'cc', to_jsonb(v_cc[2:])));
  end if;
  return 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- (2) Finance gives the money through a personal link
-- ---------------------------------------------------------------------------
create table if not exists public.finance_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null check (table_name = 'petty_cash_requests'),
  record_id uuid not null,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  given_by text,
  amount_given numeric(14,2),
  created_at timestamptz not null default now()
);
create index if not exists finance_links_record on public.finance_links (table_name, record_id);
alter table public.finance_links enable row level security;
drop policy if exists finance_links_select on public.finance_links;
create policy finance_links_select on public.finance_links for select to authenticated
  using (company_id = public.my_company_id() and public.has_permission('expenses.admin.petty_cash', 'view'));
grant select on public.finance_links to authenticated;
grant all on public.finance_links to service_role;

-- Verified by the HOD: to finance. Petty cash gets a link to give the money and upload the proof;
-- outstation allowance stays as it was (every detail in the email).
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
  end if;
  for e in select trim(x) from jsonb_array_elements_text(case when jsonb_typeof(v_emails) = 'array' then v_emails else '[]'::jsonb end) x loop
    if e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      if p_table = 'petty_cash_requests' then
        v_token := replace(gen_random_uuid()::text, '-', '');
        insert into public.finance_links (company_id, table_name, record_id, email, token_hash)
        values (v_company, p_table, p_id, lower(e), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
        insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
        values (v_company, null, 'email', e, 'petty_cash_finance', jsonb_build_object(
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

-- The finance page (no sign-in, called with the service role): what to pay.
create or replace function public.finance_link_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l public.finance_links;
  r public.petty_cash_requests;
  v_state text := 'open';
  v_done public.finance_links;
begin
  select * into l from public.finance_links where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if l.id is null then return jsonb_build_object('state', 'not_found'); end if;
  select * into r from public.petty_cash_requests where id = l.record_id and deleted_at is null;
  if r.id is null then return jsonb_build_object('state', 'not_found'); end if;
  -- Given already (through this link or another finance email).
  select * into v_done from public.finance_links where table_name = l.table_name and record_id = l.record_id and used_at is not null order by used_at desc limit 1;
  if v_done.id is not null then v_state := 'done';
  elsif l.expires_at < now() then v_state := 'expired';
  elsif r.status <> 'approved' then v_state := 'expired';
  end if;
  return jsonb_build_object(
    'state', v_state,
    'company', (select name from public.companies where id = l.company_id),
    'requester', r.requester_name,
    'position', r.position,
    'purpose', r.purpose,
    'request_date', r.request_date,
    'amount_requested', r.amount_requested_tzs,
    'amount_approved', coalesce(r.amount_approved_tzs, r.amount_requested_tzs),
    'verified_by', (select string_agg(coalesce(signer_name, '') || ' (' || public.workflow_step_label_for('petty_cash_requests', step) || ')', ', ' order by created_at)
                    from public.approval_signoffs where table_name = 'petty_cash_requests' and record_id = r.id),
    'hod', (select full_name from public.profiles where id = r.approved_by),
    'given_by', v_done.given_by,
    'given_at', v_done.used_at,
    'amount_given', v_done.amount_given);
end;
$$;

-- Finance has given the money: the amount, who gave it, and the proof of payment (already uploaded
-- to storage by the page). The requester is told; spending can start.
create or replace function public.finance_link_give(p_token text, p_amount numeric, p_given_by text, p_file jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.finance_links;
  r public.petty_cash_requests;
begin
  select * into l from public.finance_links where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if l.id is null then raise exception 'This link is not valid' using errcode = '22023', hint = 'link_not_found'; end if;
  if exists (select 1 from public.finance_links where table_name = l.table_name and record_id = l.record_id and used_at is not null) then
    raise exception 'The money for this request is already recorded' using errcode = '22023', hint = 'link_done';
  end if;
  if l.expires_at < now() then raise exception 'This link has expired' using errcode = '22023', hint = 'link_expired'; end if;
  select * into r from public.petty_cash_requests where id = l.record_id and deleted_at is null for update;
  if r.id is null or r.status <> 'approved' then raise exception 'This request is no longer open for payment' using errcode = '22023', hint = 'link_expired'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount given' using errcode = '22023', hint = 'amount_required'; end if;
  if coalesce(trim(p_given_by), '') = '' then raise exception 'Enter your name' using errcode = '22023', hint = 'name_required'; end if;
  if p_file is null or coalesce(p_file ->> 'path', '') = '' then raise exception 'Upload the proof of payment' using errcode = '22023', hint = 'proof_required'; end if;

  insert into public.attachments (company_id, table_name, row_id, resource_key, bucket, path, label, file_name, mime_type, size_bytes)
  values (l.company_id, 'petty_cash_requests', r.id, 'expenses.admin.petty_cash', coalesce(p_file ->> 'bucket', 'forms'), p_file ->> 'path',
    'Proof of payment', coalesce(p_file ->> 'file_name', 'proof'), p_file ->> 'mime_type', nullif(p_file ->> 'size_bytes', '')::bigint);
  update public.petty_cash_requests set amount_received_tzs = round(p_amount, 2) where id = r.id;
  update public.finance_links set used_at = now(), given_by = left(trim(p_given_by), 120), amount_given = round(p_amount, 2) where id = l.id;
  perform public.audit_write('finance_give', 'petty_cash_requests', r.id::text, null,
    jsonb_build_object('amount', p_amount, 'given_by', p_given_by, 'email', l.email), l.company_id);
  if r.created_by is not null then
    perform public.notify_user(r.created_by, 'approval', 'Petty cash given',
      left(trim(p_given_by), 120) || ' from finance gave TZS ' || trim(to_char(p_amount, 'FM999,999,999,990')) || ' and uploaded the proof of payment. You can now record what you spend.',
      '/administration/petty-cash/' || r.id, l.company_id);
  end if;
  return jsonb_build_object('ok', true, 'company_id', l.company_id, 'record_id', r.id);
end;
$$;

-- Where the page may put the uploaded proof (checked before uploading).
create or replace function public.finance_link_target(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('company_id', l.company_id, 'record_id', l.record_id)
  from public.finance_links l where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and l.used_at is null and l.expires_at > now();
$$;

revoke all on function public.finance_link_open(text) from public, anon, authenticated;
revoke all on function public.finance_link_give(text, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.finance_link_target(text) from public, anon, authenticated;
grant execute on function public.finance_link_open(text) to service_role;
grant execute on function public.finance_link_give(text, numeric, text, jsonb) to service_role;
grant execute on function public.finance_link_target(text) to service_role;

-- ---------------------------------------------------------------------------
-- (3) The person who recorded it may change their own draft
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['petty_cash_requests', 'petty_cash_transactions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_draft_update', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (company_id = public.my_company_id() and deleted_at is null and created_by = auth.uid()
             and status in ('draft', 'rejected') and public.has_permission('expenses.admin.petty_cash', 'create'))
      with check (company_id = public.my_company_id() and created_by = auth.uid())$p$, t || '_own_draft_update', t);
  end loop;
end $$;
