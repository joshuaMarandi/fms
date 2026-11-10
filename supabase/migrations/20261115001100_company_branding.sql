-- FMS
-- Migration 11: company branding for the app and printed documents.
-- The logo is stored small (resized in the browser) as a data URL so documents can embed it directly;
-- the app serves it from /api/company-logo/<id> so it is not sent with every page.

alter table public.companies
  add column if not exists logo_data text check (logo_data is null or (logo_data like 'data:image/%' and length(logo_data) <= 600000)),
  add column if not exists logo_updated_at timestamptz,
  add column if not exists tax_number text,
  add column if not exists website text;

create or replace function public.companies_logo_stamp()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.logo_data is distinct from old.logo_data then
    new.logo_updated_at := case when new.logo_data is null then null else now() end;
  end if;
  return new;
end;
$$;
drop trigger if exists companies_logo_stamp on public.companies;
create trigger companies_logo_stamp before insert or update on public.companies
  for each row execute function public.companies_logo_stamp();

-- Same as migration 7, plus the company's contact details and logo version for documents.
create or replace function public.session_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_company_id uuid;
  v_roles jsonb;
  v_role_ids uuid[];
  v_is_owner boolean;
  v_company jsonb;
  v_package_keys jsonb;
  v_companies jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select to_jsonb(p.*), p.company_id into v_profile, v_company_id from public.profiles p where p.id = v_uid;
  if v_profile is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'name', r.name, 'is_owner', r.is_owner, 'is_admin', r.is_admin, 'is_system', r.is_system, 'is_primary', ur.is_primary)
         order by ur.is_primary desc, r.name), '[]'::jsonb),
         coalesce(array_agg(r.id), '{}'),
         coalesce(bool_or(r.is_owner), false)
    into v_roles, v_role_ids, v_is_owner
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = v_uid;

  if v_company_id is not null then
    select jsonb_build_object(
             'id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'settings', c.settings,
             'status', c.status, 'subscription_start', c.subscription_start, 'subscription_end', c.subscription_end,
             'package_id', c.package_id, 'active', public.company_access_ok(c.id),
             'logo_version', case when c.logo_data is null then null else extract(epoch from c.logo_updated_at)::bigint end,
             'address', c.address, 'city', c.city, 'country', c.country,
             'phone', c.contact_phone, 'email', c.contact_email, 'tax_number', c.tax_number, 'website', c.website,
             'package', case when pk.id is null then null else jsonb_build_object(
               'id', pk.id, 'name', pk.name, 'price', pk.price, 'currency', pk.currency,
               'billing_period', pk.billing_period, 'max_vehicles', pk.max_vehicles) end)
      into v_company
    from public.companies c left join public.packages pk on pk.id = c.package_id
    where c.id = v_company_id;

    select coalesce(jsonb_agg(pr.resource_key), '[]'::jsonb) into v_package_keys
    from public.companies c join public.package_resources pr on pr.package_id = c.package_id
    where c.id = v_company_id;
  end if;

  if v_is_owner then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) into v_companies
    from public.companies where deleted_at is null;
  end if;

  return jsonb_build_object(
    'profile', v_profile,
    'roles', v_roles,
    'grants', coalesce((select jsonb_agg(jsonb_build_object('role_id', g.role_id, 'resource_key', g.resource_key, 'actions', g.actions, 'scope', g.scope))
                        from public.role_grants g where g.role_id = any(v_role_ids)), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(r.*) order by r.sort_order) from public.resources r), '[]'::jsonb),
    'company', v_company,
    'package_keys', coalesce(v_package_keys, '[]'::jsonb),
    'companies', v_companies
  );
end;
$$;

-- Approvers may raise a request and approve it in one step (submit, then approve).
-- approve_request already checks the approve permission, so nothing else changes here.
