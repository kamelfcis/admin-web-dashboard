import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL =
  "https://rshmtdylkiaemrdwbfwu.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzaG10ZHlsa2lhZW1yZHdiZnd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTQ5NzUsImV4cCI6MjA4NzU5MDk3NX0.ViGJvnrHKGYcjauLX2YWymTqkhc2Wil3v0QhqsjmHuI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // This dashboard uses email/password login, so URL session parsing is unnecessary.
    detectSessionInUrl: false,
  },
});
