-- 17: Where each vehicle's last logged trip ended, so a new km log starts from there.

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
    where i.vehicle_id = v.id and i.deleted_at is null and i.issue_date >= date_trunc('month', current_date)::date and i.fuel_issued_l > 0) as fuel_km_this_month,
  li.issue_date as last_issue_date,
  li.fuel_issued_l as last_issue_l,
  li.balance_l as last_issue_balance_l,
  li.km_run as last_issue_km_run,
  coalesce(li.fuel_issued_l, (select r.approved_l from public.fuel_requests r
    where r.vehicle_id = v.id and r.deleted_at is null and r.approved_l is not null
    order by r.request_date desc, r.created_at desc limit 1)) as last_fuel_filled,
  (select t.destination from public.km_log_trips t join public.km_logs l on l.id = t.km_log_id
    where l.vehicle_id = v.id and l.deleted_at is null and t.deleted_at is null and t.km_end is not null
    order by l.log_date desc, t.km_end desc limit 1) as last_km_destination
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
left join lateral (
  select i.issue_date, i.fuel_issued_l, i.balance_l, i.km_run from public.fuel_issues i
  where i.vehicle_id = v.id and i.deleted_at is null
  order by i.issue_date desc, i.created_at desc limit 1
) li on true
where v.deleted_at is null;

grant select on public.v_vehicle_activity to authenticated;
