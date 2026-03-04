import { createBrowserClient } from "@supabase/ssr";

export function hasSupabasePublicEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabasePublicEnvError() {
  if (hasSupabasePublicEnv()) return null;
  return "NEXT_PUBLIC_SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_ANON_KEY eksik.";
}

export function createClient() {
  if (!hasSupabasePublicEnv()) {
    throw new Error(getSupabasePublicEnvError() ?? "Supabase public env eksik.");
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
