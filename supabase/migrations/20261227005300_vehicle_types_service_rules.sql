-- Vehicle types and service intervals by company documentation:
-- (1) Each vehicle has a type (saloon, SUV, pickup, ... motorcycle, tricycle).
-- (2) Service interval rules, per company: a rule names a vehicle type, a make, a model and/or an
--     engine type (each may be left empty for "any") and the interval in km and in months (whichever
--     comes first). For a vehicle, the most specific matching rule applies: model, then make, then
--     type, then engine type. Make and model match whatever their case or spaces.
-- (3) A service recorded follows the rule unless it is marked as the vehicle's own interval; the next
--     service is due at the km or the date, whichever first (both are reminders).

-- (1)
alter table public.vehicles add column if not exists vehicle_type text;
alter table public.vehicles drop constraint if exists vehicles_vehicle_type_check;
alter table public.vehicles add constraint vehicles_vehicle_type_check check (vehicle_type is null or vehicle_type in
  ('saloon', 'suv', 'pickup', 'van', 'minibus', 'bus', 'light_truck', 'heavy_truck', 'motorcycle', 'tricycle', 'other'));
-- Make and model without stray spaces (so rules match them).
update public.vehicles set make = trim(make), model = trim(model) where make <> trim(make) or model <> trim(model);
create or replace function public.vehicles_trim_make_model()
returns trigger language plpgsql as $$
begin
  new.make := trim(new.make);
  new.model := trim(new.model);
  return new;
end;
$$;
drop trigger if exists vehicles_trim_make_model on public.vehicles;
create trigger vehicles_trim_make_model before insert or update of make, model on public.vehicles
  for each row execute function public.vehicles_trim_make_model();

-- (2)
create table if not exists public.service_interval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  vehicle_type text check (vehicle_type is null or vehicle_type in
    ('saloon', 'suv', 'pickup', 'van', 'minibus', 'bus', 'light_truck', 'heavy_truck', 'motorcycle', 'tricycle', 'other')),
  make text,
  model text,
  engine_type text check (engine_type is null or engine_type in ('diesel', 'petrol', 'electric', 'gas')),
  interval_km numeric(10,1) check (interval_km is null or interval_km > 0),
  interval_months integer check (interval_months is null or interval_months between 1 and 60),
  notes text,
  check (interval_km is not null or interval_months is not null)
);
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'service_interval_rules' and column_name = 'created_at') then
    alter table public.service_interval_rules
      add column created_at timestamptz not null default now(),
      add column created_by uuid,
      add column updated_at timestamptz not null default now(),
      add column updated_by uuid,
      add column deleted_at timestamptz;
    create index service_interval_rules_company on public.service_interval_rules (company_id) where deleted_at is null;
    create trigger service_interval_rules_audit before insert or update on public.service_interval_rules for each row execute function public.set_audit_fields();
    grant all on public.service_interval_rules to authenticated, service_role;
  end if;
