create extension if not exists vector;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists documents_metadata_source_idx on public.documents using gin (metadata);

create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count integer default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity double precision
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from public.documents
  where documents.metadata @> filter
  order by documents.embedding <=> query_embedding
  limit greatest(match_count, 1);
end;
$$;

alter table public.documents enable row level security;

drop policy if exists "Authenticated users can read documents" on public.documents;
create policy "Authenticated users can read documents"
on public.documents
for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert documents" on public.documents;
create policy "Authenticated users can insert documents"
on public.documents
for insert
with check (auth.role() = 'authenticated');
