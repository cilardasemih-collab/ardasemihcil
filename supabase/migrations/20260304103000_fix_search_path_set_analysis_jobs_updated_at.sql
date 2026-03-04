-- Fix: Function Search Path Mutable
ALTER FUNCTION public.set_analysis_jobs_updated_at()
  SET search_path = public, pg_temp;
