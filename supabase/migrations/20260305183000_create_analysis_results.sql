create extension if not exists pgcrypto;

create table if not exists public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  file_name text not null,
  optimization_method text not null,
  old_total_energy numeric not null,
  new_total_energy numeric not null,
  savings_amount numeric not null,
  ai_report_markdown text not null
);

alter table public.analysis_results enable row level security;

drop policy if exists "analysis_results_public_read" on public.analysis_results;
create policy "analysis_results_public_read"
on public.analysis_results
for select
using (true);

drop policy if exists "analysis_results_public_insert" on public.analysis_results;
create policy "analysis_results_public_insert"
on public.analysis_results
for insert
with check (true);
