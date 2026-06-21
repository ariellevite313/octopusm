/**
 * Supabase client singleton
 * Utilise les variables d'environnement Vite
 * Ajouter dans .env.local :
 *   VITE_SUPABASE_URL=https://xxxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 */
import { createClient } from "@supabase/supabase-js";
// NOTE: <Database> generic is intentionally omitted from createClient.
// Supabase v2.108+ complex schema inference resolves all operations to `never`
// when the Database type is passed. Type safety is enforced by explicit return
// type annotations in each service file (wallet-service.ts, etc.).

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "[Supabase] VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont requis dans .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type SupabaseClient = typeof supabase;
