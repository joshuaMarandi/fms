-- (1) Travel departures and arrivals: each traveller is a line of their own (name, email, phone),
--     added with "Add traveller". The record keeps the names and phones as text (lists, search,
--     export), and the pickup details are sent to every traveller with an email or phone.
-- (2) Road crash: post-crash responses are lines (date, response, person responsible), added one
--     by one. The incident keeps them as text in other_actions (print, export).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.travel_travellers (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  movement_id uuid not null references public.travel_movements(id) on delete cascade,
  name text not null check (trim(name) <> ''),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text
);

create table if not exists public.incident_responses (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  response_date date not null default current_date,
  response text not null check (trim(response) <> ''),
  responsible text
);

do $$
declare
  t text;
  fk text;
begin
  foreach t in array array['travel_travellers', 'incident_responses'] loop
    fk := case t when 'travel_travellers' then 'movement_id' else 'incident_id' end;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at') then
      execute format('alter table public.%I
        add column created_at timestamptz not null default now(),
        add column created_by uuid,
        add column updated_at timestamptz not null default now(),
        add column updated_by uuid,
        add column deleted_at timestamptz', t);
      execute format('create index %I on public.%I (%I) where deleted_at is null', t || '_parent_idx', t, fk);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
      execute format('grant all on public.%I to authenticated, service_role', t);
    end if;
  end loop;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('travel_travellers', 'expenses.travel', 'travel_movements', 'movement_id', false),
  ('incident_responses', 'expenses.safety.incidents', 'incidents', 'incident_id', false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;

select public.apply_standard_rls('travel_travellers', 'expenses.travel');
select public.apply_standard_rls('incident_responses', 'expenses.safety.incidents');

-- The record's text now comes from its lines.
alter table public.travel_movements alter column travellers drop not null;

-- Blank email or phone is no email or phone.
create or replace function public.travel_travellers_clean()
returns trigger language plpgsql as $$
begin
  new.name := trim(new.name);
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.phone := nullif(trim(coalesce(new.phone, '')), '');
  return new;
end;
$$;
drop trigger if exists travel_travellers_clean on public.travel_travellers;
create trigger travel_travellers_clean before insert or update on public.travel_travellers
  for each row execute function public.travel_travellers_clean();

-- ---------------------------------------------------------------------------
-- Lines -> the record's text
-- ---------------------------------------------------------------------------
create or replace function public.travel_travellers_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.movement_id, old.movement_id);
begin
  update public.travel_movements m set
    travellers = x.names,
    traveller_email = x.email,
    traveller_phone = x.phones
  from (
    select string_agg(l.name, E'\n' order by l.line_no) as names,
           (array_agg(l.email order by l.line_no) filter (where l.email is not null))[1] as email,
           string_agg(l.phone, E'\n' order by l.line_no) filter (where l.phone is not null) as phones
    from public.travel_travellers l where l.movement_id = v_id and l.deleted_at is null
  ) x
  where m.id = v_id;
  return null;
end;
$$;
drop trigger if exists travel_travellers_text on public.travel_travellers;
create trigger travel_travellers_text after insert or update or delete on public.travel_travellers
  for each row execute function public.travel_travellers_text();

create or replace function public.incident_responses_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.incident_id, old.incident_id);
begin
  update public.incidents i set other_actions = (
    select string_agg(to_char(l.response_date, 'DD Mon YYYY') || ': ' || l.response || coalesce(' (' || nullif(trim(l.responsible), '') || ')', ''), E'\n' order by l.response_date, l.line_no)
    from public.incident_responses l where l.incident_id = v_id and l.deleted_at is null)
  where i.id = v_id;
  return null;
end;
$$;
drop trigger if exists incident_responses_text on public.incident_responses;
create trigger incident_responses_text after insert or update or delete on public.incident_responses
  for each row execute function public.incident_responses_text();

