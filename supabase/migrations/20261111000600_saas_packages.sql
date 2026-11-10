-- MDV Fleet Management System
-- Migration 6: SaaS. Packages (name, price, modules, vehicle limit), companies subscribed to a package,
-- public registrations, package and subscription gating inside the permission engine, and owner RPCs.

-- ---------------------------------------------------------------------------
-- Safer owner check: "no JWT" (migrations, seed, psql) or the service role counts as owner;
-- an anonymous API caller never does.
-- ---------------------------------------------------------------------------
create or replace function public.jwt_role()
returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$$;

create or replace function public.is_service_context()
returns boolean language sql stable as $$
  select public.jwt_role() is null or public.jwt_role() = 'service_role';
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null and public.is_service_context()) or exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_owner
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.company_status as enum ('pending', 'trial', 'active', 'suspended', 'cancelled');

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(14,2) not null default 0 check (price >= 0),
  currency text not null default 'TZS',
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'quarterly', 'yearly')),
  max_vehicles integer not null check (max_vehicles > 0),
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);
create unique index packages_name_idx on public.packages (lower(name)) where deleted_at is null;

create table public.package_resources (
  package_id uuid not null references public.packages(id) on delete cascade,
  resource_key text not null references public.resources(key) on delete cascade,
  primary key (package_id, resource_key)
);

alter table public.companies
  add column package_id uuid references public.packages(id),
  add column status public.company_status not null default 'active',
  add column contact_name text,
  add column contact_email text,
  add column contact_phone text,
  add column address text,
  add column city text,
  add column country text default 'Tanzania',
  add column subscription_start date,
  add column subscription_end date,
  add column notes text;

