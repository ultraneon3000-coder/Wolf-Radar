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

-- Manuell überschriebenes Gesamturteil (siehe src/lib/cache.ts
-- getUrteilOverrides/setUrteilOverride/removeUrteilOverride) — bewusst eine
-- eigene Tabelle statt eines Felds in urteil_cache, damit Claudes Original-
-- Urteil unangetastet bleibt und ein Zurücksetzen einfach "Zeile löschen" ist.
create table if not exists urteil_override (
  video_id text primary key,
  gesamturteil text not null,
  notiz text,
  created_at timestamptz not null default now()
);

alter table urteil_override enable row level security;

-- Von Wolf gespeicherte Kanäle für den "Nur meine Kanäle"-Suchmodus (siehe
-- src/lib/cache.ts listChannels/addChannel/removeChannel, api/channels/route.ts).
-- Ersetzt den früheren lokalen JSON-Store (.cache/kanaele.json) — der
-- überlebte auf Vercel keinen Deploy/Cold-Start bzw. war für andere
-- Serverless-Instanzen unsichtbar, siehe Diagnose vom Fabian-Kowalik-Bug.
create table if not exists channels (
  channel_id text primary key,
  title text not null,
  thumbnail text not null default '',
  created_at timestamptz not null default now()
);

alter table channels enable row level security;

-- Favoriten: von Wolf angesternte Videos, als vollständiger Snapshot (siehe
-- src/lib/cache.ts listFavorites/addFavorite/removeFavorite,
-- api/favorites/route.ts). Ersetzt .cache/favoriten.json — gleicher Grund
-- wie bei "channels".
create table if not exists favorites (
  video_id text primary key,
  video jsonb not null,
  created_at timestamptz not null default now()
);

alter table favorites enable row level security;

-- "Schon gesehen": Videos, die Wolf per Augen-Icon ausgeblendet hat (siehe
-- src/lib/cache.ts listSeen/addSeen/removeSeen, api/seen/route.ts). Ersetzt
-- .cache/gesehen.json — gleicher Grund wie bei "channels".
create table if not exists seen (
  video_id text primary key,
  video jsonb not null,
  created_at timestamptz not null default now()
);

alter table seen enable row level security;