-- A record saved with text and no lines (seeds, imports) gets its text as lines: one traveller per
-- line of names (the first with the record's email and phone); the response as one line.
create or replace function public.travel_movements_text_to_lines()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  i integer := 0;
begin
  if coalesce(trim(new.travellers), '') = '' then return null; end if;
  if exists (select 1 from public.travel_travellers where movement_id = new.id) then return null; end if;
  for v_name in select trim(x) from regexp_split_to_table(new.travellers, E'\n') x where trim(x) <> '' loop
    i := i + 1;
    insert into public.travel_travellers (company_id, movement_id, name, email, phone, created_by)
    values (new.company_id, new.id, v_name,
      case when i = 1 and new.traveller_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then new.traveller_email end,
      case when i = 1 then new.traveller_phone end, new.created_by);
  end loop;
  return null;
end;
$$;
drop trigger if exists travel_movements_text_to_lines on public.travel_movements;
create trigger travel_movements_text_to_lines after insert on public.travel_movements
  for each row execute function public.travel_movements_text_to_lines();

create or replace function public.incidents_text_to_line()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.other_actions), '') = '' then return null; end if;
  if exists (select 1 from public.incident_responses where incident_id = new.id) then return null; end if;
  -- Kept as written (the line's text is not rebuilt until a response changes).
  perform set_config('fms.skip_response_text', 'on', true);
  insert into public.incident_responses (company_id, incident_id, response_date, response, created_by)
  values (new.company_id, new.id, coalesce((new.occurred_at at time zone 'Africa/Dar_es_Salaam')::date, current_date), new.other_actions, new.created_by);
  perform set_config('fms.skip_response_text', 'off', true);
  return null;
end;
$$;
drop trigger if exists incidents_text_to_line on public.incidents;
create trigger incidents_text_to_line after insert on public.incidents
  for each row execute function public.incidents_text_to_line();

-- The incident's own text stays as typed when it becomes its first line.
create or replace function public.incident_responses_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.incident_id, old.incident_id);
begin
  if current_setting('fms.skip_response_text', true) = 'on' then return null; end if;
  update public.incidents i set other_actions = (
    select string_agg(to_char(l.response_date, 'DD Mon YYYY') || ': ' || l.response || coalesce(' (' || nullif(trim(l.responsible), '') || ')', ''), E'\n' order by l.response_date, l.line_no)
    from public.incident_responses l where l.incident_id = v_id and l.deleted_at is null)
  where i.id = v_id;
  return null;
end;
$$;

-- Records so far.
do $$
declare
  m record;
  v_name text;
  i integer;
begin
  for m in select * from public.travel_movements x where coalesce(trim(x.travellers), '') <> ''
             and not exists (select 1 from public.travel_travellers l where l.movement_id = x.id) loop
    i := 0;
    for v_name in select trim(x) from regexp_split_to_table(m.travellers, E'\n') x where trim(x) <> '' loop
      i := i + 1;
      insert into public.travel_travellers (company_id, movement_id, name, email, phone, created_by, deleted_at)
      values (m.company_id, m.id, v_name,
        case when i = 1 and m.traveller_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then m.traveller_email end,
        case when i = 1 then m.traveller_phone end, m.created_by, m.deleted_at);
    end loop;
  end loop;
end $$;

