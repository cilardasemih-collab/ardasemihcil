create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
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
  error_type text not null,
  original_text text not null,
  corrected_text text,
  ai_interpretation text,
  resolved boolean not null default false
);

create index if not exists projects_user_id_idx on public.projects (user_id, created_at desc);
create index if not exists scenarios_project_id_idx on public.scenarios (project_id, created_at desc);
create index if not exists simulation_data_scenario_id_idx on public.simulation_data (scenario_id, timestamp);
create index if not exists user_feedback_resolved_idx on public.user_feedback (resolved);

alter table public.projects enable row level security;
alter table public.scenarios enable row level security;
alter table public.simulation_data enable row level security;
alter table public.user_feedback enable row level security;

create policy "Users can manage own projects"
on public.projects
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage scenarios in own projects"
on public.scenarios
for all
using (
  exists (
    select 1
    from public.projects
    where projects.id = scenarios.project_id
      and projects.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects
    where projects.id = scenarios.project_id
      and projects.user_id = auth.uid()
  )
);

create policy "Users can manage simulation rows in own scenarios"
on public.simulation_data
for all
using (
  exists (
    select 1
    from public.scenarios
    join public.projects on projects.id = scenarios.project_id
    where scenarios.id = simulation_data.scenario_id
      and projects.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.scenarios
    join public.projects on projects.id = scenarios.project_id
    where scenarios.id = simulation_data.scenario_id
      and projects.user_id = auth.uid()
  )
);

create policy "Authenticated users can read and resolve feedback"
on public.user_feedback
for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
