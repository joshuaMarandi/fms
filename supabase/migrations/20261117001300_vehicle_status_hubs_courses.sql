-- FMS
-- Migration 13: vehicle status is In service or Out of service with a reason, registration
-- numbers without spaces, per-vehicle activity for the inspection and daily use hubs, readings
-- carried from the last record, and one professional course per row with its own institution.

-- ---------------------------------------------------------------------------
-- Vehicle status: In service or Out of service (with the reason). Garage is a reason, not a status.
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists status_reason text,
  add column if not exists status_work_order_id uuid references public.work_orders(id) on delete set null deferrable initially deferred;

update public.vehicles v set
  status = 'out_of_service',
  status_reason = coalesce(v.status_reason, 'In garage'),
  status_work_order_id = (select w.id from public.work_orders w
                          where w.vehicle_id = v.id and w.deleted_at is null and w.date_out is not null and w.date_in is null
                          order by w.date_out desc limit 1)
where v.status = 'in_garage';

alter table public.vehicles drop constraint if exists vehicles_status_check;
alter table public.vehicles add constraint vehicles_status_check check (status in ('in_service', 'out_of_service'));

-- Back in service clears the reason.
create or replace function public.vehicles_status_reason()
returns trigger language plpgsql as $$
begin
  if new.status = 'in_service' then
    new.status_reason := null;
    new.status_work_order_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists vehicles_status_reason on public.vehicles;
create trigger vehicles_status_reason before insert or update of status on public.vehicles
  for each row execute function public.vehicles_status_reason();

-- A works order out takes the vehicle out of service with the garage as the reason; it comes back
-- into service when the last open order for it returns (only if the order took it out).
create or replace function public.work_orders_vehicle_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date_out is not null and new.date_in is null and new.deleted_at is null then
    update public.vehicles
      set status = 'out_of_service',
          status_reason = 'In garage' || coalesce(': ' || nullif(new.garage_name, ''), '') || coalesce(' (works order ' || nullif(new.order_number, '') || ')', ''),
          status_work_order_id = new.id
    where id = new.vehicle_id and status = 'in_service';
    new.status := case when new.status = 'closed' then 'in_progress' else new.status end;
  elsif new.date_in is not null then
    new.status := 'closed';
    if not exists (select 1 from public.work_orders w where w.vehicle_id = new.vehicle_id and w.id <> new.id and w.deleted_at is null and w.date_out is not null and w.date_in is null) then
      update public.vehicles set status = 'in_service'
      where id = new.vehicle_id and status = 'out_of_service' and status_work_order_id is not null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registration numbers are stored without spaces.
-- ---------------------------------------------------------------------------
create or replace function public.vehicles_registration_clean()
returns trigger language plpgsql as $$
begin
  new.registration := regexp_replace(new.registration, '\s+', '', 'g');
  return new;
end;
$$;
drop trigger if exists vehicles_registration_clean on public.vehicles;
create trigger vehicles_registration_clean before insert or update of registration on public.vehicles
  for each row execute function public.vehicles_registration_clean();

update public.vehicles v set registration = regexp_replace(v.registration, '\s+', '', 'g')
where v.registration ~ '\s'
  and not exists (select 1 from public.vehicles o
                  where o.company_id = v.company_id and o.id <> v.id and o.deleted_at is null
                    and regexp_replace(o.registration, '\s+', '', 'g') = regexp_replace(v.registration, '\s+', '', 'g'));

