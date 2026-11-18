-- 33: Fleet roster as a rotating block roster (the company's Excel "12-driver 28-day rotating block
-- roster"): shifts Day / Noon / Night, each person works blocks of 7 days in the order
-- Day -> Noon -> Night -> OFF and starts the cycle at their own week. The app works out every day
-- from the cycle; a change for one day (leave, sick, swap) is stored as an exception.

create table public.roster_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id),
  cycle_start date not null default (date_trunc('week', current_date))::date,   -- a Monday: day 1 of week 1
  block_days integer not null default 7 check (block_days between 1 and 14),
  day_from time not null default '06:00', day_to time not null default '14:00',
  noon_from time not null default '14:00', noon_to time not null default '22:00',
  night_from time not null default '22:00', night_to time not null default '06:00'
);

create table public.roster_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  team text not null default 'Team 1',
  driver_id uuid references public.drivers(id),
  person_name text not null,
  employment_id text,
  role text not null default 'driver' check (role in ('driver', 'coordinator')),
  -- What this person works in week 1 of the cycle: 0 Day, 1 Noon, 2 Night, 3 OFF.
  start_phase integer not null default 0 check (start_phase between 0 and 3),
  sort_order integer not null default 0,
  active boolean not null default true
);

-- Day exceptions on the existing roster records.
alter table public.fleet_rosters add column if not exists member_id uuid references public.roster_members(id) on delete cascade;
alter table public.fleet_rosters drop constraint if exists fleet_rosters_shift_check;
alter table public.fleet_rosters add constraint fleet_rosters_shift_check check (shift in ('day', 'noon', 'night', 'off', 'standby', 'leave', 'sick'));
create index if not exists fleet_rosters_member_idx on public.fleet_rosters (member_id, roster_date) where deleted_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['roster_settings', 'roster_members'] loop
    execute format('alter table public.%I
      add column created_at timestamptz not null default now(),
      add column created_by uuid,
      add column updated_at timestamptz not null default now(),
      add column updated_by uuid,
      add column deleted_at timestamptz', t);
    execute format('create index %I on public.%I (company_id) where deleted_at is null', t || '_company_idx', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
    execute format('grant all on public.%I to authenticated, service_role', t);
  end loop;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('roster_settings', 'expenses.admin.roster', null, null, false),
  ('roster_members', 'expenses.admin.roster', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key;
select public.apply_standard_rls('roster_settings', 'expenses.admin.roster');
select public.apply_standard_rls('roster_members', 'expenses.admin.roster');

-- Driver details follow the driver record when one is chosen.
create or replace function public.roster_members_driver()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.drivers;
begin
  if new.driver_id is not null then
    select * into d from public.drivers where id = new.driver_id;
    new.person_name := coalesce(nullif(trim(new.person_name), ''), d.full_name);
    new.employment_id := coalesce(nullif(trim(new.employment_id), ''), d.employment_number);
  end if;
  return new;
end;
$$;
create trigger roster_members_driver before insert or update on public.roster_members
  for each row execute function public.roster_members_driver();
