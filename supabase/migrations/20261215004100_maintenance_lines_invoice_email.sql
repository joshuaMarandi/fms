-- Maintenance and repair:
-- (1) Work orders and job cards take their description as lines ("Add description line"), and spare
--     parts as lines of part and quantity, so one record can hold many. The record keeps a text of its
--     lines (description, activities) for lists, search, print and the work order email.
--     A spare parts record now has one total cost, typed in (it was quantity x unit price).
-- (2) Invoices have the service provider's email; when an invoice is finally approved the provider
--     is told by email.

-- ---------------------------------------------------------------------------
-- (1) Lines
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_work_order_lines (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete cascade,
  description text not null
);

create table if not exists public.maintenance_cost_lines (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  maintenance_cost_id uuid not null references public.maintenance_costs(id) on delete cascade,
  description text not null
);

create table if not exists public.maintenance_spare_part_lines (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  spare_part_id uuid not null references public.maintenance_spare_parts(id) on delete cascade,
  part text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0)
);

do $$
declare
  t text;
  fk text;
begin
  foreach t in array array['maintenance_work_order_lines', 'maintenance_cost_lines', 'maintenance_spare_part_lines'] loop
    fk := case t when 'maintenance_work_order_lines' then 'work_order_id' when 'maintenance_cost_lines' then 'maintenance_cost_id' else 'spare_part_id' end;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at') then
      execute format('alter table public.%I
        add column created_at timestamptz not null default now(),
        add column created_by uuid,
        add column updated_at timestamptz not null default now(),
        add column updated_by uuid,
        add column deleted_at timestamptz', t);
      execute format('create index %I on public.%I (%I) where deleted_at is null', t || '_parent_idx', t, fk);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
      execute format('grant all on public.%I to authenticated, service_role', t);
    end if;
  end loop;
end $$;

insert into public.table_resources (table_name, resource_key, parent_table, parent_fk, is_request) values
  ('maintenance_work_order_lines', 'expenses.maintenance.costs', 'maintenance_work_orders', 'work_order_id', false),
  ('maintenance_cost_lines', 'expenses.maintenance.costs', 'maintenance_costs', 'maintenance_cost_id', false),
  ('maintenance_spare_part_lines', 'expenses.maintenance.costs', 'maintenance_spare_parts', 'spare_part_id', false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;

select public.apply_standard_rls('maintenance_work_order_lines', 'expenses.maintenance.costs');
select public.apply_standard_rls('maintenance_cost_lines', 'expenses.maintenance.costs');
select public.apply_standard_rls('maintenance_spare_part_lines', 'expenses.maintenance.costs');

-- The record's own text is now written from its lines.
alter table public.maintenance_work_orders alter column description drop not null;
alter table public.maintenance_costs alter column activities drop not null;
alter table public.maintenance_spare_parts alter column description drop not null;

-- Spare parts: one total cost for the record. Records so far keep the cost they had.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maintenance_spare_parts' and column_name = 'cost_tzs' and is_generated = 'ALWAYS') then
    alter table public.maintenance_spare_parts alter column cost_tzs drop expression;
  end if;
end $$;
alter table public.maintenance_spare_parts drop constraint if exists maintenance_spare_parts_cost_check;
alter table public.maintenance_spare_parts add constraint maintenance_spare_parts_cost_check check (cost_tzs is null or cost_tzs >= 0);

-- Older inserts (seeds, imports) give quantity and unit price but no cost: work it out as before.
create or replace function public.maintenance_spare_parts_cost()
returns trigger language plpgsql as $$
begin
  if new.cost_tzs is null then
    new.cost_tzs := round(coalesce(new.quantity, 0) * coalesce(new.unit_price_tzs, 0), 2);
  end if;
  return new;
end;
$$;
drop trigger if exists maintenance_spare_parts_cost on public.maintenance_spare_parts;
create trigger maintenance_spare_parts_cost before insert or update on public.maintenance_spare_parts
  for each row execute function public.maintenance_spare_parts_cost();

-- Lines -> the record's text (one line each, in the order they were added).
create or replace function public.maintenance_lines_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if tg_table_name = 'maintenance_work_order_lines' then
    v_id := coalesce(new.work_order_id, old.work_order_id);
    update public.maintenance_work_orders o set description = (
      select string_agg(l.description, E'\n' order by l.line_no) from public.maintenance_work_order_lines l
      where l.work_order_id = v_id and l.deleted_at is null) where o.id = v_id;
  elsif tg_table_name = 'maintenance_cost_lines' then
    v_id := coalesce(new.maintenance_cost_id, old.maintenance_cost_id);
    update public.maintenance_costs c set activities = (
      select string_agg(l.description, E'\n' order by l.line_no) from public.maintenance_cost_lines l
      where l.maintenance_cost_id = v_id and l.deleted_at is null) where c.id = v_id;
  else
    v_id := coalesce(new.spare_part_id, old.spare_part_id);
    update public.maintenance_spare_parts p set
      description = x.txt,
      quantity = coalesce(x.qty, p.quantity)
    from (
      select string_agg(l.part || ' × ' || rtrim(to_char(l.quantity, 'FM999,999,990.99'), '.'), E'\n' order by l.line_no) as txt,
             nullif(sum(l.quantity), 0) as qty
      from public.maintenance_spare_part_lines l
      where l.spare_part_id = v_id and l.deleted_at is null
    ) x
    where p.id = v_id;
  end if;
  return null;
end;
$$;

drop trigger if exists maintenance_work_order_lines_text on public.maintenance_work_order_lines;
create trigger maintenance_work_order_lines_text after insert or update or delete on public.maintenance_work_order_lines
  for each row execute function public.maintenance_lines_text();
drop trigger if exists maintenance_cost_lines_text on public.maintenance_cost_lines;
create trigger maintenance_cost_lines_text after insert or update or delete on public.maintenance_cost_lines
  for each row execute function public.maintenance_lines_text();
drop trigger if exists maintenance_spare_part_lines_text on public.maintenance_spare_part_lines;
create trigger maintenance_spare_part_lines_text after insert or update or delete on public.maintenance_spare_part_lines
  for each row execute function public.maintenance_lines_text();

-- A record saved with text and no lines (records so far, seeds, imports) gets that text as its first line.
create or replace function public.maintenance_text_to_line()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'maintenance_work_orders' then
    if coalesce(trim(new.description), '') <> '' then
      insert into public.maintenance_work_order_lines (company_id, work_order_id, description, created_by)
      values (new.company_id, new.id, new.description, new.created_by);
    end if;
  elsif tg_table_name = 'maintenance_costs' then
    if coalesce(trim(new.activities), '') <> '' then
      insert into public.maintenance_cost_lines (company_id, maintenance_cost_id, description, created_by)
      values (new.company_id, new.id, new.activities, new.created_by);
    end if;
  else
    if coalesce(trim(new.description), '') <> '' then
      insert into public.maintenance_spare_part_lines (company_id, spare_part_id, part, quantity, created_by)
      values (new.company_id, new.id, new.description, coalesce(nullif(new.quantity, 0), 1), new.created_by);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists maintenance_work_orders_text_line on public.maintenance_work_orders;
create trigger maintenance_work_orders_text_line after insert on public.maintenance_work_orders
  for each row execute function public.maintenance_text_to_line();
drop trigger if exists maintenance_costs_text_line on public.maintenance_costs;
create trigger maintenance_costs_text_line after insert on public.maintenance_costs
  for each row execute function public.maintenance_text_to_line();
drop trigger if exists maintenance_spare_parts_text_line on public.maintenance_spare_parts;
create trigger maintenance_spare_parts_text_line after insert on public.maintenance_spare_parts
  for each row execute function public.maintenance_text_to_line();

-- Records so far: their text becomes their first line.
insert into public.maintenance_work_order_lines (company_id, work_order_id, description, created_by, created_at)
select o.company_id, o.id, o.description, o.created_by, o.created_at
from public.maintenance_work_orders o
where coalesce(trim(o.description), '') <> ''
  and not exists (select 1 from public.maintenance_work_order_lines l where l.work_order_id = o.id);

insert into public.maintenance_cost_lines (company_id, maintenance_cost_id, description, created_by, created_at)
select c.company_id, c.id, c.activities, c.created_by, c.created_at
from public.maintenance_costs c
where coalesce(trim(c.activities), '') <> ''
  and not exists (select 1 from public.maintenance_cost_lines l where l.maintenance_cost_id = c.id);

insert into public.maintenance_spare_part_lines (company_id, spare_part_id, part, quantity, created_by, created_at)
select p.company_id, p.id, p.description, coalesce(nullif(p.quantity, 0), 1), p.created_by, p.created_at
from public.maintenance_spare_parts p
where coalesce(trim(p.description), '') <> ''
  and not exists (select 1 from public.maintenance_spare_part_lines l where l.spare_part_id = p.id);

-- ---------------------------------------------------------------------------
-- (2) Invoices: the provider's email, told when the invoice is approved.
-- ---------------------------------------------------------------------------
alter table public.maintenance_invoices add column if not exists provider_email text;

create or replace function public.maintenance_invoice_approved_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(new.provider_email, '')));
  v_company_name text;
  v_reg text;
  v_make_model text;
  v_approver record;
  v_amount text;
