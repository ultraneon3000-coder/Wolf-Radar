import { FAILURE_CACHE_TTL_MS, SEARCH_CACHE_TTL_MS } from "./config";
import type { Judgment } from "./config";
import { supabase } from "./supabase";
import type {
  AnalyzedVideo,
  PlaylistVideoEntry,
  SavedChannel,
  Urteil,
  UrteilOverride,
  VideoStatus,
} from "./types";

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

// Cache für einzelne Uploads-Playlist-Seiten (playlistItems.list, siehe
// lib/youtube.ts fetchUploadsPlaylistPage) im "Nur meine Kanäle"-Modus —
// nutzt dieselbe Tabelle "search_cache" wie getCachedSearch/setCachedSearch
// (gleiche TTL SEARCH_CACHE_TTL_MS), aber mit einem Cache-Key pro Kanal +
// Playlist-Seite statt pro Suchanfrage: die 1 Quota-Einheit einer Seite wird
// so über verschiedene Stichwort-Suchen und "Mehr laden"-Klicks hinweg
// wiederverwendet, da die Stichwort-Filterung erst danach lokal passiert.
export interface CachedChannelPage {
  entries: PlaylistVideoEntry[];
  nextPageToken: string | null;
}

export async function getCachedChannelPage(cacheKey: string): Promise<CachedChannelPage | undefined> {
  const { data, error } = await supabase
    .from("search_cache")
    .select("video_ids, next_page_token, created_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Kanalseiten-Cache-Lookup fehlgeschlagen (${cacheKey}):`, error.message);
    return undefined;
  }
  if (!data) return undefined;
  if (Date.now() - new Date(data.created_at as string).getTime() > SEARCH_CACHE_TTL_MS) {
    return undefined;
  }
  return {
    entries: data.video_ids as unknown as PlaylistVideoEntry[],
    nextPageToken: (data.next_page_token as string | null) ?? null,
  };
}

export async function setCachedChannelPage(cacheKey: string, page: CachedChannelPage): Promise<void> {
  const { error } = await supabase.from("search_cache").upsert({
    cache_key: cacheKey,
    video_ids: page.entries,
    next_page_token: page.nextPageToken,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`Supabase-Kanalseiten-Cache-Schreiben fehlgeschlagen (${cacheKey}):`, error.message);
  }
}

// Manuell überschriebenes Gesamturteil (Tabelle "urteil_override", siehe
// supabase/schema.sql) — dauerhaft, keine TTL. getUrteilOverrides ist
// gebündelt (ein .in()-Call für eine ganze Ergebnisseite) statt pro Video,
// analog zu fetchChannelSubscribers in youtube.ts.
export async function getUrteilOverrides(videoIds: string[]): Promise<Map<string, UrteilOverride>> {
  const result = new Map<string, UrteilOverride>();
  if (videoIds.length === 0) return result;

  const { data, error } = await supabase
    .from("urteil_override")
    .select("video_id, gesamturteil, notiz, created_at")
    .in("video_id", videoIds);

  if (error) {
    console.error("Supabase-Override-Lookup fehlgeschlagen:", error.message);
    return result;
  }
  for (const row of data ?? []) {
    result.set(row.video_id as string, {
      gesamturteil: row.gesamturteil as Judgment,
      notiz: (row.notiz as string | null) ?? null,
      createdAt: row.created_at as string,
    });
  }
  return result;
}

export async function setUrteilOverride(
  videoId: string,
  gesamturteil: Judgment,
  notiz: string | null
): Promise<void> {
  const { error } = await supabase.from("urteil_override").upsert({
    video_id: videoId,
    gesamturteil,
    notiz,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`Supabase-Override-Schreiben fehlgeschlagen (${videoId}):`, error.message);
  }
}

