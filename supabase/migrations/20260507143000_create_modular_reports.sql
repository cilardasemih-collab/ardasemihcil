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
  section_summary text,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists reports_scenario_group_idx
on public.reports (scenario_id, report_group_id, section_order);

create unique index if not exists reports_group_section_unique_idx
on public.reports (report_group_id, section_key);

alter table public.reports enable row level security;

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
