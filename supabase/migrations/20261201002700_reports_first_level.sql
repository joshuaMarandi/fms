-- 27: Fleet data reports moves to the first level of the menu (out of Fleet expenses).
-- The key stays the same, so permissions and packages are unchanged.
update public.resources set parent_key = null, label_prefix = '7', icon = 'bar-chart-3', sort_order = 700 where key = 'expenses.reports';
