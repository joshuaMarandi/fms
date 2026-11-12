-- 15: Package changes requested by the company admin and approved by the owner, admin ceilings that
-- follow the package, and assigning system roles (Driver, HR, ...) without the ceiling error.

-- ---------------------------------------------------------------------------
-- 1. Assigning roles
-- System roles (Driver, Fleet coordinator, HR, ...) are defined by the owner and shared by every
-- company. An admin may assign them as they are: grants on modules outside the company package do
-- nothing at run time (permission_scope_for checks the package), so they are not held against the
-- admin's ceiling. Custom roles are still checked, but only for modules in the package.
-- ---------------------------------------------------------------------------
create or replace function public.user_roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.roles;
  g record;
  v_owner_count integer;
  v_company uuid;
begin
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);

  if tg_op = 'DELETE' then
    if v_role.is_owner then
      select count(*) into v_owner_count
      from public.user_roles ur join public.roles r on r.id = ur.role_id where r.is_owner;
      if v_owner_count <= 1 then
        raise exception 'The last owner cannot be removed' using errcode = '42501', hint = 'last_owner';
      end if;
    end if;
    if not public.is_owner() then
      if not public.is_admin() then
        raise exception 'Only an owner or admin may change user roles' using errcode = '42501';
      end if;
      if v_role.is_owner or v_role.is_admin then
        raise exception 'Admins cannot change owner or admin assignments' using errcode = '42501';
      end if;
    end if;
    perform public.audit_write('user_role_remove', 'user_roles', old.user_id::text, to_jsonb(old), null, v_role.company_id);
    return old;
  end if;

  if not public.is_owner() then
    if not public.is_admin() then
      raise exception 'Only an owner or admin may assign roles' using errcode = '42501';
    end if;
    if v_role.is_owner or v_role.is_admin then
      raise exception 'Admins cannot assign owner or admin roles' using errcode = '42501';
    end if;
    v_company := public.my_company_id();
    -- The target user must be in the admin's company.
    if (select company_id from public.profiles where id = new.user_id) is distinct from v_company then
      raise exception 'You can only assign roles to users in your company' using errcode = '42501';
    end if;
    if v_role.company_id is not null and v_role.company_id is distinct from v_company then
      raise exception 'This role belongs to another company' using errcode = '42501';
    end if;
    -- Custom roles: every grant inside the package must be inside the admin's ceiling and held by the admin.
    if not v_role.is_system then
      for g in select * from public.role_grants where role_id = new.role_id loop
        if public.package_allows(v_company, g.resource_key) then
          perform public.assert_grant_within_ceiling(g.resource_key, g.actions, g.scope);
        end if;
      end loop;
    end if;
  end if;
  perform public.audit_write('user_role_assign', 'user_roles', new.user_id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), v_role.company_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Admin ceilings follow the package
-- When the package changes, the company's admins may delegate the modules it adds.
-- ---------------------------------------------------------------------------
create or replace function public.companies_sync_ceilings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.package_id is null or new.package_id is not distinct from old.package_id then
    return new;
  end if;
  insert into public.admin_ceilings (user_id, resource_key, created_by)
  select distinct ur.user_id, k.resource_key, auth.uid()
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.is_admin
  join public.profiles p on p.id = ur.user_id and p.company_id = new.id
  cross join lateral (
    select pr.resource_key from public.package_resources pr where pr.package_id = new.package_id
    union select 'dashboard'
  ) k
  on conflict (user_id, resource_key) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_sync_ceilings on public.companies;
create trigger companies_sync_ceilings after update of package_id on public.companies
  for each row execute function public.companies_sync_ceilings();

