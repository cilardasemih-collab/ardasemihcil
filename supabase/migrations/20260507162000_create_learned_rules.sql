create table if not exists public.learned_rules (
  id uuid primary key default gen_random_uuid(),
  rule_description text not null,
  category text not null,
  scope text not null default 'general',
  project_id uuid null references public.projects (id) on delete cascade,
  source_feedback_id uuid null references public.user_feedback (id) on delete set null,
  context_text text not null default '',
  context_vector vector(1536) not null,
  apply_count integer not null default 1,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists learned_rules_category_idx on public.learned_rules (category, scope);
create index if not exists learned_rules_project_idx on public.learned_rules (project_id, scope);

create or replace function public.match_learned_rules(
  query_embedding vector(1536),
  match_count integer default 5,
  target_project_id uuid default null
)
returns table (
  id uuid,
  rule_description text,
  category text,
  scope text,
  project_id uuid,
  apply_count integer,
  similarity double precision
)
language sql
as $$
  select
    learned_rules.id,
    learned_rules.rule_description,
    learned_rules.category,
    learned_rules.scope,
    learned_rules.project_id,
    learned_rules.apply_count,
    1 - (learned_rules.context_vector <=> query_embedding) as similarity
  from public.learned_rules
  where learned_rules.scope = 'general'
     or (target_project_id is not null and learned_rules.project_id = target_project_id)
  order by learned_rules.context_vector <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table public.learned_rules enable row level security;

drop policy if exists "Authenticated users can read learned rules" on public.learned_rules;
create policy "Authenticated users can read learned rules"
on public.learned_rules
for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert learned rules" on public.learned_rules;
create policy "Authenticated users can insert learned rules"
on public.learned_rules
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update learned rules" on public.learned_rules;
create policy "Authenticated users can update learned rules"
on public.learned_rules
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
