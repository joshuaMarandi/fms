-- (1) Mandatory trainings: the four mandatory courses are Defensive driving (DDT), Safety and
--     security awareness (induction), First aid and Off-road driving. 4WD operation becomes off-road
--     driving; fatigue management and night driving are no longer mandatory courses. Every training
--     has a refresher date (no "no expiry" any more); the cost is no longer kept in the app.
-- (2) Toolbox talks: each talk has topics, and each topic its subtopics. Subtopics are ticked as
--     covered; a topic is covered only when every subtopic is (a topic with none is ticked itself).
--     The proof (attendance sheet, photos) is attached to each topic.

-- ---------------------------------------------------------------------------
-- (1)
-- ---------------------------------------------------------------------------
update public.mandatory_trainings m set courses = x.courses
from (
  select t.id, coalesce(array_agg(distinct c order by c) filter (where c is not null), '{}') as courses
  from public.mandatory_trainings t
  left join lateral (
    select case u when 'four_wd' then 'off_road' when 'defensive_driving' then 'defensive_driving'
                  when 'induction' then 'induction' when 'first_aid' then 'first_aid' when 'off_road' then 'off_road' end as c
    from unnest(t.courses) u
  ) z on true
  group by t.id
) x
where m.id = x.id and m.courses is distinct from x.courses;

update public.mandatory_trainings set no_expiry = false where no_expiry;

alter table public.mandatory_trainings drop constraint if exists mandatory_trainings_courses_check;
alter table public.mandatory_trainings add constraint mandatory_trainings_courses_check
  check (courses <@ array['defensive_driving', 'induction', 'first_aid', 'off_road']::text[]);

-- ---------------------------------------------------------------------------
-- (2) Topics and subtopics
-- ---------------------------------------------------------------------------
create table if not exists public.toolbox_topics (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  plan_id uuid not null references public.toolbox_plans(id) on delete cascade,
  title text not null check (trim(title) <> ''),
  -- The subtopics as typed on the form, one per line (the lines below are kept from it).
  subtopics_text text,
  covered boolean not null default false,
  covered_at timestamptz,
  covered_by uuid
);

create table if not exists public.toolbox_subtopics (
  id uuid primary key default gen_random_uuid(),
  line_no bigint generated always as identity,
  company_id uuid not null references public.companies(id),
  topic_id uuid not null references public.toolbox_topics(id) on delete cascade,
  title text not null check (trim(title) <> ''),
  covered boolean not null default false,
  covered_at timestamptz,
  covered_by uuid
);

do $$
declare
  t text;
  fk text;
begin
  foreach t in array array['toolbox_topics', 'toolbox_subtopics'] loop
    fk := case t when 'toolbox_topics' then 'plan_id' else 'topic_id' end;
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
  ('toolbox_topics', 'expenses.trainings.toolbox', 'toolbox_plans', 'plan_id', false),
  ('toolbox_subtopics', 'expenses.trainings.toolbox', 'toolbox_topics', 'topic_id', false)
on conflict (table_name) do update set resource_key = excluded.resource_key, parent_table = excluded.parent_table, parent_fk = excluded.parent_fk, is_request = excluded.is_request;

select public.apply_standard_rls('toolbox_topics', 'expenses.trainings.toolbox');
select public.apply_standard_rls('toolbox_subtopics', 'expenses.trainings.toolbox');

-- The plan's text is its topics' titles (lists, search, the training matrix).
alter table public.toolbox_plans alter column topics drop not null;

create or replace function public.toolbox_plan_text(p_plan uuid)
returns void language sql security definer set search_path = public as $$
  update public.toolbox_plans p set topics = (
    select string_agg(t.title, E'\n' order by t.line_no) from public.toolbox_topics t where t.plan_id = p_plan and t.deleted_at is null)
  where p.id = p_plan;
$$;

