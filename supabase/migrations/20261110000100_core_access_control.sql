-- MDV Fleet Management System
-- Migration 1: extensions, enums, companies, profiles, access-control tables and permission engine.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.permission_action as enum ('view', 'create', 'edit', 'delete', 'approve', 'export');
-- Enum order matters: own < department < all, so max() returns the widest scope.
create type public.grant_scope as enum ('own', 'department', 'all');
create type public.request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'completed');
create type public.anomaly_status as enum ('open', 'closed');
create type public.anomaly_timing as enum ('immediately', 'before_next_service', 'at_next_service');
create type public.reminder_status as enum ('pending', 'notified', 'done');
create type public.sex as enum ('male', 'female');

-- ---------------------------------------------------------------------------
-- Companies, sites, profiles
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  region text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  unique (company_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id),
  full_name text not null default '',
  email text,
  phone text,
  job_title text,
  department text,
  employment_number text,
  employer text,
  driver_id uuid,
  avatar_url text,
  locale text not null default 'en',
  is_active boolean not null default true,
  notification_prefs jsonb not null default '{"email": true, "in_app": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access control: resources, roles, grants, user roles, admin ceilings, audit
-- ---------------------------------------------------------------------------
create table public.resources (
  key text primary key,
  parent_key text references public.resources(key) on delete cascade,
  name text not null,
  label_prefix text,            -- "1", "a", "b" so the sidebar matches the document numbering
  path text,                    -- app route
  icon text,                    -- lucide icon name
  sort_order integer not null default 0,
  has_reminders boolean not null default false,
  is_request boolean not null default false,
  check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$')
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null = global system role
  name text not null,
  description text,
  is_system boolean not null default false,
  is_owner boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index roles_company_name_idx
  on public.roles (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.role_grants (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  resource_key text not null references public.resources(key) on delete cascade,
  actions public.permission_action[] not null default '{}',
  scope public.grant_scope not null default 'all',
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (role_id, resource_key)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, role_id)
);
create unique index user_roles_one_primary_idx on public.user_roles (user_id) where is_primary;

-- Admin delegation ceiling: the resources an admin may configure for others.
create table public.admin_ceilings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_key text not null references public.resources(key) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, resource_key)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  actor_id uuid,
  action text not null,           -- insert, update, delete, approve, reject, grant_change, ...
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_company_created_idx on public.audit_log (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper: current user context
-- ---------------------------------------------------------------------------
create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_driver_id()
returns uuid language sql stable security definer set search_path = public as $$
  select driver_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_department()
returns text language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = auth.uid();
$$;

-- No JWT (service role, migrations, seed) counts as owner for the role-editing guards.
-- Data access still goes through permission_scope, which returns null for a missing user.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_owner
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_admin
  );
$$;

-- Longest-prefix grant lookup for one user, one resource and one action.
-- A child grant overrides its parent; the widest scope across the user's roles wins.
create or replace function public.permission_scope_for(p_user uuid, p_resource text, p_action public.permission_action)
returns public.grant_scope language plpgsql stable security definer set search_path = public as $$
declare
  v_scope public.grant_scope;
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

  with best as (
    select distinct on (ur.role_id)
      ur.role_id, g.actions, g.scope
    from public.user_roles ur
    join public.role_grants g on g.role_id = ur.role_id
    where ur.user_id = p_user
      and (g.resource_key = p_resource or p_resource like g.resource_key || '.%')
    order by ur.role_id, length(g.resource_key) desc
  )
  select max(scope) into v_scope
  from best
  where p_action = any(actions);

  return v_scope;
end;
$$;

create or replace function public.permission_scope(p_resource text, p_action public.permission_action)
returns public.grant_scope language sql stable security definer set search_path = public as $$
  select public.permission_scope_for(auth.uid(), p_resource, p_action);
$$;

create or replace function public.has_permission(p_resource text, p_action public.permission_action)
returns boolean language sql stable security definer set search_path = public as $$
  select public.permission_scope(p_resource, p_action) is not null;
$$;

-- Row-level access check used by every data table policy.
create or replace function public.row_access(
  p_resource text,
  p_action public.permission_action,
  p_company uuid,
  p_created_by uuid,
  p_driver_id uuid default null,
  p_department text default null
) returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_scope public.grant_scope;
begin
  v_scope := public.permission_scope(p_resource, p_action);
  if v_scope is null then
    return false;
  end if;
  if p_company is distinct from public.my_company_id() then
    return false;
  end if;
  if v_scope = 'all' then
    return true;
  end if;
  if v_scope = 'department' then
    -- Records of the user's company or department.
    return p_department is null or public.my_department() is null or p_department = public.my_department();
  end if;
  -- own
  return p_created_by = auth.uid()
      or (p_driver_id is not null and p_driver_id = public.my_driver_id());
end;
$$;

