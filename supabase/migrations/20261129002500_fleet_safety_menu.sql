-- 25: "Fleet safety" on the first level of the menu, holding: Daily pre-start inspection,
-- Mobilization inspection (added by the app), Third-party inspection, Mandatory training records,
-- Toolbox talks, Training matrix, Incident and accident records, and Safety reports.
-- Keys stay the same (permissions use them); only parents, names, paths and order change.
-- The old first-level Inspections, Toolbox talks, Toolbox matrix and Safety leave the menu.

insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('fleet_safety', null, 'Fleet safety', '3', null, 'shield', 300, true, false)
on conflict (key) do update set parent_key = null, name = excluded.name, label_prefix = excluded.label_prefix, path = null, icon = excluded.icon, sort_order = excluded.sort_order;

update public.resources set parent_key = 'fleet_safety', sort_order = 301 where key = 'inspections.daily';
update public.resources set parent_key = 'fleet_safety', sort_order = 303 where key = 'inspections.third_party';
update public.resources set parent_key = 'fleet_safety', sort_order = 304, path = '/expenses/trainings/mandatory' where key = 'expenses.trainings.mandatory';
update public.resources set parent_key = 'fleet_safety', sort_order = 305, label_prefix = null, icon = null where key = 'expenses.trainings.toolbox';
update public.resources set parent_key = 'fleet_safety', sort_order = 306, label_prefix = null, icon = null, name = 'Training matrix' where key = 'expenses.trainings.matrix';
update public.resources set parent_key = 'fleet_safety', sort_order = 307 where key = 'expenses.safety.incidents';
update public.resources set parent_key = 'fleet_safety', sort_order = 308 where key = 'expenses.safety.reports';

-- The old groups keep their permissions (they cover the pages under them) but leave the menu.
update public.resources set path = null where key in ('inspections', 'expenses.safety');
