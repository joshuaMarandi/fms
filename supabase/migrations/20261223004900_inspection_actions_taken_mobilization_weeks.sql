-- Inspections:
-- (1) An anomaly says what was done when it is closed (action_taken): ticked from the usual actions
--     or typed. Lists show Action required (open, red) and Action taken (closed, green).
-- (2) Mobilization inspections record a remark and anomalies like the daily, weekly and
--     third-party inspections.
-- (3) Weekly inspections: how many each week of a month holds (weeks 1-7, 8-14, 15-21, 22-end).

-- (1)
alter table public.inspection_anomalies add column if not exists action_taken text;

-- (2)
alter table public.inspection_anomalies add column if not exists vehicle_inspection_id uuid references public.vehicle_inspections(id) on delete cascade;
create index if not exists inspection_anomalies_vehicle_inspection on public.inspection_anomalies (vehicle_inspection_id) where vehicle_inspection_id is not null;

-- One inspection per anomaly: daily (or weekly), third-party or mobilization.
do $$
declare
  c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.inspection_anomalies'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%daily_inspection_id IS NOT NULL%' loop
    execute format('alter table public.inspection_anomalies drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.inspection_anomalies add constraint inspection_anomalies_one_inspection check (
  (daily_inspection_id is not null)::int + (third_party_inspection_id is not null)::int + (vehicle_inspection_id is not null)::int = 1);

alter table public.vehicle_inspections add column if not exists remark text;
alter table public.vehicle_inspections drop constraint if exists vehicle_inspections_remark_check;
alter table public.vehicle_inspections add constraint vehicle_inspections_remark_check check (remark is null or remark in ('safe', 'anomalies'));

create or replace function public.inspection_anomalies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg text;
begin
  if new.daily_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.daily_inspections where id = new.daily_inspection_id;
  elsif new.third_party_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.third_party_inspections where id = new.third_party_inspection_id;
  elsif new.vehicle_inspection_id is not null then
    select vehicle_id into new.vehicle_id from public.vehicle_inspections where id = new.vehicle_inspection_id;
    new.driver_id := null;
  end if;

  new.action_taken := nullif(trim(coalesce(new.action_taken, '')), '');
  if new.status = 'closed' then
    if tg_op = 'UPDATE' and old.status = 'open' and not public.has_permission('inspections', 'approve') then
      raise exception 'Only a fleet manager (approve on Inspections) can close an anomaly' using errcode = '42501', hint = 'permission_denied';
    end if;
    new.date_closed := coalesce(new.date_closed, current_date);
    if new.date_closed < new.date_opened then
      raise exception 'The closing date cannot be before the date opened' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' or old.status = 'open' then
      new.closed_by := coalesce(new.closed_by, auth.uid());
    end if;
  else
    new.date_closed := null;
    new.closed_by := null;
    new.action_taken := null;
  end if;

  if tg_op = 'INSERT' and new.when_to_act = 'immediately' and new.status = 'open' then
    select registration into v_reg from public.vehicles where id = new.vehicle_id;
    perform public.notify_approvers(new.company_id, 'inspections',
      format('Vehicle %s is not safe for use', coalesce(v_reg, '')),
      left(new.description, 200), '/inspections/anomalies');
  end if;
  return new;
end;
$$;

create or replace function public.inspection_anomalies_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.daily_inspection_id is not null then
    update public.daily_inspections set remark = 'anomalies' where id = new.daily_inspection_id and remark <> 'anomalies';
  elsif new.third_party_inspection_id is not null then
    update public.third_party_inspections set remark = 'anomalies' where id = new.third_party_inspection_id and remark <> 'anomalies';
  elsif new.vehicle_inspection_id is not null then
    update public.vehicle_inspections set remark = 'anomalies' where id = new.vehicle_inspection_id and remark is distinct from 'anomalies';
  end if;
  return null;
end;
$$;

-- (3)
create or replace function public.vehicle_week_counts(p_vehicle uuid, p_year int)
returns table (month int, week int, records bigint)
language sql stable security invoker set search_path = public as $$
  select extract(month from d.inspection_date)::int,
         least(4, (extract(day from d.inspection_date)::int - 1) / 7 + 1),
         count(*)
  from public.daily_inspections d
  where d.vehicle_id = p_vehicle and d.deleted_at is null and d.frequency = 'weekly'
    and extract(year from d.inspection_date) = p_year
  group by 1, 2;
$$;
grant execute on function public.vehicle_week_counts(uuid, int) to authenticated;