-- Admins invited while their company had no package (or before this fix) got an empty ceiling.
insert into public.admin_ceilings (user_id, resource_key)
select distinct ur.user_id, k.resource_key
from public.user_roles ur
join public.roles r on r.id = ur.role_id and r.is_admin
join public.profiles p on p.id = ur.user_id
join public.companies c on c.id = p.company_id and c.package_id is not null
cross join lateral (
  select pr.resource_key from public.package_resources pr where pr.package_id = c.package_id
  union select 'dashboard'
) k
where not exists (
  select 1 from public.admin_ceilings ac where ac.user_id = ur.user_id and ac.resource_key <> 'dashboard'
)
on conflict (user_id, resource_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Package change requests
-- ---------------------------------------------------------------------------
create table if not exists public.package_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_package_id uuid references public.packages(id),
  to_package_id uuid not null references public.packages(id),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists package_change_requests_one_pending on public.package_change_requests (company_id) where status = 'pending';
create index if not exists package_change_requests_company_idx on public.package_change_requests (company_id, created_at desc);

alter table public.package_change_requests enable row level security;
drop policy if exists package_change_requests_select on public.package_change_requests;
create policy package_change_requests_select on public.package_change_requests for select to authenticated
  using (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.company', 'view')));
revoke all on public.package_change_requests from public, anon, authenticated;
grant select on public.package_change_requests to authenticated;
grant all on public.package_change_requests to service_role;

create or replace function public.package_label(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.packages where id = p_id), 'No package');
$$;

-- The company admin asks for another package. A newer request replaces one still waiting.
create or replace function public.request_package_change(p_package uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.my_company_id();
  v_current uuid;
  v_company_name text;
  v_requester text;
  v_max integer;
  v_vehicles integer;
  v_id uuid;
  o record;
begin
  if v_company is null or not (public.is_admin() or public.has_permission('settings.company', 'edit')) then
    raise exception 'Only the company administrator can change the package' using errcode = '42501', hint = 'permission_denied';
  end if;
  select package_id, name into v_current, v_company_name from public.companies where id = v_company;
  select max_vehicles into v_max from public.packages where id = p_package and is_active and deleted_at is null;
  if not found then
    raise exception 'This package is not available' using errcode = 'P0001', hint = 'package_unavailable';
  end if;
  if p_package is not distinct from v_current then
    raise exception 'This is already your package' using errcode = 'P0001', hint = 'package_same';
  end if;
  select count(*) into v_vehicles from public.vehicles where company_id = v_company and deleted_at is null;
  if v_vehicles > v_max then
    raise exception 'This package allows % vehicles and you have %. Remove vehicles first or choose a bigger package.', v_max, v_vehicles
      using errcode = 'P0001', hint = 'package_too_small';
  end if;

  update public.package_change_requests set status = 'cancelled', decided_at = now()
  where company_id = v_company and status = 'pending';
  insert into public.package_change_requests (company_id, from_package_id, to_package_id, note, requested_by)
  values (v_company, v_current, p_package, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  select full_name into v_requester from public.profiles where id = auth.uid();
  -- Tell every system owner by email and SMS.
  for o in
    select distinct p.id, p.full_name from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.is_owner
    join public.profiles p on p.id = ur.user_id and p.is_active
  loop
    perform public.workflow_enqueue(v_company, o.id, null, null, 'package_request', jsonb_build_object(
      'name', split_part(coalesce(o.full_name, ''), ' ', 1),
      'company', v_company_name,
      'requester', coalesce(v_requester, ''),
      'from_package', public.package_label(v_current),
      'to_package', public.package_label(p_package),
      'note', coalesce(nullif(trim(coalesce(p_note, '')), ''), ''),
      'path', '/platform/companies/' || v_company
    ));
  end loop;
  perform public.audit_write('package_request', 'package_change_requests', v_id::text, null,
    jsonb_build_object('from', v_current, 'to', p_package), v_company);
  return v_id;
end;
$$;

-- The company admin withdraws a request still waiting.
create or replace function public.cancel_package_change(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.package_change_requests set status = 'cancelled', decided_at = now()
  where id = p_id and status = 'pending' and company_id = public.my_company_id()
    and (public.is_admin() or public.has_permission('settings.company', 'edit'));
  if not found then
    raise exception 'This request can no longer be cancelled' using errcode = 'P0001', hint = 'not_pending';
  end if;
end;
$$;

-- The owner approves (the package changes at once) or rejects with a reason.
create or replace function public.decide_package_change(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.package_change_requests;
  v_company_name text;
  v_max integer;
  v_vehicles integer;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
begin
  if auth.uid() is null or not public.is_owner() then
    raise exception 'Only the system owner can decide package changes' using errcode = '42501', hint = 'permission_denied';
  end if;
  select * into r from public.package_change_requests where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'This request was already decided' using errcode = 'P0001', hint = 'not_pending';
  end if;
  if not p_approve and v_note is null then
    raise exception 'Give a reason for the rejection' using errcode = 'P0001', hint = 'reason_required';
  end if;

  if p_approve then
    select max_vehicles into v_max from public.packages where id = r.to_package_id and deleted_at is null;
    if not found then
      raise exception 'This package no longer exists' using errcode = 'P0001', hint = 'package_unavailable';
    end if;
    select count(*) into v_vehicles from public.vehicles where company_id = r.company_id and deleted_at is null;
    if v_vehicles > v_max then
      raise exception 'The company has % vehicles and this package allows %', v_vehicles, v_max using errcode = 'P0001', hint = 'package_too_small';
    end if;
    update public.companies set package_id = r.to_package_id where id = r.company_id;
  end if;

  update public.package_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = v_note
  where id = p_id;

  select name into v_company_name from public.companies where id = r.company_id;
  select split_part(coalesce(full_name, ''), ' ', 1) into v_name from public.profiles where id = r.requested_by;
  if r.requested_by is not null then
    -- In-app notification without a second copy in the daily email.
    perform set_config('fms.workflow_record', p_id::text, true);
    perform public.notify_user(r.requested_by, case when p_approve then 'approval' else 'rejection' end,
      case when p_approve then 'Package changed to ' || public.package_label(r.to_package_id)
           else 'Package change to ' || public.package_label(r.to_package_id) || ' rejected' end,
      case when p_approve then null else 'Reason: ' || v_note end,
      '/settings/company?package_request=' || p_id, r.company_id);
    perform set_config('fms.workflow_record', '', true);
    perform public.workflow_enqueue(r.company_id, r.requested_by, null, null,
      case when p_approve then 'package_approved' else 'package_rejected' end,
      jsonb_build_object(
        'name', coalesce(v_name, ''),
        'company', v_company_name,
        'from_package', public.package_label(r.from_package_id),
        'to_package', public.package_label(r.to_package_id),
        'reason', coalesce(v_note, ''),
        'note', coalesce(v_note, ''),
        'path', '/settings/company'
      ));
  end if;
end;
$$;

revoke all on function public.request_package_change(uuid, text) from public, anon;
revoke all on function public.cancel_package_change(uuid) from public, anon;
revoke all on function public.decide_package_change(uuid, boolean, text) from public, anon;
grant execute on function public.request_package_change(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_package_change(uuid) to authenticated, service_role;
grant execute on function public.decide_package_change(uuid, boolean, text) to authenticated, service_role;
revoke all on function public.companies_sync_ceilings() from public, anon, authenticated;
