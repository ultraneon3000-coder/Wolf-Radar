-- Persistenter Urteil-Cache (ersetzt .cache/urteile.json, siehe src/lib/cache.ts).
-- Grund: Vercel hat kein persistentes Dateisystem — ein lokaler JSON-Store
-- überlebt dort keinen Deploy/Cold-Start.
create table if not exists urteil_cache (
  video_id text primary key,
  urteil jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS an, aber ohne Policies: nur der service_role-Key (umgeht RLS) darf
-- lesen/schreiben, siehe src/lib/supabase.ts. Schützt die Tabelle falls
-- versehentlich mal der anon-Key verwendet wird.
alter table urteil_cache enable row level security;
