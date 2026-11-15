-- 19: Inspections are three kinds: daily pre-trip, mobilization (vehicle_inspections, kind internal)
-- and third-party. First aid kit inspection is removed from the app. Its rows stay in the
-- database, but the resource is gone, so nobody can open them and it leaves every package and role.

delete from public.table_resources where table_name in ('first_aid_items', 'first_aid_inspections');
delete from public.resources where key = 'inspections.first_aid';

-- Third-party moves after mobilization in the menu (mobilization sits in between, from the app).
update public.resources set sort_order = 303 where key = 'inspections.third_party';

-- One row per vehicle for the inspection pages.
--   daily_dates: the days with a daily inspection in the last 40 days (the app counts skipped days
--   against its own today, so the time zone always matches the rest of the app).
--   daily_open / daily_closed: actions from daily inspections.
--   mobilization_* and third_party_*: the newest record of each kind.
create or replace view public.v_vehicle_inspection_summary with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  v.created_at::date as added_on,
  (select array_agg(distinct d.inspection_date order by d.inspection_date)
     from public.daily_inspections d
    where d.vehicle_id = v.id and d.deleted_at is null and d.inspection_date >= current_date - 40) as daily_dates,
  (select max(d.inspection_date) from public.daily_inspections d where d.vehicle_id = v.id and d.deleted_at is null) as daily_last,
  (select count(*) from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null and a.daily_inspection_id is not null and a.status = 'open') as daily_open,
  (select count(*) from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null and a.daily_inspection_id is not null and a.status = 'closed') as daily_closed,
  mob.inspection_date as mobilization_last,
  mob.renewal_date as mobilization_next,
  tp.inspection_date as third_party_last,
  tp.renewal_date as third_party_next,
  (select count(*) from public.inspection_anomalies a
    where a.vehicle_id = v.id and a.deleted_at is null and a.third_party_inspection_id is not null and a.status = 'open') as third_party_open
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

grant select on public.v_vehicle_inspection_summary to authenticated;

-- Records per vehicle per year, for the year picker of mobilization and third-party inspections.
create or replace view public.v_inspection_years with (security_invoker = true) as
select i.vehicle_id, 'mobilization'::text as kind, extract(year from i.inspection_date)::int as year, count(*)::int as records
  from public.vehicle_inspections i
 where i.kind = 'internal' and i.deleted_at is null and i.inspection_date is not null
 group by 1, 2, 3
union all
select t.vehicle_id, 'third_party', extract(year from t.inspection_date)::int, count(*)::int
  from public.third_party_inspections t
 where t.deleted_at is null and t.inspection_date is not null
 group by 1, 2, 3;

grant select on public.v_inspection_years to authenticated;