-- A topic is covered when every subtopic is (a topic with no subtopics keeps its own tick).
create or replace function public.toolbox_topic_refresh(p_topic uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_done int;
begin
  select count(*), count(*) filter (where covered) into v_total, v_done
  from public.toolbox_subtopics where topic_id = p_topic and deleted_at is null;
  if v_total > 0 then
    update public.toolbox_topics set
      covered = (v_done = v_total),
      covered_at = case when v_done = v_total then coalesce(covered_at, now()) end,
      covered_by = case when v_done = v_total then coalesce(covered_by, auth.uid()) end
    where id = p_topic and covered is distinct from (v_done = v_total);
  end if;
end;
$$;

-- Subtopics from the typed lines: new lines are added, lines taken out are removed, and lines kept
-- keep their tick.
create or replace function public.toolbox_topics_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_line text;
  v_lines text[];
begin
  if tg_op = 'DELETE' then
    perform public.toolbox_plan_text(old.plan_id);
    return null;
  end if;
  if tg_op = 'INSERT' or new.subtopics_text is distinct from old.subtopics_text then
    select coalesce(array_agg(distinct trim(x)), '{}') into v_lines
    from regexp_split_to_table(coalesce(new.subtopics_text, ''), E'\n') x where trim(x) <> '';
    -- Lines taken out are removed (not soft deleted: the typed text is what the person changed).
    delete from public.toolbox_subtopics
    where topic_id = new.id and not (lower(title) = any (select lower(l) from unnest(v_lines) l));
    for v_line in select trim(x) from regexp_split_to_table(coalesce(new.subtopics_text, ''), E'\n') x where trim(x) <> '' loop
      if not exists (select 1 from public.toolbox_subtopics where topic_id = new.id and deleted_at is null and lower(title) = lower(v_line)) then
        insert into public.toolbox_subtopics (company_id, topic_id, title, created_by) values (new.company_id, new.id, v_line, new.created_by);
      end if;
    end loop;
    perform public.toolbox_topic_refresh(new.id);
  end if;
  if tg_op = 'INSERT' or new.title is distinct from old.title or new.deleted_at is distinct from old.deleted_at then
    perform public.toolbox_plan_text(new.plan_id);
  end if;
  return null;
end;
$$;
drop trigger if exists toolbox_topics_sync on public.toolbox_topics;
create trigger toolbox_topics_sync after insert or update of subtopics_text, title, deleted_at or delete on public.toolbox_topics
  for each row execute function public.toolbox_topics_sync();

create or replace function public.toolbox_subtopics_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.toolbox_topic_refresh(coalesce(new.topic_id, old.topic_id));
  return null;
end;
$$;
drop trigger if exists toolbox_subtopics_after on public.toolbox_subtopics;
create trigger toolbox_subtopics_after after insert or update of covered, deleted_at or delete on public.toolbox_subtopics
  for each row execute function public.toolbox_subtopics_after();

-- Ticking: a subtopic, or a whole topic (all its subtopics, or the topic itself when it has none).
-- Whoever may record toolbox talks (create or edit) may tick.
create or replace function public.toolbox_cover(p_kind text, p_id uuid, p_covered boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_topic uuid;
begin
  if not (public.is_owner() or public.has_permission('expenses.trainings.toolbox', 'create') or public.has_permission('expenses.trainings.toolbox', 'edit')) then
    raise exception 'You cannot mark toolbox talks as covered' using errcode = '42501', hint = 'permission_denied';
  end if;
  if p_kind = 'subtopic' then
    select s.company_id, s.topic_id into v_company, v_topic from public.toolbox_subtopics s where s.id = p_id and s.deleted_at is null;
  elsif p_kind = 'topic' then
    select t.company_id, t.id into v_company, v_topic from public.toolbox_topics t where t.id = p_id and t.deleted_at is null;
  else
    raise exception 'Unknown kind %', p_kind using errcode = '22023';
  end if;
  if v_topic is null or (v_company is distinct from public.my_company_id() and not public.is_owner()) then
    raise exception 'Not found' using errcode = 'P0002', hint = 'not_found';
  end if;

  if p_kind = 'subtopic' then
    update public.toolbox_subtopics set covered = p_covered,
      covered_at = case when p_covered then now() end, covered_by = case when p_covered then auth.uid() end
    where id = p_id;
  elsif exists (select 1 from public.toolbox_subtopics where topic_id = v_topic and deleted_at is null) then
    update public.toolbox_subtopics set covered = p_covered,
      covered_at = case when p_covered then coalesce(covered_at, now()) end, covered_by = case when p_covered then coalesce(covered_by, auth.uid()) end
    where topic_id = v_topic and deleted_at is null and covered is distinct from p_covered;
  else
    update public.toolbox_topics set covered = p_covered,
      covered_at = case when p_covered then now() end, covered_by = case when p_covered then auth.uid() end
    where id = v_topic;
  end if;
  return p_covered;
end;
$$;
revoke all on function public.toolbox_cover(text, uuid, boolean) from public, anon;
grant execute on function public.toolbox_cover(text, uuid, boolean) to authenticated;

-- Talks so far: each line of their topics becomes a topic (no subtopics yet).
insert into public.toolbox_topics (company_id, plan_id, title, created_by, deleted_at)
select p.company_id, p.id, trim(x), p.created_by, p.deleted_at
from public.toolbox_plans p
cross join lateral regexp_split_to_table(coalesce(p.topics, ''), E'\n') with ordinality as l(x, n)
where trim(x) <> '' and not exists (select 1 from public.toolbox_topics t where t.plan_id = p.id)
order by p.id, l.n;

-- A talk saved with text and no topics (seeds, imports) gets its lines as topics.
create or replace function public.toolbox_plans_text_to_topics()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.topics), '') = '' or exists (select 1 from public.toolbox_topics where plan_id = new.id) then return null; end if;
  insert into public.toolbox_topics (company_id, plan_id, title, created_by)
  select new.company_id, new.id, trim(x), new.created_by
  from regexp_split_to_table(new.topics, E'\n') with ordinality as l(x, n) where trim(x) <> '' order by l.n;
  return null;
end;
$$;
drop trigger if exists toolbox_plans_text_to_topics on public.toolbox_plans;
create trigger toolbox_plans_text_to_topics after insert on public.toolbox_plans
  for each row execute function public.toolbox_plans_text_to_topics();