begin
  if new.status::text <> 'approved' or old.status::text = 'approved' or new.deleted_at is not null then return null; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  select name into v_company_name from public.companies where id = new.company_id;
  select registration, trim(coalesce(make, '') || ' ' || coalesce(model, '')) into v_reg, v_make_model from public.vehicles where id = new.vehicle_id;
  select full_name, phone, email, job_title into v_approver from public.profiles where id = auth.uid();
  v_amount := 'TZS ' || trim(to_char(coalesce(new.amount_tzs, 0), 'FM999,999,999,990'));
  insert into public.message_outbox (company_id, user_id, channel, recipient, template, data)
  values (new.company_id, null, 'email', v_email, 'invoice_approved', jsonb_build_object(
    'record_table', 'maintenance_invoices',
    'record_id', new.id,
    'name', coalesce(new.service_provider, ''),
    'company', coalesce(v_company_name, ''),
    'invoice', coalesce(new.invoice_number, ''),
    'vehicle', coalesce(v_reg, ''),
    'amount', v_amount,
    'approver', coalesce(v_approver.full_name, ''),
    'approver_contact', concat_ws(', ', nullif(v_approver.job_title, ''), nullif(v_approver.phone, ''), nullif(v_approver.email, '')),
    'details', jsonb_build_array(
      jsonb_build_object('label', 'Invoice', 'value', coalesce(new.invoice_number, '')),
      jsonb_build_object('label', 'Invoice date', 'value', to_char(new.invoice_date, 'DD Mon YYYY')),
      jsonb_build_object('label', 'Vehicle', 'value', coalesce(v_reg, '')),
      jsonb_build_object('label', 'Make and model', 'value', coalesce(v_make_model, '')),
      jsonb_build_object('label', 'Labour', 'value', 'TZS ' || trim(to_char(coalesce(new.labour_tzs, 0), 'FM999,999,999,990'))),
      jsonb_build_object('label', 'Parts', 'value', 'TZS ' || trim(to_char(coalesce(new.parts_tzs, 0), 'FM999,999,999,990'))),
      jsonb_build_object('label', 'Amount approved', 'value', v_amount)
    )));
  return null;
end;
$$;
revoke all on function public.maintenance_invoice_approved_email() from public, anon, authenticated;

drop trigger if exists maintenance_invoices_approved_email on public.maintenance_invoices;
create trigger maintenance_invoices_approved_email after update of status on public.maintenance_invoices
  for each row execute function public.maintenance_invoice_approved_email();