do $$
begin
  perform set_config('fms.skip_response_text', 'on', true);
  insert into public.incident_responses (company_id, incident_id, response_date, response, created_by, deleted_at)
  select i.company_id, i.id, coalesce((i.occurred_at at time zone 'Africa/Dar_es_Salaam')::date, current_date), i.other_actions, i.created_by, i.deleted_at
  from public.incidents i
  where coalesce(trim(i.other_actions), '') <> '' and not exists (select 1 from public.incident_responses r where r.incident_id = i.id);
  perform set_config('fms.skip_response_text', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- (1) The pickup details go to every traveller with an email or phone
-- ---------------------------------------------------------------------------
create or replace function public.travel_notify(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  m public.travel_movements;
  v_driver record;
  v_vehicle record;
  v_company_name text;
  v_mode text;
  v_no text;
  v_summary text;
  v_details jsonb;
  v_at timestamptz := now();
  v_to text[] := '{}';
  v_sent integer := 0;
  tr record;
begin
  select * into m from public.travel_movements where id = p_id and deleted_at is null;
  if m.id is null or m.company_id is distinct from public.my_company_id() then
    raise exception 'Travel record not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not public.has_permission('expenses.travel', 'edit') and not public.has_permission('expenses.travel', 'create') then
    raise exception 'You do not have permission to send travel details' using errcode = '42501', hint = 'permission_denied';
  end if;
  if not exists (select 1 from public.travel_travellers where movement_id = p_id and deleted_at is null and (email is not null or phone is not null))
     and m.traveller_email is null and m.traveller_phone is null then
    raise exception 'Add an email or phone number to a traveller first' using errcode = '23514', hint = 'no_contact';
  end if;

  select full_name, phone into v_driver from public.drivers where id = m.driver_id;
  select make, model, registration into v_vehicle from public.vehicles where id = m.vehicle_id;
  select name into v_company_name from public.companies where id = m.company_id;
  v_mode := case m.transport_mode when 'air' then 'Flight' when 'marine' then 'Vessel' when 'railway' then 'Train' when 'bus' then 'Bus' else 'Trip' end;
  v_no := nullif(trim(coalesce(m.flight, '')), '');

  if m.direction = 'departure' then
    v_summary := 'Pickup on ' || to_char(m.travel_date, 'DD Mon YYYY')
      || coalesce(' at ' || to_char(m.pickup_time, 'HH24:MI'), '')
      || coalesce(' from ' || nullif(trim(coalesce(m.pickup_from, '')), ''), '')
      || coalesce(' to ' || m.terminal, '')
      || coalesce(' (' || lower(v_mode) || ', reservation ' || v_no || ')', '')
      || coalesce(', departs ' || to_char(m.flight_time, 'HH24:MI'), '') || '.';
  else
    v_summary := 'Pickup on arrival at ' || coalesce(m.terminal, 'the terminal') || ' on ' || to_char(m.travel_date, 'DD Mon YYYY')
      || coalesce(' (' || lower(v_mode) || ', reservation ' || v_no || ')', '')
      || coalesce(', arrives ' || to_char(m.flight_time, 'HH24:MI'), '')
      || coalesce(', to ' || nullif(trim(coalesce(m.transport_to, '')), ''), '') || '.';
  end if;
  if v_driver.full_name is not null then
    v_summary := v_summary || ' Driver: ' || v_driver.full_name || coalesce(', ' || nullif(v_driver.phone, ''), '')
      || coalesce('. Vehicle: ' || nullif(trim(coalesce(v_vehicle.make, '') || ' ' || coalesce(v_vehicle.model, '')), '') || coalesce(' ' || v_vehicle.registration, ''), '') || '.';
  end if;
  if m.direction = 'arrival' and nullif(trim(coalesce(m.host, '')), '') is not null then
    v_summary := v_summary || ' Host: ' || trim(m.host) || '.';
  end if;

  v_details := jsonb_build_array(
    jsonb_build_object('label', 'Date', 'value', to_char(m.travel_date, 'DD Mon YYYY')),
    jsonb_build_object('label', 'Travellers', 'value', coalesce(m.travellers, '')),
    jsonb_build_object('label', 'Mode of transport', 'value', case m.transport_mode when 'air' then 'Air' when 'marine' then 'Marine' when 'railway' then 'Railway (SGR)' when 'bus' then 'Bus' else '' end),
    jsonb_build_object('label', 'Terminal', 'value', coalesce(m.terminal, '')),
    jsonb_build_object('label', 'Reservation No.', 'value', coalesce(v_no, '')),
    jsonb_build_object('label', case when m.direction = 'departure' then 'Departure time' else 'Arrival time' end, 'value', coalesce(to_char(m.flight_time, 'HH24:MI'), '')),
    jsonb_build_object('label', 'Pickup from', 'value', coalesce(m.pickup_from, '')),
    jsonb_build_object('label', 'Pickup time', 'value', coalesce(to_char(m.pickup_time, 'HH24:MI'), '')),
    jsonb_build_object('label', 'Going to', 'value', coalesce(m.transport_to, '')),
    jsonb_build_object('label', 'Host', 'value', coalesce(m.host, '')),
    jsonb_build_object('label', 'Driver', 'value', concat_ws(', ', v_driver.full_name, nullif(v_driver.phone, ''))),
    jsonb_build_object('label', 'Vehicle', 'value', trim(concat_ws(' ', v_vehicle.make, v_vehicle.model, v_vehicle.registration))));

  for tr in
    select l.name, l.email, l.phone from public.travel_travellers l
    where l.movement_id = p_id and l.deleted_at is null and (l.email is not null or l.phone is not null) order by l.line_no
  loop
    perform public.workflow_enqueue(m.company_id, null, tr.email, tr.phone, 'travel_notice', jsonb_build_object(
      'record_table', 'travel_movements',
      'record_id', m.id,
      'name', coalesce(nullif(split_part(trim(tr.name), ' ', 1), ''), 'there'),
      'company', coalesce(v_company_name, ''),
      'trip', case when m.direction = 'departure' then 'departure' else 'arrival' end,
      'summary', v_summary,
      'details', v_details));
    v_to := v_to || concat_ws(', ', tr.email, tr.phone);
    v_sent := v_sent + 1;
  end loop;
  -- Records from before travellers had their own lines.
  if v_sent = 0 then
    perform public.workflow_enqueue(m.company_id, null, m.traveller_email, m.traveller_phone, 'travel_notice', jsonb_build_object(
      'record_table', 'travel_movements',
      'record_id', m.id,
      'name', coalesce(nullif(split_part(trim(split_part(coalesce(m.travellers, ''), E'\n', 1)), ' ', 1), ''), 'there'),
      'company', coalesce(v_company_name, ''),
      'trip', case when m.direction = 'departure' then 'departure' else 'arrival' end,
      'summary', v_summary,
      'details', v_details));
    v_to := array[concat_ws(', ', m.traveller_email, m.traveller_phone)];
  end if;
  update public.travel_movements set notified_at = v_at, notified_to = array_to_string(v_to, '; ') where id = p_id;
  return v_at;
end;
$$;
revoke all on function public.travel_notify(uuid) from public, anon;
grant execute on function public.travel_notify(uuid) to authenticated;