-- Plain-language list of everything a user may do (for My profile and the role preview).
create or replace function public.my_permissions()
returns table (resource_key text, resource_name text, actions public.permission_action[], scope public.grant_scope)
language sql stable security definer set search_path = public as $$
  select r.key, r.name,
    case when public.is_owner() then enum_range(null::public.permission_action)
         else (select array_agg(a) from unnest(enum_range(null::public.permission_action)) a
               where public.permission_scope(r.key, a) is not null) end,
    case when public.is_owner() then 'all'::public.grant_scope
         else (select max(public.permission_scope(r.key, a)) from unnest(enum_range(null::public.permission_action)) a) end
  from public.resources r
  where public.is_owner() or exists (
    select 1 from unnest(enum_range(null::public.permission_action)) a where public.permission_scope(r.key, a) is not null)
  order by r.sort_order;
$$;

-- ---------------------------------------------------------------------------
-- Audit fields trigger (company_id, created_by, updated_*)
-- ---------------------------------------------------------------------------
create or replace function public.set_audit_fields()
returns trigger language plpgsql as $$
declare
  j jsonb;
begin
  j := to_jsonb(new);
  if tg_op = 'INSERT' then
    if j ? 'company_id' and (j ->> 'company_id') is null then
      new := jsonb_populate_record(new, jsonb_build_object('company_id', public.my_company_id()));
    end if;
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;
  return new;
end;
$$;

