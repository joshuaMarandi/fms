-- 28: Approving a fuel request records the fuel issued straight away (no separate manager form):
-- the approved litres, the request's odometer readings and the price in force for the vehicle's
-- engine type. The issue then feeds the fuel log and Fleet expenses > Fuel as before.

create or replace function public.fuel_requests_issue_on_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and new.approved_l is not null and new.approved_l > 0
     and not exists (select 1 from public.fuel_issues i where i.fuel_request_id = new.id and i.deleted_at is null) then
    insert into public.fuel_issues (company_id, fuel_request_id, vehicle_id, driver_id, issue_date, previous_filled_l, previous_odometer, current_odometer, fuel_filled_l, fuel_issued_l, price_per_litre, created_by)
    values (new.company_id, new.id, new.vehicle_id, new.driver_id, coalesce(new.approved_at::date, current_date), new.fuel_filled_l,
            new.previous_odometer, new.current_odometer, new.fuel_filled_l, new.approved_l, 0, coalesce(new.approved_by, auth.uid()));
  end if;
  return null;
end;
$$;

drop trigger if exists fuel_requests_issue_on_approval on public.fuel_requests;
-- approve_request sets the status, then the approved litres; firing on either catches both.
create trigger fuel_requests_issue_on_approval after update of status, approved_l on public.fuel_requests
  for each row execute function public.fuel_requests_issue_on_approval();
