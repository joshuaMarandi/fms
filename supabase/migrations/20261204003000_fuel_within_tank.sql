-- 30: Fuel requested (and approved) can never be more than the vehicle's tank capacity:
-- balance in the tank + fuel requested = tank capacity. Checked here so it holds for the form,
-- the approval screen, email links and anything else. Vehicles without a tank capacity are not
-- blocked (set it in Fleet database).

create or replace function public.fuel_requests_within_tank()
returns trigger language plpgsql set search_path = public as $$
declare
  v_tank numeric;
  v_reg text;
begin
  select fuel_tank_capacity_l, registration into v_tank, v_reg from public.vehicles where id = new.vehicle_id;
  if v_tank is null or v_tank <= 0 then
    return new;
  end if;
  if new.fuel_required_l is not null and new.fuel_required_l > v_tank then
    raise exception 'Fuel requested (% L) is more than the tank capacity of % (% L). Request at most % L.',
      trim(to_char(new.fuel_required_l, 'FM999990.0')), v_reg, trim(to_char(v_tank, 'FM999990.0')), trim(to_char(v_tank, 'FM999990.0'))
      using errcode = '23514', hint = 'over_tank_capacity';
  end if;
  if new.approved_l is not null and new.approved_l > v_tank then
    raise exception 'Litres approved (% L) are more than the tank capacity of % (% L). Approve at most % L.',
      trim(to_char(new.approved_l, 'FM999990.0')), v_reg, trim(to_char(v_tank, 'FM999990.0')), trim(to_char(v_tank, 'FM999990.0'))
      using errcode = '23514', hint = 'over_tank_capacity';
  end if;
  return new;
end;
$$;

drop trigger if exists fuel_requests_within_tank on public.fuel_requests;
create trigger fuel_requests_within_tank before insert or update of fuel_required_l, approved_l, vehicle_id on public.fuel_requests
  for each row execute function public.fuel_requests_within_tank();
