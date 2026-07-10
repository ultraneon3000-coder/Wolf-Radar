import fs from "node:fs";
import path from "node:path";
import { FAILURE_CACHE_TTL_MS, SEARCH_CACHE_TTL_MS } from "./config";
import { supabase } from "./supabase";
import type { AnalyzedVideo, SavedChannel, Urteil, VideoStatus } from "./types";

// Einfacher Cache für den MVP: In-Memory (schnell, pro Server-Prozess) + eine
// lokale JSON-Datei als Durchsatz über Neustarts hinweg. Reicht für den
// lokalen Betrieb; für Mehrbenutzer-/Produktivbetrieb durch SQLite/Redis ersetzen.

function createJsonFileStore<T>(filename: string) {
  const filePath = path.join(process.cwd(), ".cache", filename);
  let memory: Record<string, T> | null = null;

  function ensureLoaded(): Record<string, T> {
    if (!memory) {
      try {
        memory = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, T>;
      } catch {
        memory = {};
      }
    }
    return memory;
  }

  function persist(): void {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(ensureLoaded(), null, 2), "utf-8");
    } catch (err) {
      console.error(`Cache (${filename}) konnte nicht auf Disk gespeichert werden:`, err);
    }
  }

  return {
    get(key: string): T | undefined {
      return ensureLoaded()[key];
    },
    set(key: string, value: T): void {
      ensureLoaded()[key] = value;
      persist();
    },
    delete(key: string): void {
      delete ensureLoaded()[key];
      persist();
    },
    values(): T[] {
      return Object.values(ensureLoaded());
    },
    has(key: string): boolean {
      return key in ensureLoaded();
    },
  };
}

// Persistenter Urteil-Cache in Supabase (Tabelle "urteil_cache", siehe
// supabase/schema.sql) statt lokaler JSON-Datei — Vercel hat kein
// persistentes Dateisystem, ein Deploy/Cold-Start würde die Datei sonst verlieren.
export async function getCachedUrteil(videoId: string): Promise<Urteil | undefined> {
  const { data, error } = await supabase
    .from("urteil_cache")
    .select("urteil")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Cache-Lookup fehlgeschlagen (${videoId}):`, error.message);
    return undefined;
  }
  return (data?.urteil as Urteil | undefined) ?? undefined;
}

export async function setCachedUrteil(videoId: string, urteil: Urteil): Promise<void> {
  const { error } = await supabase
    .from("urteil_cache")
    .upsert({ video_id: videoId, urteil });

  if (error) {
    console.error(`Supabase-Cache-Schreiben fehlgeschlagen (${videoId}):`, error.message);
  }
}

// Persistenter Cache für Stichwort-Suchergebnisse (search.list, Tabelle
// "search_cache", siehe supabase/schema.sql) mit kurzer TTL (SEARCH_CACHE_TTL_MS)
// — spart die 100 Quota-Einheiten von search.list, wenn dieselbe Suche
// (gleiche q/region/order/publishedAfter/pageToken) kurz danach erneut
// angefragt wird (Reload, Themen-Rotation, "Erneuern"). Anders als
// urteil_cache soll dieser Cache NICHT dauerhaft sein, deshalb die
// created_at-basierte Ablaufprüfung beim Lesen statt einer echten TTL-Spalte.
export interface CachedSearchPage {
  videoIds: string[];
  nextPageToken: string | null;
}

export async function getCachedSearch(cacheKey: string): Promise<CachedSearchPage | undefined> {
  const { data, error } = await supabase
    .from("search_cache")
    .select("video_ids, next_page_token, created_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Suchcache-Lookup fehlgeschlagen (${cacheKey}):`, error.message);
    return undefined;
  }
  if (!data) return undefined;
  if (Date.now() - new Date(data.created_at as string).getTime() > SEARCH_CACHE_TTL_MS) {
    return undefined;
  }
  return {
    videoIds: data.video_ids as string[],
    nextPageToken: (data.next_page_token as string | null) ?? null,
  };
}

export async function setCachedSearch(cacheKey: string, page: CachedSearchPage): Promise<void> {
  const { error } = await supabase.from("search_cache").upsert({
    cache_key: cacheKey,
    video_ids: page.videoIds,
    next_page_token: page.nextPageToken,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`Supabase-Suchcache-Schreiben fehlgeschlagen (${cacheKey}):`, error.message);
  }
}

// Merkt sich fehlgeschlagene Versuche kurzzeitig (nur In-Memory, nicht auf Disk),
// damit dieselbe Suche nicht sofort erneut YouTube anfragt — insbesondere nach
// einem IP-Block. TTL je nach Fehlertyp, siehe FAILURE_CACHE_TTL_MS.
export interface CachedFailure {
  status: Exclude<VideoStatus, "ok">;
  message: string;
}

interface FailureEntry extends CachedFailure {
  expiresAt: number;
}

const failureCache = new Map<string, FailureEntry>();

export function getCachedFailure(videoId: string): CachedFailure | undefined {
  const entry = failureCache.get(videoId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    failureCache.delete(videoId);
    return undefined;
  }
  return { status: entry.status, message: entry.message };
}

export function setCachedFailure(videoId: string, failure: CachedFailure): void {
  failureCache.set(videoId, {
    ...failure,
    expiresAt: Date.now() + FAILURE_CACHE_TTL_MS[failure.status],
  });
}

// Favoriten: von Wolf angesternte Videos, als vollständiger Snapshot gespeichert
// (Titel/Thumbnail/Urteil etc.), damit die Favoriten-Ansicht ohne erneute
// Analyse angezeigt werden kann.
const favoritesStore = createJsonFileStore<AnalyzedVideo>("favoriten.json");

export function listFavorites(): AnalyzedVideo[] {
  return favoritesStore.values();
}

export function isFavorite(videoId: string): boolean {
  return favoritesStore.has(videoId);
}

export function addFavorite(video: AnalyzedVideo): void {
  favoritesStore.set(video.videoId, video);
}

export function removeFavorite(videoId: string): void {
  favoritesStore.delete(videoId);
}

// "Schon gesehen": Videos, die Wolf per Augen-Icon aus den normalen Listen
// (Suche, Vorgeschlagen) ausgeblendet hat. Gleicher Persistenz-Mechanismus
// wie Favoriten — vollständiger Snapshot, damit die "Schon gesehen"-Ansicht
// ohne erneute Analyse angezeigt werden kann.
const seenStore = createJsonFileStore<AnalyzedVideo>("gesehen.json");

export function listSeen(): AnalyzedVideo[] {
  return seenStore.values();
}

export function isSeen(videoId: string): boolean {
  return seenStore.has(videoId);
}

export function addSeen(video: AnalyzedVideo): void {
  seenStore.set(video.videoId, video);
}

export function removeSeen(videoId: string): void {
  seenStore.delete(videoId);
}

// Von Wolf gespeicherte Kanäle für den "Nur meine Kanäle"-Suchmodus (siehe
// api/channels/route.ts). Gleicher Persistenz-Mechanismus wie Favoriten/Gesehen.
const channelsStore = createJsonFileStore<SavedChannel>("kanaele.json");

export function listChannels(): SavedChannel[] {
  return channelsStore.values();
}

export function isChannelSaved(channelId: string): boolean {
  return channelsStore.has(channelId);
}

export function addChannel(channel: SavedChannel): void {
  channelsStore.set(channel.channelId, channel);
}

export function removeChannel(channelId: string): void {
  channelsStore.delete(channelId);
}
