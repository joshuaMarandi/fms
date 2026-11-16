-- 20: The daily inspection is called "pre-start" (not "pre-trip") everywhere.
update public.resources set name = 'Daily pre-start inspection' where key = 'inspections.daily';
