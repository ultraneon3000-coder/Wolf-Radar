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

-- Kurzlebiger Cache für Stichwort-Suchergebnisse (search.list), siehe
-- src/lib/cache.ts getCachedSearch/setCachedSearch. Spart die 100
-- Quota-Einheiten von search.list bei kurz aufeinanderfolgenden,
-- identischen Suchen. Keine eigene TTL-Spalte — Ablauf wird beim Lesen
-- gegen created_at + SEARCH_CACHE_TTL_MS geprüft, ein Treffer wird beim
-- nächsten Schreiben derselben Suche einfach überschrieben (upsert).
create table if not exists search_cache (
  cache_key text primary key,
  video_ids jsonb not null,
  next_page_token text,
  created_at timestamptz not null default now()
);

alter table search_cache enable row level security;
