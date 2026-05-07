alter table public.analysis_results
add column if not exists analysis_payload jsonb;
