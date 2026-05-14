-- Harden legacy analysis tables/storage against Supabase security lint warnings.
-- These resources are accessed through server routes with the service role key,
-- so anon/authenticated direct table access is intentionally removed.

-- 1. Remove old permissive public policies if they still exist remotely.
drop policy if exists "analysis_results_public_insert" on public.analysis_results;
drop policy if exists "analysis_results_public_read" on public.analysis_results;

-- 2. Keep analysis_results private to callers unless they own rows.
alter table public.analysis_results
add column if not exists user_id uuid references auth.users (id) on delete cascade;

drop policy if exists "analysis_results_authenticated_insert" on public.analysis_results;
create policy "analysis_results_authenticated_insert"
on public.analysis_results
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "analysis_results_authenticated_read" on public.analysis_results;
create policy "analysis_results_authenticated_read"
on public.analysis_results
for select
to authenticated
using (user_id = auth.uid());

-- 3. raw-files must not be publicly listable.
insert into storage.buckets (id, name, public)
values ('raw-files', 'raw-files', false)
on conflict (id) do update set public = false;

drop policy if exists "raw_files_public_read" on storage.objects;
drop policy if exists "raw_files_authenticated_read" on storage.objects;
create policy "raw_files_authenticated_read_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'raw-files' and auth.uid() = owner);

-- 4. Hide legacy tables from PostgREST/GraphQL direct access.
revoke select on table public.analysis_jobs from anon;
revoke select on table public.analysis_jobs from authenticated;
revoke select on table public.analysis_results from anon;
revoke select on table public.analysis_results from authenticated;
revoke select on table public.processed_data from anon;
revoke select on table public.processed_data from authenticated;
