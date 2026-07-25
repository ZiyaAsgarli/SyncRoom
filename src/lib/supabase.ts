import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Vite still needs to render the app for local visual work before credentials exist.
  console.warn("Missing Supabase environment variables. Copy .env.example to .env.local.");
}

export const supabase = createClient<Database>(supabaseUrl ?? "https://example.supabase.co", supabaseAnonKey ?? "anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
