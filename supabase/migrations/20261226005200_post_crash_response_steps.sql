-- Post-crash response: five steps, done one by one, each opened and then closed:
--   I   Incident escalation (internal, police or local authority, insurance company)
--   II  Mobilization of the response team and equipment (with the medical facility)
--   III Incident investigation (internal and external)
--   IV  Vehicle recovery
--   V   Insurance recovery (garage, estimate, authorization, repair and recovery status)
-- A step can be opened only once the one before it is closed. Its answers are kept as details;
-- its documents are attachments of the step. Closing checks what the step needs.

create table if not exists public.incident_response_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  step text not null check (step in ('escalation', 'mobilization', 'investigation', 'vehicle_recovery', 'insurance_recovery')),
  status text not null default 'open' check (status in ('open', 'closed')),
  details jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  opened_by uuid default auth.uid(),
  closed_at timestamptz,
  closed_by uuid,
  unique (incident_id, step)
);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'incident_response_steps' and column_name = 'created_at') then
    alter table public.incident_response_steps
      add column created_at timestamptz not null default now(),
      add column created_by uuid,
      add column updated_at timestamptz not null default now(),
      add column updated_by uuid,
      add column deleted_at timestamptz;
    create index incident_response_steps_parent_idx on public.incident_response_steps (incident_id) where deleted_at is null;
    create trigger incident_response_steps_audit before insert or update on public.incident_response_steps for each row execute function public.set_audit_fields();
    grant all on public.incident_response_steps to authenticated, service_role;
  end if;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('incident_response_steps', 'expenses.safety.incidents', 'incidents', 'incident_id', false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;
select public.apply_standard_rls('incident_response_steps', 'expenses.safety.incidents');

create or replace function public.incident_step_order(p_step text)
returns int language sql immutable as $$
  select case p_step when 'escalation' then 1 when 'mobilization' then 2 when 'investigation' then 3
    when 'vehicle_recovery' then 4 when 'insurance_recovery' then 5 end;
$$;

create or replace function public.incident_step_name(p_step text)
returns text language sql immutable as $$
  select case p_step when 'escalation' then 'I. Incident escalation' when 'mobilization' then 'II. Mobilization of response team and equipment'
    when 'investigation' then 'III. Incident investigation' when 'vehicle_recovery' then 'IV. Vehicle recovery'
    when 'insurance_recovery' then 'V. Insurance recovery' end;
$$;

-- Who may work on the steps: whoever may record or edit incidents.
create or replace function public.incident_step_check_access(p_incident uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.incidents where id = p_incident and deleted_at is null;
  if v_company is null or (v_company is distinct from public.my_company_id() and not public.is_owner()) then
    raise exception 'Incident not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not (public.is_owner() or public.has_permission('expenses.safety.incidents', 'edit') or public.has_permission('expenses.safety.incidents', 'create')) then
    raise exception 'You cannot record the post-crash response' using errcode = '42501', hint = 'permission_denied';
  end if;
  return v_company;
end;
$$;

-- Open a step: the step before it must be closed.
create or replace function public.incident_step_open(p_incident uuid, p_step text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.incident_step_check_access(p_incident);
  v_order int := public.incident_step_order(p_step);
  v_prev text;
  v_id uuid;
begin
  if v_order is null then raise exception 'Unknown step' using errcode = '22023'; end if;
  select id into v_id from public.incident_response_steps where incident_id = p_incident and step = p_step and deleted_at is null;
  if v_id is not null then return v_id; end if;
  if v_order > 1 then
    v_prev := (array['escalation', 'mobilization', 'investigation', 'vehicle_recovery'])[v_order - 1];
    if not exists (select 1 from public.incident_response_steps where incident_id = p_incident and step = v_prev and status = 'closed' and deleted_at is null) then
      raise exception 'Close % first', public.incident_step_name(v_prev) using errcode = '23514', hint = 'previous_open';
    end if;
  end if;
  insert into public.incident_response_steps (company_id, incident_id, step) values (v_company, p_incident, p_step) returning id into v_id;
  return v_id;
end;
$$;

-- What the step still needs before it can be closed (empty when ready).
create or replace function public.incident_step_missing(p_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  s public.incident_response_steps;
  d jsonb;
  m text[] := '{}';
  has text := 'incident_response_steps';
  f boolean;
  blank text;
begin
  select * into s from public.incident_response_steps where id = p_id;
  d := coalesce(s.details, '{}'::jsonb);
  if s.step = 'escalation' then
    if not (coalesce((d ->> 'internal_reported')::boolean, false) or coalesce((d ->> 'police_reported')::boolean, false) or coalesce((d ->> 'insurance_reported')::boolean, false)) then
      m := array_append(m, 'Who the incident was reported to');
    end if;
    foreach blank in array array['internal', 'police', 'insurance'] loop
      if coalesce((d ->> (blank || '_reported'))::boolean, false) and (coalesce(trim(d ->> (blank || '_name')), '') = '' or coalesce(trim(d ->> (blank || '_phone')), '') = '') then
        m := array_append(m, ('Name and phone of the person told (' || case blank when 'internal' then 'internal' when 'police' then 'police or local authority' else 'insurance company' end || ')'));
      end if;
    end loop;
  elsif s.step = 'mobilization' then
    if coalesce(trim(d ->> 'team_name'), '') = '' then m := array_append(m, 'Name of the response team or person'); end if;
    if coalesce(trim(d ->> 'from_place'), '') = '' or coalesce(trim(d ->> 'to_place'), '') = '' then m := array_append(m, 'From and to'); end if;
    if not public.petty_cash_has_doc(has, s.id, 'Mobilization report') then m := array_append(m, 'Mobilization report'); end if;
  elsif s.step = 'investigation' then
    f := coalesce((d ->> 'internal_done')::boolean, false) or coalesce((d ->> 'external_done')::boolean, false);
    if not f then m := array_append(m, 'The internal or external investigation'); end if;
    if coalesce((d ->> 'internal_done')::boolean, false) then
      if coalesce(trim(d ->> 'internal_investigator'), '') = '' then m := array_append(m, 'Internal investigator'); end if;
      if not public.petty_cash_has_doc(has, s.id, 'Internal investigation report') then m := array_append(m, 'Internal investigation report'); end if;
    end if;
    if coalesce((d ->> 'external_done')::boolean, false) then
      if coalesce(trim(d ->> 'police_investigator'), '') = '' or coalesce(trim(d ->> 'police_rank'), '') = '' then m := array_append(m, 'Police investigator name and rank'); end if;
      if not public.petty_cash_has_doc(has, s.id, 'Particulars of accident') then m := array_append(m, 'Particulars of accident'); end if;
      if not public.petty_cash_has_doc(has, s.id, 'Inspection report') then m := array_append(m, 'Inspection report'); end if;
    end if;
  elsif s.step = 'vehicle_recovery' then
    if coalesce(trim(d ->> 'company'), '') = '' or coalesce(trim(d ->> 'phone'), '') = '' then m := array_append(m, 'Recovery company name and phone'); end if;
    if coalesce(trim(d ->> 'from_place'), '') = '' or coalesce(trim(d ->> 'to_place'), '') = '' then m := array_append(m, 'From and to'); end if;
  elsif s.step = 'insurance_recovery' then
    if coalesce(trim(d ->> 'garage_name'), '') = '' then m := array_append(m, 'Selected garage'); end if;
    if not public.petty_cash_has_doc(has, s.id, 'Repair estimate') then m := array_append(m, 'Repair estimate'); end if;
    if coalesce((d ->> 'authorization_issued')::boolean, false) and not public.petty_cash_has_doc(has, s.id, 'Repair authorization letter') then m := array_append(m, 'Repair authorization letter'); end if;
    if coalesce(d ->> 'repair_status', '') <> 'completed' then m := array_append(m, 'Vehicle repair completed'); end if;
    if coalesce(d ->> 'insurance_status', '') not in ('recovered', 'declined') then m := array_append(m, 'Insurance recovery recovered or declined'); end if;
  end if;
  return m;
end;
$$;

-- Save a step's answers (while it is open).
create or replace function public.incident_step_save(p_id uuid, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.incident_response_steps;
begin
  select * into s from public.incident_response_steps where id = p_id and deleted_at is null for update;
  if s.id is null then raise exception 'Step not found' using errcode = 'P0002', hint = 'not_found'; end if;
  perform public.incident_step_check_access(s.incident_id);
  if s.status = 'closed' then raise exception 'This step is closed. Reopen it to change it.' using errcode = '23514', hint = 'step_closed'; end if;
  -- Marking the repair completed needs the release authorization letter.
  if s.step = 'insurance_recovery' and coalesce(p_details ->> 'repair_status', '') = 'completed'
     and not public.petty_cash_has_doc('incident_response_steps', s.id, 'Release authorization letter') then
    raise exception 'Upload the release authorization letter before marking the repair completed' using errcode = '23514', hint = 'release_letter';
  end if;
  update public.incident_response_steps set details = coalesce(p_details, '{}'::jsonb) where id = p_id;
  return jsonb_build_object('missing', to_jsonb(public.incident_step_missing(p_id)));
end;
$$;

-- Close a step once it has what it needs.
create or replace function public.incident_step_close(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  s public.incident_response_steps;
  v_missing text[];
begin
  select * into s from public.incident_response_steps where id = p_id and deleted_at is null for update;
  if s.id is null then raise exception 'Step not found' using errcode = 'P0002', hint = 'not_found'; end if;
  perform public.incident_step_check_access(s.incident_id);
  if s.status = 'closed' then return s.closed_at; end if;
  v_missing := public.incident_step_missing(p_id);
  if cardinality(v_missing) > 0 then
    raise exception 'Before closing, add: %', array_to_string(v_missing, '; ') using errcode = '23514', hint = 'step_incomplete';
  end if;
  update public.incident_response_steps set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_id;
  return now();
end;
$$;

-- Reopen the last closed step (only while the next one is not started).
create or replace function public.incident_step_reopen(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  s public.incident_response_steps;
begin
  select * into s from public.incident_response_steps where id = p_id and deleted_at is null for update;
  if s.id is null then raise exception 'Step not found' using errcode = 'P0002', hint = 'not_found'; end if;
  perform public.incident_step_check_access(s.incident_id);
  if exists (select 1 from public.incident_response_steps x where x.incident_id = s.incident_id and x.deleted_at is null
             and public.incident_step_order(x.step) > public.incident_step_order(s.step)) then
    raise exception 'The next step is already started' using errcode = '23514', hint = 'next_started';
  end if;
  update public.incident_response_steps set status = 'open', closed_at = null, closed_by = null where id = p_id;
  return true;
end;
$$;

revoke all on function public.incident_step_check_access(uuid) from public, anon, authenticated;
revoke all on function public.incident_step_open(uuid, text) from public, anon;
revoke all on function public.incident_step_save(uuid, jsonb) from public, anon;
revoke all on function public.incident_step_close(uuid) from public, anon;
revoke all on function public.incident_step_reopen(uuid) from public, anon;
grant execute on function public.incident_step_open(uuid, text) to authenticated;
grant execute on function public.incident_step_save(uuid, jsonb) to authenticated;
grant execute on function public.incident_step_close(uuid) to authenticated;
grant execute on function public.incident_step_reopen(uuid) to authenticated;
grant execute on function public.incident_step_missing(uuid) to authenticated;
