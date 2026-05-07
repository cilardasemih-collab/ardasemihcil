-- Fix RLS policies to enforce proper security

-- 1. Fix analysis_results - remove overly permissive INSERT policy
DROP POLICY IF EXISTS "analysis_results_public_insert" ON public.analysis_results;

-- 2. Make analysis_results require authenticated user ownership
ALTER TABLE public.analysis_results ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create proper authenticated-only INSERT policy for analysis_results
CREATE POLICY "analysis_results_authenticated_insert"
ON public.analysis_results
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Update SELECT policy to require user ownership
DROP POLICY IF EXISTS "analysis_results_public_read" ON public.analysis_results;
CREATE POLICY "analysis_results_authenticated_read"
ON public.analysis_results
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Fix raw-files bucket - remove public listing
INSERT INTO storage.buckets (id, name, public)
VALUES ('raw-files', 'raw-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Remove broad SELECT policy on raw-files
DROP POLICY IF EXISTS "raw_files_public_read" ON storage.objects;

-- Allow authenticated users to read their own files
CREATE POLICY "raw_files_authenticated_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'raw-files' AND auth.uid() = owner);

-- 4. Revoke public access to sensitive tables in GraphQL schema
-- These are handled via RLS but we should ensure auth.users table doesn't leak user data
REVOKE SELECT ON public.analysis_jobs FROM anon;
REVOKE SELECT ON public.analysis_results FROM anon;
REVOKE SELECT ON public.processed_data FROM anon;

-- Keep authenticated access but with RLS enforcement
GRANT SELECT ON public.analysis_jobs TO authenticated;
GRANT SELECT ON public.analysis_results TO authenticated;
GRANT SELECT ON public.processed_data TO authenticated;
