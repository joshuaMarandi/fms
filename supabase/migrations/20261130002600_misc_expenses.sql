-- 26: Miscellaneous expenses under Fleet expenses: what was bought, for which vehicle, quantity,
-- unit, unit price and amount (quantity x unit price). The key starts with "expenses." so roles and
-- packages that cover Fleet expenses cover it too.

insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('expenses.misc', 'expenses', 'Miscellaneous expenses', 'e', '/expenses/misc', 'receipt', 508, false, false)
on conflict (key) do update set parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, sort_order = excluded.sort_order;

create table public.misc_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  expense_date date not null default current_date,
  vehicle_id uuid references public.vehicles(id),
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity >= 0),
  unit text,
  unit_price_tzs numeric(14,2) not null default 0 check (unit_price_tzs >= 0),
  amount_tzs numeric(14,2) generated always as (round(quantity * unit_price_tzs, 2)) stored,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz
);
create index misc_expenses_company_idx on public.misc_expenses (company_id, expense_date desc) where deleted_at is null;
create trigger misc_expenses_audit before insert or update on public.misc_expenses for each row execute function public.set_audit_fields();
grant all on public.misc_expenses to authenticated, service_role;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('misc_expenses', 'expenses.misc', null, null, false)
on conflict (table_name) do update set resource_key = excluded.resource_key;
select public.apply_standard_rls('misc_expenses', 'expenses.misc');