-- ---------------------------------------------------------------------------
-- Per-vehicle activity for the hubs (RLS of every source table applies).
-- ---------------------------------------------------------------------------
create or replace view public.v_vehicle_activity with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  di.inspection_date as last_inspection_date,
  di.remark as last_inspection_remark,
  (select count(*) from public.daily_inspections d
    where d.vehicle_id = v.id and d.deleted_at is null and d.inspection_date >= date_trunc('month', current_date)::date) as inspections_this_month,
  (select count(*) from public.inspection_anomalies a where a.vehicle_id = v.id and a.deleted_at is null and a.status = 'open') as open_actions,
  (select max(t.renewal_date) from public.third_party_inspections t where t.vehicle_id = v.id and t.deleted_at is null) as third_party_next,
  (select max(f.next_inspection_date) from public.first_aid_inspections f where f.vehicle_id = v.id and f.deleted_at is null) as first_aid_next,
  (select max(l.log_date) from public.km_logs l where l.vehicle_id = v.id and l.deleted_at is null) as last_km_log_date,
  (select count(*) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as km_logs_this_month,
  (select coalesce(sum(l.total_km), 0) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as km_this_month,
  (select coalesce(sum(l.trip_count), 0) from public.km_logs l
    where l.vehicle_id = v.id and l.deleted_at is null and l.log_date >= date_trunc('month', current_date)::date) as trips_this_month,
  (select t.km_end from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
    where l.vehicle_id = v.id and l.deleted_at is null and t.deleted_at is null and t.km_end is not null
    order by l.log_date desc, t.km_end desc limit 1) as last_km_end,
  fr.request_date as last_fuel_date,
  fr.current_odometer as last_fuel_odometer,
  (select count(*) from public.fuel_requests r
    where r.vehicle_id = v.id and r.deleted_at is null and r.request_date >= date_trunc('month', current_date)::date) as fuel_requests_this_month,
  (select count(*) from public.fuel_requests r where r.vehicle_id = v.id and r.deleted_at is null and r.status = 'submitted') as fuel_pending,
  (select coalesce(sum(i.fuel_issued_l), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date) as fuel_l_this_month,
  (select coalesce(sum(i.total_cost_tzs), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date) as fuel_cost_this_month,
  (select coalesce(sum(i.km_run), 0) from public.fuel_issues i
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date and i.fuel_issued_l > 0) as fuel_km_this_month
from public.vehicles v
left join lateral (
  select d.inspection_date, d.remark from public.daily_inspections d
  where d.vehicle_id = v.id and d.deleted_at is null
  order by d.inspection_date desc, d.created_at desc limit 1
) di on true
left join lateral (
  select r.request_date, r.current_odometer from public.fuel_requests r
  where r.vehicle_id = v.id and r.deleted_at is null and r.current_odometer is not null
  order by r.request_date desc, r.created_at desc limit 1
) fr on true
where v.deleted_at is null;

grant select on public.v_vehicle_activity to authenticated;

-- Records per month for one vehicle (the month picker on the hubs).
create or replace function public.vehicle_month_counts(p_table text, p_vehicle uuid, p_year int)
returns table (month int, records bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_col text := case p_table
    when 'daily_inspections' then 'inspection_date'
    when 'km_logs' then 'log_date'
    when 'fuel_requests' then 'request_date'
    else null end;
begin
  if v_col is null then
    raise exception 'Not a monthly record table: %', p_table;
  end if;
  return query execute format(
    'select extract(month from %1$I)::int, count(*) from public.%2$I
     where vehicle_id = $1 and deleted_at is null and extract(year from %1$I) = $2
     group by 1', v_col, p_table)
  using p_vehicle, p_year;
end;
$$;
grant execute on function public.vehicle_month_counts(text, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Fuel request: previous odometer is the current reading at the vehicle's last refuel.
-- ---------------------------------------------------------------------------
create or replace function public.fuel_requests_previous()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.previous_odometer is null then
    select r.current_odometer into new.previous_odometer from public.fuel_requests r
    where r.vehicle_id = new.vehicle_id and r.deleted_at is null and r.current_odometer is not null
      and r.id <> new.id and r.request_date <= new.request_date
    order by r.request_date desc, r.created_at desc limit 1;
  end if;
  if new.previous_odometer is null then
    select odometer_km into new.previous_odometer from public.vehicles where id = new.vehicle_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Professional training: one row per course, each with its own institution and date.
-- ---------------------------------------------------------------------------
alter table public.driver_courses
  add column if not exists course text,
  add column if not exists institution text;

insert into public.driver_courses (company_id, driver_id, courses, course, course_other, provider, provider_other, institution, date_completed, certificate_attachment_id, created_at, created_by)
select c.company_id, c.driver_id, array[x.course], x.course, case when x.course = 'other' then c.course_other end,
       c.provider, c.provider_other,
       case c.provider when 'nit' then 'NIT' when 'veta' then 'VETA' else c.provider_other end,
       c.date_completed, c.certificate_attachment_id, c.created_at, c.created_by
from public.driver_courses c
cross join lateral unnest(c.courses) as x(course)
where c.course is null and c.deleted_at is null;

update public.driver_courses set deleted_at = now() where course is null and deleted_at is null;
