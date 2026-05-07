alter table public.reports
add column if not exists initial_section_content text,
add column if not exists review_status text not null default 'draft',
add column if not exists last_edited_source text not null default 'ai';

alter table public.user_feedback
add column if not exists report_group_id uuid,
add column if not exists section_key text,
add column if not exists feedback_kind text not null default 'error',
add column if not exists engineer_note text;