end $$;
insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('service_interval_rules', 'fleet.maintenance_schedule', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;
select public.apply_standard_rls('service_interval_rules', 'fleet.maintenance_schedule');

-- Empty make or model is "any"; stored trimmed.
create or replace function public.service_interval_rules_clean()
returns trigger language plpgsql as $$
begin
  new.make := nullif(trim(coalesce(new.make, '')), '');
  new.model := nullif(trim(coalesce(new.model, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  return new;
end;
$$;
drop trigger if exists service_interval_rules_clean on public.service_interval_rules;
create trigger service_interval_rules_clean before insert or update on public.service_interval_rules
  for each row execute function public.service_interval_rules_clean();

-- The rule for a vehicle: the most specific one that matches.
create or replace function public.service_rule_for(p_vehicle uuid)
returns table (rule_id uuid, interval_km numeric, interval_months integer, label text)
language sql stable security definer set search_path = public as $$
  select r.id, r.interval_km, r.interval_months,
         concat_ws(' · ', nullif(concat_ws(' ', r.make, r.model), ''),
           case r.vehicle_type when 'saloon' then 'Saloon car' when 'suv' then 'SUV / 4x4' when 'pickup' then 'Pickup' when 'van' then 'Van'
             when 'minibus' then 'Minibus' when 'bus' then 'Bus' when 'light_truck' then 'Light truck' when 'heavy_truck' then 'Heavy truck'
             when 'motorcycle' then 'Motorcycle' when 'tricycle' then 'Tricycle' when 'other' then 'Other' end,
           initcap(r.engine_type))
  from public.vehicles v
  join public.service_interval_rules r on r.company_id = v.company_id and r.deleted_at is null
  where v.id = p_vehicle
    and (r.vehicle_type is null or r.vehicle_type = v.vehicle_type)
    and (r.make is null or lower(r.make) = lower(trim(v.make)))
    and (r.model is null or lower(r.model) = lower(trim(v.model)))
    and (r.engine_type is null or r.engine_type = v.engine_type)
  order by (r.model is not null)::int * 8 + (r.make is not null)::int * 4 + (r.vehicle_type is not null)::int * 2 + (r.engine_type is not null)::int desc,
           r.updated_at desc
  limit 1;
$$;
grant execute on function public.service_rule_for(uuid) to authenticated;

-- (3)
alter table public.service_schedules
  add column if not exists interval_months integer check (interval_months is null or interval_months between 1 and 60),
  add column if not exists interval_custom boolean not null default false,
  add column if not exists rule_id uuid references public.service_interval_rules(id) on delete set null,
  add column if not exists next_service_date date;

-- Runs before service_schedules_defaults (named to sort first): the interval from the rule, then
-- the next service km and date.
create or replace function public.service_schedules_a_interval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not new.interval_custom then
    select * into r from public.service_rule_for(new.vehicle_id);
    if r.rule_id is not null then
      new.rule_id := r.rule_id;
      new.interval_km := r.interval_km;
      new.interval_months := r.interval_months;
    else
      new.rule_id := null;
    end if;
  else
    new.rule_id := null;
  end if;
  if tg_op = 'INSERT' or new.interval_km is distinct from old.interval_km or new.last_service_km is distinct from old.last_service_km then
    new.next_service_km := case when new.last_service_km is not null and new.interval_km is not null then new.last_service_km + new.interval_km end;
  end if;
  new.next_service_date := case when new.last_service_date is not null and new.interval_months is not null
    then (new.last_service_date + make_interval(months => new.interval_months))::date end;
  return new;
end;
$$;
drop trigger if exists service_schedules_a_interval on public.service_schedules;
create trigger service_schedules_a_interval before insert or update on public.service_schedules
  for each row execute function public.service_schedules_a_interval();

-- The service date is a reminder too (the km one already is).
drop trigger if exists service_schedules_date_reminder on public.service_schedules;
create trigger service_schedules_date_reminder after insert or update or delete on public.service_schedules
  for each row execute function public.sync_reminder('next_service_date', 'next_service_date', 'fleet.maintenance_schedule', 'Service due (date)');

-- A newer service closes the reminders of the earlier ones (km and date).
create or replace function public.service_schedules_supersede()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.reminders r set status = 'done'
  where r.source_table = 'service_schedules' and r.reminder_type in ('next_service', 'next_service_date') and r.status <> 'done'
    and r.source_id in (
      select s.id from public.service_schedules s
      where s.vehicle_id = new.vehicle_id and s.id <> new.id and s.deleted_at is null and s.created_at <= new.created_at);
  return null;
end;
$$;

-- When rules (or a vehicle's type, make, model or engine) change, each vehicle's current schedule
-- (its newest service, unless it has its own interval) follows the rule again.
create or replace function public.service_schedules_follow_rules(p_company uuid, p_vehicle uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  with latest as (
    select distinct on (s.vehicle_id) s.id
    from public.service_schedules s
    where s.company_id = p_company and s.deleted_at is null and (p_vehicle is null or s.vehicle_id = p_vehicle)
    order by s.vehicle_id, s.created_at desc
  )
  update public.service_schedules s set updated_at = now()
  from latest where s.id = latest.id and not s.interval_custom;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.service_schedules_follow_rules(uuid, uuid) from public, anon, authenticated;


create or replace function public.service_interval_rules_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.service_schedules_follow_rules(coalesce(new.company_id, old.company_id));
  return null;
end;
$$;


drop trigger if exists service_interval_rules_after on public.service_interval_rules;
create trigger service_interval_rules_after after insert or update or delete on public.service_interval_rules
  for each row execute function public.service_interval_rules_after();


create or replace function public.vehicles_follow_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_type is distinct from old.vehicle_type or lower(trim(new.make)) is distinct from lower(trim(old.make))
     or lower(trim(new.model)) is distinct from lower(trim(old.model)) or new.engine_type is distinct from old.engine_type then
    perform public.service_schedules_follow_rules(new.company_id, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists vehicles_follow_rules on public.vehicles;
create trigger vehicles_follow_rules after update on public.vehicles
  for each row execute function public.vehicles_follow_rules();
