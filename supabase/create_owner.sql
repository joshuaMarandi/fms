-- Create (or reset) the system owner account. Run once after migrations and seed_base.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -v email='you@mdvfleet.co.tz' -v name='Your Name' -v password='a-strong-password' \
--     -f supabase/create_owner.sql
-- The owner works on the platform (no company) and can create companies, packages and admins.

select set_config('fms.owner_email', lower(:'email'), false),
       set_config('fms.owner_name', :'name', false),
       set_config('fms.owner_password', :'password', false);

do $$
declare
  v_email text := current_setting('fms.owner_email');
  v_name text := current_setting('fms.owner_name');
  v_password text := current_setting('fms.owner_password');
  v_id uuid;
  v_owner_role uuid;
begin
  if length(v_password) < 10 then
    raise exception 'Use a password of at least 10 characters';
  end if;
  select id into v_owner_role from public.roles where is_owner limit 1;
  if v_owner_role is null then
    raise exception 'Run supabase/seed_base.sql first (the Owner role is missing)';
  end if;

  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
            crypt(v_password, gen_salt('bf')), now(),
            '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('full_name', v_name),
            now(), now(), '', '', '', '', false);
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_id, v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(v_password, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = v_id;
  end if;

  insert into public.profiles (id, company_id, full_name, email, job_title, department)
  values (v_id, null, v_name, v_email, 'Owner', 'Management')
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, company_id = null, is_active = true;

  insert into public.user_roles (user_id, role_id, is_primary) values (v_id, v_owner_role, true)
  on conflict do nothing;

  raise notice 'Owner ready: % (%)', v_email, v_id;
end $$;

-- Do not leave the password in the session settings.
select set_config('fms.owner_password', '', false);
