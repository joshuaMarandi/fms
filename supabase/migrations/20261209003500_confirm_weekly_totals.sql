-- 35: (1) Requests keep their true submission time (approval no longer moves it).
-- (2) A fuel or maintenance request made for a driver by someone else must be confirmed and signed
--     by the driver through a personal link (email or SMS) before it can be approved.
-- (3) Totals and month counts for Fuel cost and Maintenance and repair records.
-- (4) Weekly inspection: like the daily pre-start inspection, done once a week.

-- ---------------------------------------------------------------------------
-- (1) Submission time
-- ---------------------------------------------------------------------------
create or replace function public.set_submitted_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['fuel_requests', 'maintenance_requests', 'tyre_requests', 'wash_requests', 'timesheets', 'leave_requests', 'vehicle_requests', 'outstation_requests', 'petty_cash_requests'] loop
    execute format('alter table public.%I add column if not exists submitted_at timestamptz', t);
    execute format('drop trigger if exists %I on public.%I', t || '_submitted_at', t);
    execute format('create trigger %I before insert or update of status on public.%I for each row execute function public.set_submitted_at()', t || '_submitted_at', t);
    -- Earlier requests: the first time the history saw them sent, else when they were created.
    execute format($q$update public.%I r set submitted_at = coalesce(
        (select min(e.created_at) from public.approval_events e where e.table_name = %L and e.record_id = r.id and e.action in ('submitted', 'resubmitted')),
        (select min(a.created_at) from public.audit_log a where a.table_name = %L and a.row_id = r.id::text and a.after ->> 'status' = 'submitted'),
        r.created_at)
      where r.status <> 'draft' and r.submitted_at is null$q$, t, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (2) Driver confirmation (non-repudiation)
-- ---------------------------------------------------------------------------
create table public.driver_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null check (table_name in ('fuel_requests', 'maintenance_requests')),
  record_id uuid not null,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  requested_by uuid,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  confirmed_at timestamptz,
  signature jsonb,
  created_at timestamptz not null default now()
);
create index driver_confirmations_record on public.driver_confirmations (table_name, record_id);
alter table public.driver_confirmations enable row level security;
-- People who may see the request may see whether the driver confirmed it.
create policy driver_confirmations_select on public.driver_confirmations for select to authenticated
  using (company_id = public.my_company_id()
    and public.has_permission(case table_name when 'fuel_requests' then 'daily_use.fuel_log' else 'expenses.maintenance.requests' end, 'view'));
grant select on public.driver_confirmations to authenticated;
grant all on public.driver_confirmations to service_role;

-- When sent for a driver by someone else: a personal link to the driver by email and SMS (and in the app).
create or replace function public.request_driver_confirmation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d public.drivers;
  v_token text;
  v_reg text;
  v_company_name text;
  v_by text;
  v_label text := case tg_table_name when 'fuel_requests' then 'fuel request' else 'maintenance request' end;
