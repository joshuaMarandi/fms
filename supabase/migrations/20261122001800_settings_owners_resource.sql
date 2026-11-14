-- 18: "System owners" in the owner's Settings menu. Only owners can open it (the page checks the role);
-- company admins never see it, even though they have view on Settings.
insert into public.resources (key, parent_key, name, label_prefix, path, icon, sort_order, has_reminders, is_request) values
  ('settings.owners', 'settings', 'System owners', null, '/settings/owners', 'shield', 907, false, false)
on conflict (key) do update set
  parent_key = excluded.parent_key, name = excluded.name, path = excluded.path, icon = excluded.icon, sort_order = excluded.sort_order;
