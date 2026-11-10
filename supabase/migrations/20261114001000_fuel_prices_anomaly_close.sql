-- FMS
-- Migration 10: monthly fuel prices kept by the company admin, and closing anomalies later.

-- ---------------------------------------------------------------------------
-- Fuel prices: a price per litre effective from a date. The price in force on a fuel issue's
-- date is used, so changing next month's price never rewrites past records.
-- ---------------------------------------------------------------------------
create table public.fuel_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  price_per_litre numeric(10,2) not null check (price_per_litre > 0),
  effective_from date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (company_id, effective_from)
);
create trigger fuel_prices_audit before insert or update on public.fuel_prices for each row execute function public.set_audit_fields();

alter table public.fuel_prices enable row level security;
create policy fuel_prices_select on public.fuel_prices for select to authenticated
  using (deleted_at is null and company_id = public.my_company_id());
create policy fuel_prices_write on public.fuel_prices for all to authenticated
  using (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'))
  with check (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit'));
grant all on public.fuel_prices to authenticated, service_role;

-- Price in force for a company on a date: the latest price effective on or before it,
-- else the older company setting, else 0.
create or replace function public.fuel_price_on(p_company uuid, p_date date default current_date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select price_per_litre from public.fuel_prices
      where company_id = p_company and deleted_at is null and effective_from <= coalesce(p_date, current_date)
      order by effective_from desc limit 1),
    (select nullif(settings ->> 'fuel_price_per_litre', '')::numeric from public.companies where id = p_company),
    0);
$$;
grant execute on function public.fuel_price_on(uuid, date) to authenticated;

-- Carry the existing company setting over as the first price.
insert into public.fuel_prices (company_id, price_per_litre, effective_from, note)
select id, (settings ->> 'fuel_price_per_litre')::numeric, coalesce(subscription_start, current_date - 365), 'Initial price'
from public.companies
where nullif(settings ->> 'fuel_price_per_litre', '') is not null and (settings ->> 'fuel_price_per_litre')::numeric > 0
on conflict do nothing;

create or replace function public.fuel_issues_defaults()
returns trigger language plpgsql as $$
declare
  v_tank numeric;
begin
  if coalesce(new.price_per_litre, 0) = 0 then
    new.price_per_litre := public.fuel_price_on(new.company_id, new.issue_date);
  end if;
  if new.balance_l is null then
    select fuel_tank_capacity_l into v_tank from public.vehicles where id = new.vehicle_id;
    if v_tank is not null and new.fuel_filled_l is not null then
      new.balance_l := greatest(v_tank - new.fuel_issued_l, 0);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fuel_expenses_defaults()
returns trigger language plpgsql as $$
declare v_target numeric;
begin
  if coalesce(new.price_per_litre, 0) = 0 then
    new.price_per_litre := public.fuel_price_on(new.company_id, new.expense_date);
  end if;
  if new.target_km_per_l is null then
    select target_km_per_l into v_target from public.vehicles where id = new.vehicle_id;
    new.target_km_per_l := v_target;
  end if;
  return new;
end;
$$;
create trigger fuel_expenses_defaults before insert or update on public.fuel_expenses
  for each row execute function public.fuel_expenses_defaults();

-- ---------------------------------------------------------------------------
-- Anomalies: may be recorded open and closed on a later day; the closing date fills itself.
-- ---------------------------------------------------------------------------
create or replace function public.inspection_anomalies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg text;
begin
  if new.daily_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.daily_inspections where id = new.daily_inspection_id;
  elsif new.third_party_inspection_id is not null then
    select vehicle_id, driver_id into new.vehicle_id, new.driver_id from public.third_party_inspections where id = new.third_party_inspection_id;
  end if;

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
