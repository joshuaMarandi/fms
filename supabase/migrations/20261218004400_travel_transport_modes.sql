-- Travel coordination:
-- (1) Pickup settings are removed: the pickup rules are fixed (departures are picked up 3 hours
--     before for air, marine and railway, 3.5 hours for JKNIA, 2.5 hours for bus).
-- (2) A movement says how the travellers go (air, marine, railway (SGR) or bus) and the terminal:
--     chosen from a list, or typed for a bus. A departure goes to its terminal (no host); an arrival
--     is picked up at its terminal (no pickup time) and has a host. Vehicle and driver stay optional.
-- (3) The traveller's email and phone: the details (pickup, driver, vehicle) are sent to them.

-- ---------------------------------------------------------------------------
-- (1) No more pickup settings
-- ---------------------------------------------------------------------------
drop trigger if exists companies_default_airports on public.companies;
drop function if exists public.companies_default_airports();
delete from public.table_resources where table_name = 'travel_airports';
drop table if exists public.travel_airports;
delete from public.resources where key = 'expenses.travel.settings';

-- ---------------------------------------------------------------------------
-- (2) Transport and terminal
-- ---------------------------------------------------------------------------
alter table public.travel_movements
  add column if not exists transport_mode text,
  add column if not exists terminal text,
  add column if not exists bus_terminal text,
  add column if not exists traveller_email text,
  add column if not exists traveller_phone text,
  add column if not exists notified_at timestamptz,
  add column if not exists notified_to text;
alter table public.travel_movements drop constraint if exists travel_movements_transport_mode_check;
alter table public.travel_movements add constraint travel_movements_transport_mode_check
  check (transport_mode is null or transport_mode in ('air', 'marine', 'railway', 'bus'));

-- Movements so far were flights.
update public.travel_movements set transport_mode = 'air', terminal = coalesce(terminal, airport)
where transport_mode is null and coalesce(trim(airport), '') <> '';

-- The terminal decides where a departure goes and where an arrival is picked up.
create or replace function public.travel_movements_terminal()
returns trigger language plpgsql as $$
begin
  if new.transport_mode = 'bus' then
    new.bus_terminal := nullif(trim(coalesce(new.bus_terminal, '')), '');
    -- "Magufuli" is "Magufuli Bus Terminal".
    new.terminal := case
      when new.bus_terminal is null then null
      when new.bus_terminal ~* 'terminal|stand|station' then new.bus_terminal
      else new.bus_terminal || ' Bus Terminal' end;
  else
    new.bus_terminal := null;
  end if;
  new.airport := case when new.transport_mode = 'air' then new.terminal else null end;
  if new.terminal is not null then
    if new.direction = 'departure' then
      new.transport_to := new.terminal;
    else
      new.pickup_from := new.terminal;
    end if;
  end if;
  if new.direction = 'departure' then
    new.host := null;
  else
    new.pickup_time := null;
  end if;
  new.traveller_email := nullif(lower(trim(coalesce(new.traveller_email, ''))), '');
  new.traveller_phone := nullif(trim(coalesce(new.traveller_phone, '')), '');
  return new;
end;
$$;
drop trigger if exists travel_movements_terminal on public.travel_movements;
create trigger travel_movements_terminal before insert or update on public.travel_movements
  for each row execute function public.travel_movements_terminal();

-- ---------------------------------------------------------------------------
-- (3) Send the details to the traveller
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
begin
  select * into m from public.travel_movements where id = p_id and deleted_at is null;
  if m.id is null or m.company_id is distinct from public.my_company_id() then
    raise exception 'Travel record not found' using errcode = 'P0002', hint = 'not_found';
  end if;
  if not public.has_permission('expenses.travel', 'edit') and not public.has_permission('expenses.travel', 'create') then
    raise exception 'You do not have permission to send travel details' using errcode = '42501', hint = 'permission_denied';
  end if;
  if m.traveller_email is null and m.traveller_phone is null then
    raise exception 'Add the traveller''s email or phone number first' using errcode = '23514', hint = 'no_contact';
  end if;
  if m.traveller_email is not null and m.traveller_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The traveller''s email address is not valid' using errcode = '23514', hint = 'email_invalid';
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
      || coalesce(' for ' || lower(v_mode) || ' ' || v_no, '')
      || coalesce(' (departs ' || to_char(m.flight_time, 'HH24:MI') || ')', '') || '.';
  else
    v_summary := 'Pickup on arrival at ' || coalesce(m.terminal, 'the terminal') || ' on ' || to_char(m.travel_date, 'DD Mon YYYY')
      || coalesce(', ' || lower(v_mode) || ' ' || v_no, '')
      || coalesce(' (arrives ' || to_char(m.flight_time, 'HH24:MI') || ')', '')
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
    jsonb_build_object('label', 'Transport', 'value', case m.transport_mode when 'air' then 'Air' when 'marine' then 'Marine' when 'railway' then 'Railway (SGR)' when 'bus' then 'Bus' else '' end),
    jsonb_build_object('label', 'Terminal', 'value', coalesce(m.terminal, '')),
    jsonb_build_object('label', v_mode || ' No', 'value', coalesce(v_no, '')),
    jsonb_build_object('label', case when m.direction = 'departure' then 'Departure time' else 'Arrival time' end, 'value', coalesce(to_char(m.flight_time, 'HH24:MI'), '')),
    jsonb_build_object('label', 'Pickup from', 'value', coalesce(m.pickup_from, '')),
    jsonb_build_object('label', 'Pickup time', 'value', coalesce(to_char(m.pickup_time, 'HH24:MI'), '')),
    jsonb_build_object('label', 'Going to', 'value', coalesce(m.transport_to, '')),
    jsonb_build_object('label', 'Host', 'value', coalesce(m.host, '')),
    jsonb_build_object('label', 'Driver', 'value', concat_ws(', ', v_driver.full_name, nullif(v_driver.phone, ''))),
    jsonb_build_object('label', 'Vehicle', 'value', trim(concat_ws(' ', v_vehicle.make, v_vehicle.model, v_vehicle.registration))));

  perform public.workflow_enqueue(m.company_id, null, m.traveller_email, m.traveller_phone, 'travel_notice', jsonb_build_object(
    'record_table', 'travel_movements',
    'record_id', m.id,
    'name', coalesce(nullif(split_part(trim(split_part(coalesce(m.travellers, ''), E'\n', 1)), ' ', 1), ''), 'there'),
    'company', coalesce(v_company_name, ''),
    'trip', case when m.direction = 'departure' then 'departure' else 'arrival' end,
    'summary', v_summary,
    'details', v_details));
  update public.travel_movements set notified_at = v_at, notified_to = concat_ws(', ', m.traveller_email, m.traveller_phone) where id = p_id;
  return v_at;
end;
$$;
revoke all on function public.travel_notify(uuid) from public, anon;
grant execute on function public.travel_notify(uuid) to authenticated;