begin
  -- Only when a person (not the system) made it for a driver.
  if new.status <> 'submitted' or (tg_op = 'UPDATE' and old.status = 'submitted') or new.driver_id is null or new.created_by is null then
    return null;
  end if;
  select * into d from public.drivers where id = new.driver_id;
  -- The driver made it themselves: their own signature on the request is enough.
  if d.id is null or (d.profile_id is not null and d.profile_id = new.created_by) then
    return null;
  end if;
  -- Already waiting for (or given) a confirmation of this request.
  if exists (select 1 from public.driver_confirmations c where c.table_name = tg_table_name and c.record_id = new.id and (c.confirmed_at is not null or c.expires_at > now())) then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.driver_confirmations (company_id, table_name, record_id, driver_id, requested_by, token_hash)
  values (new.company_id, tg_table_name, new.id, d.id, new.created_by, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  select registration into v_reg from public.vehicles where id = new.vehicle_id;
  select name into v_company_name from public.companies where id = new.company_id;
  select full_name into v_by from public.profiles where id = new.created_by;
  perform public.workflow_enqueue(new.company_id, d.profile_id, d.email, d.phone, 'driver_confirm', jsonb_build_object(
    'name', coalesce(nullif(split_part(d.full_name, ' ', 1), ''), 'there'),
    'company', coalesce(v_company_name, ''),
    'request', v_label,
    'requester', coalesce(v_by, 'Your coordinator'),
    'summary', initcap(v_label) || ' for ' || coalesce(v_reg, 'a vehicle') || ' on ' || to_char(coalesce(new.request_date, current_date), 'DD Mon YYYY'),
    'record_table', tg_table_name,
    'record_id', new.id,
    'path', '/c/' || v_token,
    'expires', to_char(now() + interval '14 days', 'DD Mon YYYY')));
  if d.profile_id is not null then
    perform public.notify_user(d.profile_id, 'approval', 'Confirm the ' || v_label || ' made for you',
      coalesce(v_by, 'Someone') || ' made a ' || v_label || ' for you. Open the link in your email or SMS to confirm and sign it.', null, new.company_id);
  end if;
  return null;
end;
$$;

-- Approval waits for the driver's confirmation.
create or replace function public.request_driver_confirmed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'submitted' and new.status = 'approved'
     and exists (select 1 from public.driver_confirmations c where c.table_name = tg_table_name and c.record_id = new.id)
     and not exists (select 1 from public.driver_confirmations c where c.table_name = tg_table_name and c.record_id = new.id and c.confirmed_at is not null) then
    raise exception 'The driver has not yet confirmed and signed this request. It can be approved once they do.'
      using errcode = '23514', hint = 'driver_confirmation_pending';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['fuel_requests', 'maintenance_requests'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_driver_confirmation', t);
    execute format('create trigger %I after insert or update of status on public.%I for each row execute function public.request_driver_confirmation()', t || '_driver_confirmation', t);
    execute format('drop trigger if exists %I on public.%I', t || '_driver_confirmed_guard', t);
    execute format('create trigger %I before update of status on public.%I for each row execute function public.request_driver_confirmed_guard()', t || '_driver_confirmed_guard', t);
  end loop;
end $$;

-- The confirmation page (no sign-in, called with the service role): what the driver is confirming.
create or replace function public.driver_confirmation_open(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.driver_confirmations;
  r jsonb;
  v_state text := 'open';
begin
  select * into c from public.driver_confirmations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if c.id is null then return jsonb_build_object('state', 'not_found'); end if;
  if c.confirmed_at is not null then v_state := 'done';
  elsif c.expires_at < now() then v_state := 'expired';
  end if;
  execute format('select to_jsonb(x) from public.%I x where x.id = $1', c.table_name) into r using c.record_id;
  return jsonb_build_object(
    'state', v_state,
    'table', c.table_name,
    'record', r,
    'driver', (select full_name from public.drivers where id = c.driver_id),
    'requested_by', (select full_name from public.profiles where id = c.requested_by),
    'vehicle', (select registration || ' (' || make || ' ' || model || ')' from public.vehicles where id = (r ->> 'vehicle_id')::uuid),
    'company', (select name from public.companies where id = c.company_id),
    'confirmed_at', c.confirmed_at,
    'expires_at', c.expires_at);
end;
$$;

create or replace function public.driver_confirmation_sign(p_token text, p_signature jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.driver_confirmations;
begin
  select * into c from public.driver_confirmations where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if c.id is null then raise exception 'This link is not valid' using errcode = '22023', hint = 'link_not_found'; end if;
  if c.confirmed_at is not null then raise exception 'Already confirmed' using errcode = '22023', hint = 'link_done'; end if;
  if c.expires_at < now() then raise exception 'This link has expired' using errcode = '22023', hint = 'link_expired'; end if;
  if p_signature is null then raise exception 'A signature is required' using errcode = '22023', hint = 'signature_required'; end if;
  update public.driver_confirmations set confirmed_at = now(), signature = p_signature || jsonb_build_object('signed_at', now(), 'via', 'link') where id = c.id;
  perform public.audit_write('driver_confirm', c.table_name, c.record_id::text, null, jsonb_build_object('driver_id', c.driver_id, 'confirmed_at', now()), c.company_id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.driver_confirmation_open(text) from public, anon, authenticated;
revoke all on function public.driver_confirmation_sign(text, jsonb) from public, anon, authenticated;
grant execute on function public.driver_confirmation_open(text) to service_role;
grant execute on function public.driver_confirmation_sign(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- (4) Weekly inspection (same records as the daily one, marked weekly)
-- ---------------------------------------------------------------------------
alter table public.daily_inspections add column if not exists frequency text not null default 'daily';
alter table public.daily_inspections drop constraint if exists daily_inspections_frequency_check;
alter table public.daily_inspections add constraint daily_inspections_frequency_check check (frequency in ('daily', 'weekly'));

-- The key sits under the daily one, so whoever may do daily inspections may do weekly ones.
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('inspections.daily.weekly', 'fleet_safety', 'Weekly inspection', null, '/inspections/weekly', 'calendar-days', 302, false, false)
on conflict (key) do update set parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, sort_order = excluded.sort_order;
update public.resources set sort_order = 304 where key = 'inspections.third_party';
update public.resources set sort_order = 305 where key = 'expenses.trainings.mandatory';
update public.resources set sort_order = 306 where key = 'expenses.trainings.toolbox';
update public.resources set sort_order = 307 where key = 'expenses.trainings.matrix';
update public.resources set sort_order = 308 where key = 'expenses.safety.incidents';
update public.resources set sort_order = 309 where key = 'expenses.safety.reports';

create or replace view public.v_vehicle_inspection_summary with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  v.created_at::date as added_on,
  (select array_agg(distinct d.inspection_date order by d.inspection_date)
     from public.daily_inspections d
    where d.vehicle_id = v.id and d.deleted_at is null and d.frequency = 'daily' and d.inspection_date >= current_date - 40) as daily_dates,
  (select max(d.inspection_date) from public.daily_inspections d where d.vehicle_id = v.id and d.deleted_at is null and d.frequency = 'daily') as daily_last,
  (select count(*) from public.inspection_anomalies a join public.daily_inspections d on d.id = a.daily_inspection_id
    where a.vehicle_id = v.id and a.deleted_at is null and d.frequency = 'daily' and a.status = 'open') as daily_open,
  (select count(*) from public.inspection_anomalies a join public.daily_inspections d on d.id = a.daily_inspection_id
    where a.vehicle_id = v.id and a.deleted_at is null and d.frequency = 'daily' and a.status = 'closed') as daily_closed,
  mob.inspection_date as mobilization_last,
  mob.renewal_date as mobilization_next,
  tp.inspection_date as third_party_last,
  tp.renewal_date as third_party_next,
  (select count(*) from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null and a.third_party_inspection_id is not null and a.status = 'open') as third_party_open,
  (select array_agg(distinct d.inspection_date order by d.inspection_date)
     from public.daily_inspections d
    where d.vehicle_id = v.id and d.deleted_at is null and d.frequency = 'weekly' and d.inspection_date >= current_date - 70) as weekly_dates,
  (select max(d.inspection_date) from public.daily_inspections d where d.vehicle_id = v.id and d.deleted_at is null and d.frequency = 'weekly') as weekly_last,
  (select count(*) from public.inspection_anomalies a join public.daily_inspections d on d.id = a.daily_inspection_id
    where a.vehicle_id = v.id and a.deleted_at is null and d.frequency = 'weekly' and a.status = 'open') as weekly_open,
  (select count(*) from public.inspection_anomalies a join public.daily_inspections d on d.id = a.daily_inspection_id
    where a.vehicle_id = v.id and a.deleted_at is null and d.frequency = 'weekly' and a.status = 'closed') as weekly_closed
from public.vehicles v
left join lateral (
  select i.inspection_date, i.renewal_date from public.vehicle_inspections i
   where i.vehicle_id = v.id and i.kind = 'internal' and i.deleted_at is null
   order by i.inspection_date desc nulls last, i.created_at desc limit 1
) mob on true
left join lateral (
  select t.inspection_date, t.renewal_date from public.third_party_inspections t
   where t.vehicle_id = v.id and t.deleted_at is null
   order by t.inspection_date desc nulls last, t.created_at desc limit 1
) tp on true
where v.deleted_at is null;

-- ---------------------------------------------------------------------------
-- (3) Month counts and totals
-- ---------------------------------------------------------------------------
create or replace function public.vehicle_month_counts(p_table text, p_vehicle uuid, p_year int)
returns table (month int, records bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_table text := case when p_table = 'weekly_inspections' then 'daily_inspections' else p_table end;
  v_col text := case p_table
    when 'daily_inspections' then 'inspection_date'
    when 'weekly_inspections' then 'inspection_date'
    when 'km_logs' then 'log_date'
    when 'fuel_requests' then 'request_date'
    when 'fuel_issues' then 'issue_date'
    when 'fuel_expenses' then 'expense_date'
    when 'maintenance_costs' then 'cost_date'
    else null end;
  v_extra text := case p_table when 'daily_inspections' then ' and frequency = ''daily''' when 'weekly_inspections' then ' and frequency = ''weekly''' else '' end;
begin
  if v_col is null then
    raise exception 'Not a monthly record table: %', p_table;
  end if;
  return query execute format(
    'select extract(month from %1$I)::int, count(*) from public.%2$I
     where vehicle_id = $1 and deleted_at is null and extract(year from %1$I) = $2' || v_extra || '
     group by 1', v_col, v_table)
  using p_vehicle, p_year;
end;
$$;
grant execute on function public.vehicle_month_counts(text, uuid, int) to authenticated;

create or replace function public.vehicle_totals(p_kind text, p_from date default null, p_to date default null)
returns table (vehicle_id uuid, records bigint, trips numeric, km numeric, litres numeric, cost numeric, pending bigint, first_date date, last_date date)
language plpgsql stable security invoker set search_path = public as $$
begin
  if p_kind = 'km_log' then
    return query
      select l.vehicle_id, count(*), coalesce(sum(l.trip_count), 0)::numeric, coalesce(sum(l.total_km), 0)::numeric, 0::numeric, 0::numeric, 0::bigint, min(l.log_date), max(l.log_date)
      from public.km_logs l
      where l.deleted_at is null and (p_from is null or l.log_date >= p_from) and (p_to is null or l.log_date <= p_to)
      group by l.vehicle_id;
  elsif p_kind = 'fuel_requests' then
    return query
      select r.vehicle_id, count(*), 0::numeric, coalesce(sum(r.current_odometer - r.previous_odometer) filter (where r.current_odometer >= r.previous_odometer), 0)::numeric,
             coalesce(sum(coalesce(r.approved_l, r.fuel_required_l)), 0)::numeric, 0::numeric, count(*) filter (where r.status = 'submitted'), min(r.request_date), max(r.request_date)
      from public.fuel_requests r
      where r.deleted_at is null and (p_from is null or r.request_date >= p_from) and (p_to is null or r.request_date <= p_to)
      group by r.vehicle_id;
  elsif p_kind = 'fuel_issues' then
    -- trips holds the fuel consumed (the previous fills), litres the fuel filled.
    return query
      select i.vehicle_id, count(*), coalesce(sum(i.previous_filled_l), 0)::numeric, coalesce(sum(i.km_run), 0)::numeric, coalesce(sum(i.fuel_issued_l), 0)::numeric, coalesce(sum(i.total_cost_tzs), 0)::numeric, 0::bigint, min(i.issue_date), max(i.issue_date)
      from public.fuel_issues i
      where i.deleted_at is null and (p_from is null or i.issue_date >= p_from) and (p_to is null or i.issue_date <= p_to)
      group by i.vehicle_id;
  elsif p_kind = 'fuel_expenses' then
    return query
      select e.vehicle_id, count(*), 0::numeric, coalesce(sum(e.km_run), 0)::numeric, coalesce(sum(e.fuel_consumed_l), 0)::numeric, coalesce(sum(e.amount_tzs), 0)::numeric, 0::bigint, min(e.expense_date), max(e.expense_date)
      from public.fuel_expenses e
      where e.deleted_at is null and (p_from is null or e.expense_date >= p_from) and (p_to is null or e.expense_date <= p_to)
      group by e.vehicle_id;
  elsif p_kind in ('maintenance_costs', 'maintenance_only', 'repairs_only') then
    -- litres holds the maintenance part and trips the repair part of the cost.
    return query
      select c.vehicle_id, count(*), coalesce(sum(c.cost_tzs) filter (where c.work_type = 'repairs'), 0)::numeric, 0::numeric,
             coalesce(sum(c.cost_tzs) filter (where c.work_type = 'maintenance'), 0)::numeric, coalesce(sum(c.cost_tzs), 0)::numeric, 0::bigint, min(c.cost_date), max(c.cost_date)
      from public.maintenance_costs c
      where c.deleted_at is null and (p_from is null or c.cost_date >= p_from) and (p_to is null or c.cost_date <= p_to)
        and (p_kind = 'maintenance_costs' or (p_kind = 'maintenance_only' and c.work_type = 'maintenance') or (p_kind = 'repairs_only' and c.work_type = 'repairs'))
      group by c.vehicle_id;
  end if;
end;
$$;
grant execute on function public.vehicle_totals(text, date, date) to authenticated;
