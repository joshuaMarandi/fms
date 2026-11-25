-- Incidents: each record is an accident or a near miss (records so far are accidents). The list
-- counts both, with the injuries and fatalities.
alter table public.incidents add column if not exists incident_type text not null default 'accident';
alter table public.incidents drop constraint if exists incidents_incident_type_check;
alter table public.incidents add constraint incidents_incident_type_check check (incident_type in ('accident', 'near_miss'));
create index if not exists incidents_type_idx on public.incidents (company_id, incident_type) where deleted_at is null;
