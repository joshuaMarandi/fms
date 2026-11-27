-- Company HSE document "Motor Vehicle Crash Categories":
-- (1) Each crash (not a near miss) has a category and subcategory:
--       C catastrophic: company/contractor fatality, permanent impairment injury, third-party fatality
--       M major:        lost workday case, vehicle rollover
--       S serious:      recordable injury (medical treatment or restricted workday)
--       O other:        minor injury (first aid), disabling damage, any other crash
--     The category follows the subcategory. Crash rates (MVCR) use the km driven in the km logs.
-- (2) Training matrix: drivers have driver categories (light vehicle, 4WD / off-road, bus / crew,
--     heavy truck, fuel / HazMat tanker); the trainings are the nine of the matrix, plus first aid.
--     A training's refresher date comes from its validity (done once: no refresher).

-- ---------------------------------------------------------------------------
-- (1)
-- ---------------------------------------------------------------------------
alter table public.incidents add column if not exists crash_subcategory text;
alter table public.incidents add column if not exists crash_category text;
alter table public.incidents drop constraint if exists incidents_crash_subcategory_check;
alter table public.incidents add constraint incidents_crash_subcategory_check check (crash_subcategory is null or crash_subcategory in
  ('c_fatality', 'c_permanent_impairment', 'c_third_party_fatality', 'm_lost_workday', 'm_rollover', 's_recordable',
   'o_first_aid', 'o_disabling_damage', 'o_other'));
alter table public.incidents drop constraint if exists incidents_crash_category_check;
alter table public.incidents add constraint incidents_crash_category_check check (crash_category is null or crash_category in ('C', 'M', 'S', 'O'));

create or replace function public.incidents_crash_category()
returns trigger language plpgsql as $$
begin
  if new.incident_type = 'near_miss' then
    new.crash_subcategory := null;
  end if;
  new.crash_category := case left(coalesce(new.crash_subcategory, ''), 1)
    when 'c' then 'C' when 'm' then 'M' when 's' then 'S' when 'o' then 'O' end;
  return new;
end;
$$;
drop trigger if exists incidents_crash_category on public.incidents;
create trigger incidents_crash_category before insert or update on public.incidents
  for each row execute function public.incidents_crash_category();

-- Crashes so far: a fatality is catastrophic; the others are left for the user to classify.
update public.incidents set crash_subcategory = 'c_fatality'
where incident_type = 'accident' and crash_subcategory is null and coalesce(fatalities_count, 0) > 0;

-- ---------------------------------------------------------------------------
-- (2)
-- ---------------------------------------------------------------------------
alter table public.drivers add column if not exists driver_categories text[] not null default '{}';
alter table public.drivers drop constraint if exists drivers_driver_categories_check;
alter table public.drivers add constraint drivers_driver_categories_check
  check (driver_categories <@ array['light_vehicle', 'four_wd', 'bus', 'hgv', 'tanker']::text[]);

-- Induction is the company HSE and life-saving rules induction.
alter table public.mandatory_trainings drop constraint if exists mandatory_trainings_courses_check;
update public.mandatory_trainings set courses = array_replace(courses, 'induction', 'hse_induction') where 'induction' = any (courses);
alter table public.mandatory_trainings add constraint mandatory_trainings_courses_check
  check (courses <@ array['hse_induction', 'defensive_driving', 'journey_fatigue', 'pretrip_ivms', 'off_road', 'passenger_rollover',
                          'load_securement', 'dangerous_goods', 'loading_fire', 'first_aid']::text[]);

create or replace function public.training_validity_months(p_course text)
returns integer language sql immutable as $$
  select case p_course
    when 'hse_induction' then null
    when 'passenger_rollover' then 24
    when 'dangerous_goods' then 24
    when 'first_aid' then 24
    when 'defensive_driving' then 12 when 'journey_fatigue' then 12 when 'pretrip_ivms' then 12
    when 'off_road' then 12 when 'load_securement' then 12 when 'loading_fire' then 12 end;
$$;

-- The refresher date: the soonest of the courses done (one done once has none).
create or replace function public.mandatory_trainings_refresher()
returns trigger language plpgsql as $$
declare
  v_months integer;
begin
  -- Kept as it is unless the courses or the date change (dates typed before stay).
  if tg_op = 'UPDATE' and new.courses is not distinct from old.courses and new.date_completed is not distinct from old.date_completed then
    return new;
  end if;
  select min(public.training_validity_months(c)) into v_months from unnest(coalesce(new.courses, '{}')) c;
  new.refresher_date := case when new.date_completed is not null and v_months is not null
    then (new.date_completed + make_interval(months => v_months))::date end;
  new.no_expiry := v_months is null;
  return new;
end;
$$;
drop trigger if exists mandatory_trainings_refresher on public.mandatory_trainings;
create trigger mandatory_trainings_refresher before insert or update on public.mandatory_trainings
  for each row execute function public.mandatory_trainings_refresher();

-- Trainings so far with no refresher date get one from the validity (typed dates stay).
update public.mandatory_trainings t set refresher_date = (t.date_completed + make_interval(months => x.months))::date
from (select m.id, min(public.training_validity_months(c)) as months from public.mandatory_trainings m, unnest(m.courses) c group by m.id) x
where x.id = t.id and t.refresher_date is null and t.date_completed is not null and x.months is not null and t.deleted_at is null;
