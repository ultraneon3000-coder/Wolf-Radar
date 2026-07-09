import { createClient } from "@supabase/supabase-js";

// Server-only Client mit dem Service-Role-Key (umgeht RLS) — darf NIE in
// Client-Code importiert werden. Genutzt für den persistenten Urteil-Cache
// (siehe cache.ts), da Vercel kein persistentes Dateisystem hat.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY fehlen in der Umgebung.");
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
