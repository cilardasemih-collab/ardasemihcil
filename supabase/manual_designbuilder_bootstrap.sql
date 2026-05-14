-- Run this once in Supabase SQL Editor when the DesignBuilder workspace tables
-- are missing and CLI `supabase db push` is not available.

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete cascade,
  name text not null,
  location text,
  climate_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  u_values jsonb not null default '{}'::jsonb,
  total_energy_consumption double precision,
  cost_estimate numeric(12, 2),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.simulation_data (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  timestamp timestamptz not null,
  zone_name text not null,
  air_temperature double precision,
  heating_load double precision,
  cooling_load double precision,
  humidity double precision
);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  report_group_id uuid,
  section_key text,
  error_type text not null,
  feedback_kind text not null default 'error',
  original_text text not null,
  corrected_text text,
  engineer_note text,
  ai_interpretation text,
  resolved boolean not null default false
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_group_id uuid not null,
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  language text not null default 'tr',
  report_title text not null,
  section_key text not null,
  section_title text not null,
  section_order integer not null,
  status text not null default 'pending',
  section_content text not null default '',
  initial_section_content text,
  section_summary text,
  review_status text not null default 'draft',
  last_edited_source text not null default 'ai',
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists projects_user_id_idx on public.projects (user_id, created_at desc);
create index if not exists scenarios_project_id_idx on public.scenarios (project_id, created_at desc);
create index if not exists simulation_data_scenario_id_idx on public.simulation_data (scenario_id, timestamp);
create index if not exists user_feedback_resolved_idx on public.user_feedback (resolved);
create index if not exists reports_scenario_group_idx on public.reports (scenario_id, report_group_id, section_order);
create unique index if not exists reports_group_section_unique_idx on public.reports (report_group_id, section_key);

alter table public.projects enable row level security;
alter table public.scenarios enable row level security;
alter table public.simulation_data enable row level security;
alter table public.user_feedback enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Users can manage own projects" on public.projects;
create policy "Users can manage own projects"
on public.projects
for all
using (user_id is null or auth.uid() = user_id)
with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can manage scenarios in own projects" on public.scenarios;
create policy "Users can manage scenarios in own projects"
on public.scenarios
for all
using (
  exists (
    select 1
    from public.projects
    where projects.id = scenarios.project_id
      and (projects.user_id is null or projects.user_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.projects
    where projects.id = scenarios.project_id
      and (projects.user_id is null or projects.user_id = auth.uid())
  )
);

drop policy if exists "Users can manage simulation rows in own scenarios" on public.simulation_data;
create policy "Users can manage simulation rows in own scenarios"
on public.simulation_data
for all
using (
  exists (
    select 1
    from public.scenarios
    join public.projects on projects.id = scenarios.project_id
    where scenarios.id = simulation_data.scenario_id
      and (projects.user_id is null or projects.user_id = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    join public.projects on projects.id = scenarios.project_id
    where scenarios.id = simulation_data.scenario_id
      and (projects.user_id is null or projects.user_id = auth.uid())
  )
);

drop policy if exists "Authenticated users can read and resolve feedback" on public.user_feedback;
create policy "Authenticated users can read and resolve feedback"
on public.user_feedback
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read reports" on public.reports;
create policy "Authenticated users can read reports"
on public.reports
for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert reports" on public.reports;
create policy "Authenticated users can insert reports"
on public.reports
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update reports" on public.reports;
create policy "Authenticated users can update reports"
on public.reports
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

grant usage on schema public to service_role;
grant all on table public.projects to service_role;
grant all on table public.scenarios to service_role;
grant all on table public.simulation_data to service_role;
grant all on table public.user_feedback to service_role;
grant all on table public.reports to service_role;
