-- FMS
-- Migration 9: owner platform mode. The owner works outside any company (profile company_id is null)
-- and opens a company's workspace on demand. Owner notifications no longer need a company.

alter table public.notifications alter column company_id drop not null;

insert into public.resources (key, parent_key, name, path, icon, sort_order) values
  ('platform.users', 'platform', 'Users', '/platform/users', 'users', 54)
on conflict (key) do nothing;
update public.resources set sort_order = 55 where key = 'platform.registrations';

-- Enter a company's workspace (p_company) or go back to the platform (null).
create or replace function public.switch_company(p_company uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can switch companies' using errcode = '42501';
  end if;
  if p_company is not null and not exists (select 1 from public.companies where id = p_company and deleted_at is null) then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;
  update public.profiles set company_id = p_company where id = auth.uid();
end;
$$;

-- Owners start on the platform, not inside a customer company.
update public.profiles p set company_id = null
where exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id and r.is_owner);

-- Owner view of every user across companies.
create or replace function public.platform_users()
returns table (id uuid, full_name text, email text, phone text, is_active boolean, company_id uuid, company_name text, roles text[], is_owner boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_owner();
  return query
    select p.id, p.full_name, p.email, p.phone, p.is_active, p.company_id, c.name,
      coalesce(array_agg(r.name order by ur.is_primary desc, r.name) filter (where r.id is not null), '{}'),
      coalesce(bool_or(r.is_owner), false),
      p.created_at
    from public.profiles p
    left join public.companies c on c.id = p.company_id
    left join public.user_roles ur on ur.user_id = p.id
    left join public.roles r on r.id = ur.role_id
    group by p.id, c.name
    order by c.name nulls first, p.full_name;
end;
$$;

-- Companies that need the owner's attention.
create or replace function public.platform_issues()
returns table (company_id uuid, company_name text, issue text, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_owner();
  return query
    select c.id, c.name, 'no_admin'::text, null::text
    from public.companies c
    where c.deleted_at is null and c.status in ('active', 'trial')
      and not exists (
        select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id join public.roles r on r.id = ur.role_id
        where p.company_id = c.id and r.is_admin and p.is_active)
    union all
    select c.id, c.name, 'no_package', null from public.companies c
    where c.deleted_at is null and c.package_id is null and c.status <> 'cancelled'
    union all
    select c.id, c.name, 'expired', c.subscription_end::text from public.companies c
    where c.deleted_at is null and c.status in ('active', 'trial') and c.subscription_end < current_date
    union all
    select c.id, c.name, 'suspended', null from public.companies c
    where c.deleted_at is null and c.status = 'suspended';
end;
$$;

grant execute on function public.platform_users(), public.platform_issues() to authenticated;
