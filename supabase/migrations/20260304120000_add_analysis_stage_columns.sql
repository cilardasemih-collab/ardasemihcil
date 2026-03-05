ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS processing_stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS stage1_text text,
  ADD COLUMN IF NOT EXISTS stage2_text text,
  ADD COLUMN IF NOT EXISTS stage3_text text;
