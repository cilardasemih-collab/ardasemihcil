create table if not exists public.designbuilder_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  project_id uuid null references public.projects (id) on delete set null,
  project_name text,
  result_type text not null default 'comparison',
  title text not null,
  winner_scenario_id uuid null references public.scenarios (id) on delete set null,
  winner_scenario_name text,
  scenario_ids uuid[] not null default '{}'::uuid[],
  result_payload jsonb not null default '{}'::jsonb
);

create index if not exists designbuilder_results_created_at_idx
on public.designbuilder_results (created_at desc);

create index if not exists designbuilder_results_project_idx
on public.designbuilder_results (project_id, created_at desc);

alter table public.designbuilder_results enable row level security;

drop policy if exists "Authenticated users can read designbuilder results" on public.designbuilder_results;
create policy "Authenticated users can read designbuilder results"
on public.designbuilder_results
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert designbuilder results" on public.designbuilder_results;
create policy "Authenticated users can insert designbuilder results"
on public.designbuilder_results
for insert
to authenticated
with check (true);

grant all on table public.designbuilder_results to service_role;
