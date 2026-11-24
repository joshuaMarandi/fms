-- Spare parts: each line has its cost (part, quantity, cost each), and the record's total cost is the
-- sum of the lines (quantity x cost), worked out, not typed. Records whose lines have no cost yet
-- keep the total they had.

alter table public.maintenance_spare_part_lines add column if not exists unit_cost_tzs numeric(14,2);
alter table public.maintenance_spare_part_lines drop constraint if exists maintenance_spare_part_lines_cost_check;
alter table public.maintenance_spare_part_lines add constraint maintenance_spare_part_lines_cost_check check (unit_cost_tzs is null or unit_cost_tzs >= 0);

-- Lines -> the record's text, quantity and (once lines have costs) its total cost.
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
      quantity = coalesce(x.qty, p.quantity),
      cost_tzs = case when x.costed then x.total else p.cost_tzs end
    from (
      select string_agg(l.part || ' × ' || rtrim(to_char(l.quantity, 'FM999,999,990.99'), '.'), E'\n' order by l.line_no) as txt,
             nullif(sum(l.quantity), 0) as qty,
             bool_or(l.unit_cost_tzs is not null) as costed,
             round(coalesce(sum(l.quantity * coalesce(l.unit_cost_tzs, 0)), 0), 2) as total
      from public.maintenance_spare_part_lines l
      where l.spare_part_id = v_id and l.deleted_at is null
    ) x
    where p.id = v_id;
  end if;
  return null;
end;
$$;

-- A record saved with text and no lines (seeds, imports) gets that text as its first line, with its
-- unit price as the line's cost.
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
      insert into public.maintenance_spare_part_lines (company_id, spare_part_id, part, quantity, unit_cost_tzs, created_by)
      values (new.company_id, new.id, new.description, coalesce(nullif(new.quantity, 0), 1),
        case when coalesce(new.unit_price_tzs, 0) > 0 then new.unit_price_tzs
             when coalesce(new.cost_tzs, 0) > 0 then round(new.cost_tzs / coalesce(nullif(new.quantity, 0), 1), 2) end,
        new.created_by);
    end if;
  end if;
  return null;
end;
$$;

-- Records so far with one line: that line's cost is the record's cost per unit.
update public.maintenance_spare_part_lines l set unit_cost_tzs = round(p.cost_tzs / l.quantity, 2)
from public.maintenance_spare_parts p
where p.id = l.spare_part_id and l.unit_cost_tzs is null and l.deleted_at is null and coalesce(p.cost_tzs, 0) > 0 and l.quantity > 0
  and (select count(*) from public.maintenance_spare_part_lines x where x.spare_part_id = p.id and x.deleted_at is null) = 1
  and round(round(p.cost_tzs / l.quantity, 2) * l.quantity, 2) = p.cost_tzs;