export async function removeUrteilOverride(videoId: string): Promise<void> {
  const { error } = await supabase.from("urteil_override").delete().eq("video_id", videoId);

  if (error) {
    console.error(`Supabase-Override-Löschen fehlgeschlagen (${videoId}):`, error.message);
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
// Analyse angezeigt werden kann. Persistent in Supabase (Tabelle "favorites",
// siehe supabase/schema.sql) statt lokaler JSON-Datei — Vercel hat kein
// persistentes Dateisystem, ein anderer/kalter Lambda-Prozess würde eine
// lokale Datei sonst nie zu Gesicht bekommen.
export async function listFavorites(): Promise<AnalyzedVideo[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select("video")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase-Favoriten-Lookup fehlgeschlagen:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.video as AnalyzedVideo);
}

export async function isFavorite(videoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("favorites")
    .select("video_id")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Favoriten-Lookup fehlgeschlagen (${videoId}):`, error.message);
    return false;
  }
  return data !== null;
}

export async function addFavorite(video: AnalyzedVideo): Promise<void> {
  const { error } = await supabase
    .from("favorites")
    .upsert({ video_id: video.videoId, video });

  if (error) {
    console.error(`Supabase-Favoriten-Schreiben fehlgeschlagen (${video.videoId}):`, error.message);
  }
}

export async function removeFavorite(videoId: string): Promise<void> {
  const { error } = await supabase.from("favorites").delete().eq("video_id", videoId);

  if (error) {
    console.error(`Supabase-Favoriten-Löschen fehlgeschlagen (${videoId}):`, error.message);
  }
}

// "Schon gesehen": Videos, die Wolf per Augen-Icon aus den normalen Listen
// (Suche, Vorgeschlagen) ausgeblendet hat. Gleicher Persistenz-Mechanismus
// wie Favoriten (Tabelle "seen") — vollständiger Snapshot, damit die "Schon
// gesehen"-Ansicht ohne erneute Analyse angezeigt werden kann.
export async function listSeen(): Promise<AnalyzedVideo[]> {
  const { data, error } = await supabase
    .from("seen")
    .select("video")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase-Gesehen-Lookup fehlgeschlagen:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.video as AnalyzedVideo);
}

export async function isSeen(videoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("seen")
    .select("video_id")
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Gesehen-Lookup fehlgeschlagen (${videoId}):`, error.message);
    return false;
  }
  return data !== null;
}

export async function addSeen(video: AnalyzedVideo): Promise<void> {
  const { error } = await supabase.from("seen").upsert({ video_id: video.videoId, video });

  if (error) {
    console.error(`Supabase-Gesehen-Schreiben fehlgeschlagen (${video.videoId}):`, error.message);
  }
}

export async function removeSeen(videoId: string): Promise<void> {
  const { error } = await supabase.from("seen").delete().eq("video_id", videoId);

  if (error) {
    console.error(`Supabase-Gesehen-Löschen fehlgeschlagen (${videoId}):`, error.message);
  }
}

// Von Wolf gespeicherte Kanäle für den "Nur meine Kanäle"-Suchmodus (siehe
// api/channels/route.ts). Gleicher Persistenz-Mechanismus wie Favoriten/Gesehen
// (Tabelle "channels").
export async function listChannels(): Promise<SavedChannel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("channel_id, title, thumbnail")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase-Kanal-Lookup fehlgeschlagen:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    channelId: row.channel_id as string,
    title: row.title as string,
    thumbnail: row.thumbnail as string,
  }));
}

export async function isChannelSaved(channelId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("channels")
    .select("channel_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) {
    console.error(`Supabase-Kanal-Lookup fehlgeschlagen (${channelId}):`, error.message);
    return false;
  }
  return data !== null;
}

export async function addChannel(channel: SavedChannel): Promise<void> {
  const { error } = await supabase.from("channels").upsert({
    channel_id: channel.channelId,
    title: channel.title,
    thumbnail: channel.thumbnail,
  });

  if (error) {
    console.error(`Supabase-Kanal-Schreiben fehlgeschlagen (${channel.channelId}):`, error.message);
  }
}

export async function removeChannel(channelId: string): Promise<void> {
  const { error } = await supabase.from("channels").delete().eq("channel_id", channelId);

  if (error) {
    console.error(`Supabase-Kanal-Löschen fehlgeschlagen (${channelId}):`, error.message);
  }
}
