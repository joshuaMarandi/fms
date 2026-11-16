-- 21: "Vehicle daily use" becomes "Vehicle operations" with four pages, in this order:
-- Vehicle requests, Daily kilometre log, Fuel request (approval) and Fuel log (fuel issued).
-- The fuel request page moves to /daily-use/fuel-requests; /daily-use/fuel-log now lists the fuel
-- issued. Both stay under the daily_use.fuel_log permission, so roles do not change.

update public.resources set name = 'Vehicle operations' where key = 'daily_use';
update public.resources set name = 'Vehicle requests', sort_order = 401 where key = 'daily_use.trip_requests';
update public.resources set sort_order = 402 where key = 'daily_use.km_log';
update public.resources set name = 'Fuel request', path = '/daily-use/fuel-requests', sort_order = 403 where key = 'daily_use.fuel_log';

-- Month counts for the fuel log (fuel issued) too.
create or replace function public.vehicle_month_counts(p_table text, p_vehicle uuid, p_year int)
returns table (month int, records bigint)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_col text := case p_table
    when 'daily_inspections' then 'inspection_date'
    when 'km_logs' then 'log_date'
    when 'fuel_requests' then 'request_date'
    when 'fuel_issues' then 'issue_date'
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