create or replace function public.audit_write(p_action text, p_table text, p_row_id text, p_before jsonb, p_after jsonb, p_company uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (company_id, actor_id, action, table_name, row_id, before, after)
  values (coalesce(p_company, public.my_company_id()), auth.uid(), p_action, p_table, p_row_id, p_before, p_after);
end;
$$;

-- Soft delete guard: setting deleted_at requires the delete action on the table's resource.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql as $$
declare
  v_resource text := tg_argv[0];
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if not public.has_permission(v_resource, 'delete') then
      raise exception 'You do not have permission to delete records in %', v_resource
        using errcode = '42501', hint = 'permission_denied';
    end if;
    perform public.audit_write('delete', tg_table_name, new.id::text, to_jsonb(old), null, new.company_id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role editing rules (section 6.4), enforced in the database
-- ---------------------------------------------------------------------------
create or replace function public.admin_ceiling_covers(p_user uuid, p_resource text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_ceilings c
    where c.user_id = p_user
      and (c.resource_key = p_resource or p_resource like c.resource_key || '.%')
  );
$$;

create or replace function public.assert_can_manage_role(p_role_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.roles;
begin
  if public.is_owner() then
    return;
  end if;
  select * into v_role from public.roles where id = p_role_id;
  if not public.is_admin() then
    raise exception 'Only an owner or admin may change roles' using errcode = '42501', hint = 'permission_denied';
  end if;
  if v_role.is_owner or v_role.is_system then
    raise exception 'Admins cannot change system roles' using errcode = '42501', hint = 'permission_denied';
  end if;
  if v_role.company_id is distinct from public.my_company_id() then
    raise exception 'Admins can only manage roles in their own company' using errcode = '42501', hint = 'permission_denied';
  end if;
end;
$$;

create or replace function public.assert_grant_within_ceiling(p_resource text, p_actions public.permission_action[], p_scope public.grant_scope)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  a public.permission_action;
  v_scope public.grant_scope;
begin
  if public.is_owner() then
    return;
  end if;
  if not public.admin_ceiling_covers(auth.uid(), p_resource) then
    raise exception 'Resource % is outside your delegation ceiling', p_resource using errcode = '42501', hint = 'ceiling';
  end if;
  foreach a in array p_actions loop
    v_scope := public.permission_scope(p_resource, a);
    if v_scope is null or v_scope < p_scope then
      raise exception 'You cannot grant % on % at scope % because you do not hold it yourself', a, p_resource, p_scope
        using errcode = '42501', hint = 'ceiling';
    end if;
  end loop;
end;
$$;

create or replace function public.roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_owner() then
      if not public.is_admin() then
        raise exception 'Only an owner or admin may create roles' using errcode = '42501';
      end if;
      if new.is_owner or new.is_system or new.is_admin then
        raise exception 'Admins cannot create system, admin or owner roles' using errcode = '42501';
      end if;
      new.company_id := public.my_company_id();
    end if;
    perform public.audit_write('role_create', 'roles', new.id::text, null, to_jsonb(new), new.company_id);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.assert_can_manage_role(old.id);
    if old.is_owner and (not new.is_owner or not new.is_system) then
      raise exception 'The Owner role cannot be changed' using errcode = '42501';
    end if;
    if not public.is_owner() and (new.is_owner <> old.is_owner or new.is_system <> old.is_system
        or new.is_admin <> old.is_admin or new.company_id is distinct from old.company_id) then
      raise exception 'Admins cannot change role flags' using errcode = '42501';
    end if;
    perform public.audit_write('role_update', 'roles', new.id::text, to_jsonb(old), to_jsonb(new), new.company_id);
    return new;
  else
    perform public.assert_can_manage_role(old.id);
    if old.is_owner then
      raise exception 'The Owner role cannot be deleted' using errcode = '42501';
    end if;
    if exists (select 1 from public.user_roles where role_id = old.id) then
      raise exception 'This role is still assigned to users' using errcode = '23503', hint = 'role_in_use';
    end if;
    perform public.audit_write('role_delete', 'roles', old.id::text, to_jsonb(old), null, old.company_id);
    return old;
  end if;
end;
$$;

create trigger roles_guard before insert or update or delete on public.roles
  for each row execute function public.roles_guard();

create or replace function public.role_grants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.roles;
begin
  select * into v_role from public.roles where id = coalesce(new.role_id, old.role_id);
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_can_manage_role(new.role_id);
    perform public.assert_grant_within_ceiling(new.resource_key, new.actions, new.scope);
    perform public.audit_write('grant_change', 'role_grants', new.id::text,
      case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), v_role.company_id);
    return new;
  else
    perform public.assert_can_manage_role(old.role_id);
    if v_role.is_owner then
      raise exception 'The Owner role cannot be emptied' using errcode = '42501';
    end if;
    perform public.assert_grant_within_ceiling(old.resource_key, old.actions, old.scope);
    perform public.audit_write('grant_change', 'role_grants', old.id::text, to_jsonb(old), null, v_role.company_id);
    return old;
  end if;
end;
$$;

create trigger role_grants_guard before insert or update or delete on public.role_grants
  for each row execute function public.role_grants_guard();

create or replace function public.user_roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.roles;
  g record;
  v_owner_count integer;
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
    -- The target user must be in the admin's company.
    if (select company_id from public.profiles where id = new.user_id) is distinct from public.my_company_id() then
      raise exception 'You can only assign roles to users in your company' using errcode = '42501';
    end if;
    -- Every grant on the role being assigned must be inside the admin's ceiling and held by the admin.
    for g in select * from public.role_grants where role_id = new.role_id loop
      perform public.assert_grant_within_ceiling(g.resource_key, g.actions, g.scope);
    end loop;
  end if;
  perform public.audit_write('user_role_assign', 'user_roles', new.user_id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new), v_role.company_id);
  return new;
end;
$$;

create trigger user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function public.user_roles_guard();

create or replace function public.admin_ceilings_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner may change delegation ceilings' using errcode = '42501';
  end if;
  perform public.audit_write('ceiling_change', 'admin_ceilings', coalesce(new.user_id, old.user_id)::text,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create trigger admin_ceilings_guard before insert or update or delete on public.admin_ceilings
  for each row execute function public.admin_ceilings_guard();

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, company_id, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS for the access-control tables
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.roles enable row level security;
alter table public.role_grants enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_ceilings enable row level security;
alter table public.audit_log enable row level security;

create policy companies_select on public.companies for select to authenticated
  using (public.is_owner() or id = public.my_company_id());
create policy companies_insert on public.companies for insert to authenticated
  with check (public.is_owner());
create policy companies_update on public.companies for update to authenticated
  using (public.is_owner() or (id = public.my_company_id() and public.has_permission('settings.company', 'edit')));

create policy sites_select on public.sites for select to authenticated
  using (company_id = public.my_company_id() or public.is_owner());
create policy sites_write on public.sites for all to authenticated
  using (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit')))
  with check (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.company', 'edit')));

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_owner() or company_id = public.my_company_id());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.users', 'edit')))
  with check (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.users', 'edit')));
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (public.is_owner() or public.has_permission('settings.users', 'create'));

create policy resources_select on public.resources for select to authenticated using (true);
create policy resources_owner_write on public.resources for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy roles_select on public.roles for select to authenticated
  using (company_id is null or company_id = public.my_company_id() or public.is_owner());
create policy roles_write on public.roles for all to authenticated
  using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

create policy role_grants_select on public.role_grants for select to authenticated using (true);
create policy role_grants_write on public.role_grants for all to authenticated
  using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_owner()
     or exists (select 1 from public.profiles p where p.id = user_id and p.company_id = public.my_company_id()));
create policy user_roles_write on public.user_roles for all to authenticated
  using (public.is_owner() or public.is_admin()) with check (public.is_owner() or public.is_admin());

create policy admin_ceilings_select on public.admin_ceilings for select to authenticated
  using (user_id = auth.uid() or public.is_owner() or public.is_admin());
create policy admin_ceilings_write on public.admin_ceilings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_owner() or (company_id = public.my_company_id() and public.has_permission('settings.audit', 'view')));

-- Guard against a profile pointing itself at another company (only owner / user admins may do that).
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not public.is_owner() then
    if new.company_id is distinct from old.company_id or new.driver_id is distinct from old.driver_id
       or new.is_active <> old.is_active or new.department is distinct from old.department then
      raise exception 'You cannot change your own company, department, driver link or status' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

create trigger companies_audit before insert or update on public.companies for each row execute function public.set_audit_fields();
create trigger sites_audit before insert or update on public.sites for each row execute function public.set_audit_fields();
create trigger roles_audit before insert or update on public.roles for each row execute function public.set_audit_fields();
create trigger role_grants_audit before insert or update on public.role_grants for each row execute function public.set_audit_fields();