create table public.company_registrations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (length(trim(company_name)) between 2 and 200),
  contact_name text not null check (length(trim(contact_name)) between 2 and 200),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  city text,
  country text,
  vehicles_count integer check (vehicles_count is null or vehicles_count between 0 and 100000),
  package_id uuid references public.packages(id),
  message text check (message is null or length(message) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  company_id uuid references public.companies(id),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger packages_audit before insert or update on public.packages for each row execute function public.set_audit_fields();

-- Platform resources (owner only: no role grants are seeded for them).
insert into public.resources (key, parent_key, name, path, icon, sort_order) values
  ('platform', null, 'Platform', '/platform', 'building', 50),
  ('platform.overview', 'platform', 'Overview', '/platform', 'layout-grid', 51),
  ('platform.companies', 'platform', 'Companies', '/platform/companies', 'building-2', 52),
  ('platform.packages', 'platform', 'Packages', '/platform/packages', 'package', 53),
  ('platform.registrations', 'platform', 'Registrations', '/platform/registrations', 'inbox', 54)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Gating: subscription status and package modules
-- ---------------------------------------------------------------------------
create or replace function public.company_access_ok(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    where c.id = p_company and c.deleted_at is null
      and c.status in ('active', 'trial')
      and (c.subscription_end is null or c.subscription_end >= current_date)
  );
$$;

-- Dashboard and Settings are always available; Platform never is (the owner bypasses this check).
-- A package key allows itself, its children and its ancestors (so the sidebar group shows).
create or replace function public.package_allows(p_company uuid, p_resource text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_top text := split_part(p_resource, '.', 1);
begin
  if v_top in ('dashboard', 'settings') then
    return true;
  end if;
  if v_top = 'platform' then
    return false;
  end if;
  return exists (
    select 1 from public.companies c
    join public.package_resources pr on pr.package_id = c.package_id
    where c.id = p_company
      and (pr.resource_key = p_resource
           or starts_with(p_resource, pr.resource_key || '.')
           or starts_with(pr.resource_key, p_resource || '.'))
  );
end;
$$;

create or replace function public.permission_scope_for(p_user uuid, p_resource text, p_action public.permission_action)
returns public.grant_scope language plpgsql stable security definer set search_path = public as $$
declare
  v_scope public.grant_scope;
  v_company uuid;
begin
  if p_user is null then
    return null;
  end if;

  if exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user and r.is_owner
  ) then
    return 'all'::public.grant_scope;
  end if;

  select company_id into v_company from public.profiles where id = p_user and is_active;
  if v_company is null or not public.company_access_ok(v_company) or not public.package_allows(v_company, p_resource) then
    return null;
  end if;

  with best as (
    select distinct on (ur.role_id)
      ur.role_id, g.actions, g.scope
    from public.user_roles ur
    join public.role_grants g on g.role_id = ur.role_id
    where ur.user_id = p_user
      and (g.resource_key = p_resource or starts_with(p_resource, g.resource_key || '.'))
    order by ur.role_id, length(g.resource_key) desc
  )
  select max(scope) into v_scope
  from best
  where p_action = any(actions);

  return v_scope;
end;
$$;

create or replace function public.admin_ceiling_covers(p_user uuid, p_resource text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_ceilings c
    where c.user_id = p_user
      and (c.resource_key = p_resource or starts_with(p_resource, c.resource_key || '.'))
  );
$$;

-- ---------------------------------------------------------------------------
-- Vehicle limit per package
-- ---------------------------------------------------------------------------
create or replace function public.enforce_vehicle_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max integer;
  v_count integer;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and new.company_id = old.company_id then
    return new;
  end if;
  perform 1 from public.companies where id = new.company_id for update;
  select p.max_vehicles into v_max
  from public.companies c join public.packages p on p.id = c.package_id
  where c.id = new.company_id;
  if v_max is null then
    return new;
  end if;
  select count(*) into v_count from public.vehicles
  where company_id = new.company_id and deleted_at is null and id <> new.id;
  if v_count >= v_max then
    raise exception 'Your package allows % vehicles. Ask the system owner to upgrade the package to add more.', v_max
      using errcode = '23514', hint = 'vehicle_limit';
  end if;
  return new;
end;
$$;
create trigger vehicles_limit before insert or update of deleted_at, company_id on public.vehicles
  for each row execute function public.enforce_vehicle_limit();

-- Only the owner may change a company's package, status or subscription.
create or replace function public.companies_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    if new.package_id is distinct from old.package_id or new.status is distinct from old.status
       or new.subscription_start is distinct from old.subscription_start or new.subscription_end is distinct from old.subscription_end
       or new.deleted_at is distinct from old.deleted_at or new.notes is distinct from old.notes then
      raise exception 'Only the system owner can change the package, status or subscription' using errcode = '42501', hint = 'permission_denied';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.package_id is distinct from old.package_id or new.status is distinct from old.status) then
    perform public.audit_write('subscription_change', 'companies', new.id::text,
      jsonb_build_object('package_id', old.package_id, 'status', old.status, 'subscription_end', old.subscription_end),
      jsonb_build_object('package_id', new.package_id, 'status', new.status, 'subscription_end', new.subscription_end), new.id);
  end if;
  return new;
end;
$$;
create trigger companies_guard before update on public.companies for each row execute function public.companies_guard();

-- Tell owners about a new registration.
create or replace function public.registrations_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  for p in
    select distinct ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.is_owner
  loop
    perform public.notify_user(p.user_id, 'system', 'New company registration: ' || new.company_name,
      new.contact_name || ' (' || new.email || ')', '/platform/registrations');
  end loop;
  return null;
end;
$$;
create trigger registrations_notify after insert on public.company_registrations
  for each row execute function public.registrations_notify();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function public.my_package_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.package_id from public.companies c join public.profiles p on p.company_id = c.id where p.id = auth.uid();
$$;

alter table public.packages enable row level security;
alter table public.package_resources enable row level security;
alter table public.company_registrations enable row level security;

create policy packages_select on public.packages for select to anon, authenticated
  using (deleted_at is null and (
    (is_active and is_public)
    or public.is_owner()
    or (auth.uid() is not null and id = public.my_package_id())
  ));
create policy packages_owner_write on public.packages for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy package_resources_select on public.package_resources for select to anon, authenticated using (true);
create policy package_resources_owner_write on public.package_resources for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy registrations_public_insert on public.company_registrations for insert to anon, authenticated
  with check (status = 'pending' and company_id is null and reviewed_by is null and reviewed_at is null and rejection_reason is null);
