-- Run this once in Supabase SQL Editor if CLI `supabase db push` cannot be used.
-- It removes the exact Security Advisor warnings for legacy analysis tables
-- and the raw-files storage bucket.

-- RLS Policy Always True: remove broad analysis_results policies.
drop policy if exists "analysis_results_public_insert" on public.analysis_results;
drop policy if exists "analysis_results_public_read" on public.analysis_results;

alter table public.analysis_results enable row level security;
alter table public.analysis_results
add column if not exists user_id uuid references auth.users (id) on delete cascade;

drop policy if exists "analysis_results_authenticated_insert" on public.analysis_results;
drop policy if exists "analysis_results_authenticated_read" on public.analysis_results;

create policy "analysis_results_authenticated_insert"
on public.analysis_results
for insert
to authenticated
with check (user_id = auth.uid());

create policy "analysis_results_authenticated_read"
on public.analysis_results
for select
to authenticated
using (user_id = auth.uid());

-- Public Bucket Allows Listing: make raw-files private and remove broad list policy.
insert into storage.buckets (id, name, public)
values ('raw-files', 'raw-files', false)
on conflict (id) do update set public = false;

drop policy if exists "raw_files_public_read" on storage.objects;
drop policy if exists "raw_files_authenticated_read" on storage.objects;
drop policy if exists "raw_files_authenticated_read_own" on storage.objects;

create policy "raw_files_authenticated_read_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'raw-files' and auth.uid() = owner);

-- GraphQL/PostgREST exposure: revoke direct table access from public roles.
revoke all on table public.analysis_jobs from anon;
revoke all on table public.analysis_jobs from authenticated;
revoke all on table public.analysis_results from anon;
revoke all on table public.analysis_results from authenticated;
revoke all on table public.processed_data from anon;
revoke all on table public.processed_data from authenticated;

-- Keep server-side API access intact. Service role bypasses RLS and is not affected.
grant usage on schema public to service_role;
grant all on table public.analysis_jobs to service_role;
grant all on table public.analysis_results to service_role;
grant all on table public.processed_data to service_role;
