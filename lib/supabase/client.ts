import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Client Supabase côté navigateur.
 * Utiliser dans les composants 'use client' et les hooks.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
