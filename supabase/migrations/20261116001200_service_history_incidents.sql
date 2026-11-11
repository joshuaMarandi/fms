-- FMS
-- Migration 12: service history, employee details filled from the user, and incidents with
-- vehicles and drivers that are not in the fleet.

-- ---------------------------------------------------------------------------
-- Service history: every service done is a new service_schedules row. The newest row per vehicle
-- is the current schedule; older rows are the history and their reminders are closed.
-- ---------------------------------------------------------------------------
alter table public.service_schedules add column if not exists garage text;

create or replace function public.service_schedules_defaults()
returns trigger language plpgsql as $$
begin
  if new.next_service_km is null and new.last_service_km is not null and new.interval_km is not null then
    new.next_service_km := new.last_service_km + new.interval_km;
  end if;
  return new;
end;
$$;
drop trigger if exists service_schedules_defaults on public.service_schedules;
create trigger service_schedules_defaults before insert or update on public.service_schedules
  for each row execute function public.service_schedules_defaults();

create or replace function public.service_schedules_supersede()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.reminders r set status = 'done'
  where r.source_table = 'service_schedules' and r.reminder_type = 'next_service' and r.status <> 'done'
    and r.source_id in (
      select s.id from public.service_schedules s
      where s.vehicle_id = new.vehicle_id and s.id <> new.id and s.deleted_at is null and s.created_at <= new.created_at);
  return null;
end;
$$;
drop trigger if exists service_schedules_supersede on public.service_schedules;
create trigger service_schedules_supersede after insert on public.service_schedules
  for each row execute function public.service_schedules_supersede();

-- ---------------------------------------------------------------------------
-- Timesheets and leave plans: name, number, job and department come from the chosen user.
-- ---------------------------------------------------------------------------
create or replace function public.fill_employee_details()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  d public.drivers;
  j jsonb;
begin
  if new.employee_id is null then
    new.employee_id := auth.uid();
  end if;
  if tg_op = 'UPDATE' and new.employee_id is not distinct from old.employee_id and new.employee_name is not null then
    return new;
  end if;
  select * into p from public.profiles where id = new.employee_id;
  if p.id is null then
    return new;
  end if;
  if p.driver_id is not null then
    select * into d from public.drivers where id = p.driver_id;
  end if;
  j := jsonb_build_object(
    'employee_name', coalesce(nullif(p.full_name, ''), d.full_name),
    'employment_number', coalesce(p.employment_number, d.employment_number),
    'employer', coalesce(p.employer, d.employer, (select name from public.companies where id = p.company_id)),
    'job_title', coalesce(p.job_title, d.job_title),
    'position', coalesce(p.job_title, d.job_title),
    'department', coalesce(p.department, d.department),
    'driver_id', coalesce(new.driver_id, p.driver_id));
  -- Only set columns this table has.
  new := jsonb_populate_record(new, (select jsonb_object_agg(k, v) from jsonb_each(j) e(k, v) where to_jsonb(new) ? k));
  return new;
end;
$$;
drop trigger if exists timesheets_employee_details on public.timesheets;
create trigger timesheets_employee_details before insert or update on public.timesheets
  for each row execute function public.fill_employee_details();
drop trigger if exists leave_plans_employee_details on public.leave_plans;
create trigger leave_plans_employee_details before insert or update on public.leave_plans
  for each row execute function public.fill_employee_details();

-- ---------------------------------------------------------------------------
-- Incidents: vehicles and drivers that are not in the fleet (other road users).
-- ---------------------------------------------------------------------------
alter table public.incident_vehicles
  add column if not exists vehicle_source text not null default 'fleet' check (vehicle_source in ('fleet', 'other')),
  add column if not exists driver_name text,
  add column if not exists driver_contact text,
  add column if not exists driver_licence_number text;

alter table public.incidents
  add column if not exists driver_source text not null default 'fleet' check (driver_source in ('fleet', 'other'));

-- The fleet snapshot only applies to fleet vehicles and fleet drivers.
create or replace function public.incident_vehicles_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.vehicles; ins public.vehicle_insurance;
begin
  if new.vehicle_source = 'other' then
    new.vehicle_id := null;
    return new;
  end if;
  if new.vehicle_id is not null then
    select * into v from public.vehicles where id = new.vehicle_id;
    select * into ins from public.vehicle_insurance where vehicle_id = new.vehicle_id and deleted_at is null order by end_date desc nulls last limit 1;
    new.make := coalesce(new.make, v.make);
    new.model := coalesce(new.model, v.model);
    new.registration := coalesce(new.registration, v.registration);
    new.yom := coalesce(new.yom, v.yom);
    new.owner_name := coalesce(new.owner_name, v.owner_name);
    new.insurance_policy_number := coalesce(new.insurance_policy_number, ins.policy_number);
  end if;
  return new;
end;
$$;

create or replace function public.incidents_driver_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.drivers; l public.driver_licences;
begin
  if new.driver_source = 'other' then
    new.driver_id := null;
    return new;
  end if;
  -- Fleet driver: details always come from the driver record (the form hides and clears them).
  if new.driver_id is not null then
    select * into d from public.drivers where id = new.driver_id;
    select * into l from public.driver_licences where driver_id = new.driver_id and deleted_at is null order by expiry_date desc nulls last limit 1;
    new.driver_name := coalesce(new.driver_name, d.full_name);
    new.driver_company := coalesce(new.driver_company, d.employer, (select name from public.companies where id = d.company_id));
    new.driver_contact := coalesce(new.driver_contact, d.phone);
    new.driver_sex := coalesce(new.driver_sex, d.sex);
    new.driver_age := coalesce(new.driver_age, case when d.date_of_birth is not null then extract(year from age(d.date_of_birth))::int end);
    new.driver_years_driving := coalesce(new.driver_years_driving, d.years_driving);
    new.driver_licence_class := coalesce(new.driver_licence_class, l.licence_class);
    new.driver_licence_number := coalesce(new.driver_licence_number, l.licence_number);
  end if;
  return new;
end;
$$;