create policy registrations_owner_select on public.company_registrations for select to authenticated using (public.is_owner());
create policy registrations_owner_update on public.company_registrations for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Anyone may read module names (used on the public pricing section).
create policy resources_public_select on public.resources for select to anon using (true);

grant select on public.packages, public.package_resources, public.resources to anon;
grant insert on public.company_registrations to anon;
grant all on public.packages, public.package_resources, public.company_registrations to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Owner RPCs
-- ---------------------------------------------------------------------------
create or replace function public.assert_owner()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only the system owner can do this' using errcode = '42501', hint = 'permission_denied';
  end if;
end;
$$;

create or replace function public.platform_company_stats()
returns table (company_id uuid, vehicles bigint, users bigint, drivers bigint, storage_bytes bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_owner();
  return query
    select c.id,
      (select count(*) from public.vehicles v where v.company_id = c.id and v.deleted_at is null),
      (select count(*) from public.profiles p where p.company_id = c.id and p.is_active),
      (select count(*) from public.drivers d where d.company_id = c.id and d.deleted_at is null),
      (select coalesce(sum(a.size_bytes), 0)::bigint from public.attachments a where a.company_id = c.id and a.deleted_at is null),
      (select max(a.created_at) from public.audit_log a where a.company_id = c.id)
    from public.companies c
    where c.deleted_at is null;
end;
$$;

create or replace function public.reject_registration(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_owner();
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required when rejecting' using errcode = '23514', hint = 'reason_required';
  end if;
  update public.company_registrations set status = 'rejected', rejection_reason = trim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id and status = 'pending';
  if not found then raise exception 'Registration not found or already reviewed' using errcode = 'P0002'; end if;
end;
$$;

-- Company starter data when the owner creates a company directly.
create or replace function public.company_starter_data()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wash_prices (company_id, category, price_tzs)
  select new.id, c, 0 from unnest(array['full', 'body', 'interior', 'engine']) c
  on conflict do nothing;
  if not exists (select 1 from public.leave_categories where company_id = new.id) then
    insert into public.leave_categories (company_id, name, counts_against_balance) values
      (new.id, 'Annual leave', true), (new.id, 'Sick leave', false), (new.id, 'Compassionate leave', false),
      (new.id, 'Maternity or paternity leave', false), (new.id, 'Unpaid leave', false);
  end if;
  insert into public.reminder_settings (company_id, reminder_type, lead_days, lead_km)
  select new.id, t, case when t = 'licence_expiry' then 60 when t = 'next_service' then 0 else 30 end, 500
  from unnest(array['insurance_end', 'inspection_renewal', 'third_party_renewal', 'next_service', 'licence_expiry', 'osha_redo', 'training_refresher']) t
  on conflict do nothing;
  return null;
end;
$$;
create trigger companies_starter_data after insert on public.companies for each row execute function public.company_starter_data();

-- Approve a registration: create the company (starter data comes from the trigger above).
create or replace function public.approve_registration(p_id uuid, p_package uuid, p_status public.company_status default 'active', p_subscription_end date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.company_registrations;
  v_company uuid;
begin
  perform public.assert_owner();
  select * into r from public.company_registrations where id = p_id for update;
  if r.id is null then raise exception 'Registration not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'This registration was already reviewed' using errcode = '23514'; end if;
  if p_package is null then raise exception 'Choose a package' using errcode = '23514'; end if;

  insert into public.companies (name, package_id, status, contact_name, contact_email, contact_phone, city, country, subscription_start, subscription_end, settings)
  values (r.company_name, p_package, p_status, r.contact_name, r.email, r.phone, r.city, coalesce(r.country, 'Tanzania'), current_date, p_subscription_end,
          '{"currency": "TZS", "fuel_price_per_litre": 3150, "default_target_km_per_l": 9}'::jsonb)
  returning id into v_company;

  update public.company_registrations set status = 'approved', company_id = v_company, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform public.audit_write('registration_approve', 'company_registrations', p_id::text, to_jsonb(r), jsonb_build_object('company_id', v_company), v_company);
  return v_company;
end;
$$;

grant execute on all functions in schema public to authenticated, service_role;
