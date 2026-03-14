import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rshmtdylkiaemrdwbfwu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzaG10ZHlsa2lhZW1yZHdiZnd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTQ5NzUsImV4cCI6MjA4NzU5MDk3NX0.ViGJvnrHKGYcjauLX2YWymTqkhc2Wil3v0QhqsjmHuI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const MEDLINK_LOGO_URL =
  "https://rshmtdylkiaemrdwbfwu.supabase.co/storage/v1/object/public/email-assets/medlink-logo.png";

const envBase = (import.meta.env.VITE_PUBLIC_PATIENT_BASE_URL || "").trim();
const fallbackBase =
  typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:5173";

export const PUBLIC_PATIENT_BASE_URL = (envBase || fallbackBase).replace(/\/+$/, "");
