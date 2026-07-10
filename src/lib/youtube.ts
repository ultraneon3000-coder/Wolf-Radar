import { detectLanguageFromText, normalizeLanguage } from "./language";
import type { ChannelCandidate, RegionMode, VideoMeta } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

interface YoutubeSearchItem {
  id?: { videoId?: string };
}

export interface SearchPage {
  videoIds: string[];
  nextPageToken: string | null;
}

interface YoutubeVideoItem {
  id: string;
  snippet: {
    title: string;
    description?: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    defaultAudioLanguage?: string;
    defaultLanguage?: string;
    thumbnails?: {
      medium?: { url: string };
      default?: { url: string };
    };
  };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
}

interface YoutubeChannelItem {
  id: string;
  statistics?: { subscriberCount?: string };
}

interface YoutubeThumbnails {
  medium?: { url: string };
  default?: { url: string };
}

interface YoutubeChannelSnippetItem {
  id: string;
  snippet?: { title?: string; thumbnails?: YoutubeThumbnails };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
}

interface YoutubeChannelSearchItem {
  id?: { channelId?: string };
  snippet?: { title?: string; thumbnails?: YoutubeThumbnails };
}

const VIDEO_ID_RE = /^[0-9A-Za-z_-]{11}$/;
const VIDEO_URL_RE = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/live\/)([0-9A-Za-z_-]{11})/;

/** Extrahiert die 11-stellige Video-ID aus einer YouTube-URL oder gibt eine bereits reine ID zurück. */
export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (VIDEO_ID_RE.test(s)) return s;
  const m = s.match(VIDEO_URL_RE);
  return m ? m[1] : null;
}

function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error("YOUTUBE_API_KEY fehlt in .env.local");
  }
  return key;
}

async function getJson<T>(url: URL, attempt = 0): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    // YouTube liefert gelegentlich einen transienten 403 ohne echten
    // Berechtigungsgrund (bekannter API-Flake). Kurz erneut versuchen,
    // statt sofort aufzugeben.
    if (res.status === 403 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      return getJson<T>(url, attempt + 1);
    }
    throw new Error(`YouTube-API-Fehler (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** search.list -> Video-IDs (+ nextPageToken) für einen Suchbegriff, seitenweise (siehe transkript_sammler.py als Referenz). */
export async function searchVideoIds(
  query: string,
  maxResults: number,
  pageToken?: string,
  region: RegionMode = "de",
  // "date" holt echte, aktuelle Videos von YouTube (Sortier-Filter "Neueste
  // zuerst"), statt YouTubes Default-Relevanzranking (bevorzugt alte
  // Dauerbrenner unabhängig vom Datum) nur lokal umzusortieren.
  order: "relevance" | "date" = "relevance",
  // ISO-Zeitstempel (siehe filters.ts periodToPublishedAfter) für den Zeitraum-Filter.
  publishedAfter?: string
): Promise<SearchPage> {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  if (region === "de") {
    url.searchParams.set("regionCode", "DE");
    url.searchParams.set("relevanceLanguage", "de");
  }
  if (order === "date") url.searchParams.set("order", "date");
  if (publishedAfter) url.searchParams.set("publishedAfter", publishedAfter);
  url.searchParams.set("maxResults", String(Math.min(Math.max(maxResults, 1), 50)));
  url.searchParams.set("key", getApiKey());
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const data = await getJson<{ items?: YoutubeSearchItem[]; nextPageToken?: string }>(url);
  const ids = (data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
  return { videoIds: [...new Set(ids)], nextPageToken: data.nextPageToken ?? null };
}

/** channels.list -> Abonnentenzahl pro Kanal (Filter-Datum "Kanalgröße"). */
async function fetchChannelSubscribers(channelIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (channelIds.length === 0) return result;

  const url = new URL(`${API_BASE}/channels`);
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", channelIds.join(","));
  url.searchParams.set("key", getApiKey());

  try {
    const data = await getJson<{ items?: YoutubeChannelItem[] }>(url);
    for (const item of data.items ?? []) {
      result.set(item.id, Number(item.statistics?.subscriberCount ?? 0));
    }
  } catch {
    // Kanalgröße ist ein Filter-Komfort-Datum, kein harter Stopp bei Fehlern.
  }
  return result;
}

/** Parst eine ISO-8601-Dauer ("PT1M30S") in Sekunden, für den "Video/Short"-Filter. */
function parseIso8601DurationToSeconds(duration?: string): number | null {
  if (!duration) return null;
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/** videos.list (statistics, contentDetails) + channels.list -> vollständige Video-Metadaten. */
export async function fetchVideoMeta(videoIds: string[]): Promise<VideoMeta[]> {
  if (videoIds.length === 0) return [];

  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", getApiKey());

  const data = await getJson<{ items?: YoutubeVideoItem[] }>(url);
  const items = data.items ?? [];

  const channelIds = [...new Set(items.map((it) => it.snippet.channelId))];
  const subscribers = await fetchChannelSubscribers(channelIds);

  return items.map((it) => ({
    videoId: it.id,
    title: it.snippet.title,
    channelId: it.snippet.channelId,
    channelTitle: it.snippet.channelTitle,
    publishedAt: it.snippet.publishedAt,
    thumbnail:
      it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? "",
    viewCount: Number(it.statistics?.viewCount ?? 0),
    channelSubscriberCount: subscribers.get(it.snippet.channelId) ?? 0,
    language:
      normalizeLanguage(it.snippet.defaultAudioLanguage ?? it.snippet.defaultLanguage) ??
      detectLanguageFromText(`${it.snippet.title} ${it.snippet.description ?? ""}`),
    durationSeconds: parseIso8601DurationToSeconds(it.contentDetails?.duration),
    platform: "youtube",
    sourceUrl: `https://www.youtube.com/watch?v=${it.id}`,
  }));
}

function thumbnailUrl(thumbnails?: YoutubeThumbnails): string {
  return thumbnails?.medium?.url ?? thumbnails?.default?.url ?? "";
}

function toChannelCandidate(item: YoutubeChannelSnippetItem): ChannelCandidate {
  return {
    channelId: item.id,
    title: item.snippet?.title ?? item.id,
    thumbnail: thumbnailUrl(item.snippet?.thumbnails),
    subscriberCount: item.statistics?.hiddenSubscriberCount
      ? null
      : Number(item.statistics?.subscriberCount ?? 0),
  };
}

type ChannelIdentifier =
  | { type: "id" | "handle" | "username"; value: string }
  | { type: "query"; value: string };

// Erkennt Kanal-URLs/Handles, damit "Meine Kanäle hinzufügen" sowohl mit einem
// freien Namen als auch mit URL/@handle funktioniert (siehe searchChannels).
function parseChannelInput(input: string): ChannelIdentifier {
  const channelUrlMatch = input.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{10,})/);
  if (channelUrlMatch) return { type: "id", value: channelUrlMatch[1] };

  const handleUrlMatch = input.match(/youtube\.com\/@([0-9A-Za-z_.-]+)/);
  if (handleUrlMatch) return { type: "handle", value: `@${handleUrlMatch[1]}` };

  const userUrlMatch = input.match(/youtube\.com\/user\/([0-9A-Za-z_-]+)/);
  if (userUrlMatch) return { type: "username", value: userUrlMatch[1] };

  if (/^UC[0-9A-Za-z_-]{10,}$/.test(input)) return { type: "id", value: input };
  if (input.startsWith("@")) return { type: "handle", value: input };

  return { type: "query", value: input };
}

/** channels.list mit id/forHandle/forUsername -> Kanal inkl. Abo-Zahl, oder null bei keinem Treffer. */
async function fetchChannelByField(
  field: "id" | "forHandle" | "forUsername",
  value: string
): Promise<ChannelCandidate | null> {
  const url = new URL(`${API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set(field, value);
  url.searchParams.set("key", getApiKey());

  const data = await getJson<{ items?: YoutubeChannelSnippetItem[] }>(url);
  const item = data.items?.[0];
  return item ? toChannelCandidate(item) : null;
}

/** channels.list mit id -> Kanal inkl. Abo-Zahl für eine bekannte channelId (z.B. "Kanal von Video merken"). */
export async function fetchChannelById(channelId: string): Promise<ChannelCandidate | null> {
  return fetchChannelByField("id", channelId);
}

/**
 * search.list (type=channel) -> bis zu `limit` Treffer für einen freien
 * Kanal-Namen. search.list liefert keine Abo-Zahl -> ein zweiter
 * channels.list-Batch-Call reichert die Treffer damit an (wie
 * fetchChannelSubscribers für Video-Metadaten).
 */
async function searchChannelsByQuery(query: string, limit: number): Promise<ChannelCandidate[]> {
  const url = new URL(`${API_BASE}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("key", getApiKey());

  const data = await getJson<{ items?: YoutubeChannelSearchItem[] }>(url);
  const channelIds = (data.items ?? [])
    .map((item) => item.id?.channelId)
    .filter((id): id is string => Boolean(id));
  if (channelIds.length === 0) return [];

  const statsUrl = new URL(`${API_BASE}/channels`);
  statsUrl.searchParams.set("part", "snippet,statistics");
  statsUrl.searchParams.set("id", channelIds.join(","));
  statsUrl.searchParams.set("key", getApiKey());
  const statsData = await getJson<{ items?: YoutubeChannelSnippetItem[] }>(statsUrl);
  const byId = new Map(statsData.items?.map((item) => [item.id, toChannelCandidate(item)]));

  // Reihenfolge von search.list (Relevanz-Ranking) beibehalten, nicht die
  // Reihenfolge der channels.list-Antwort.
  return channelIds.map((id) => byId.get(id)).filter((c): c is ChannelCandidate => Boolean(c));
}

/**
 * Löst Kanal-Name, -URL (/channel/UC…, /@handle, /user/name) oder @handle zu
 * einer Liste von Kandidaten auf (für "Meine Kanäle hinzufügen") — der Nutzer
 * wählt gezielt aus, statt dass automatisch der erste Treffer gespeichert
 * wird. Direkte URL/@handle/ID-Eingaben liefern in der Regel genau einen
 * Kandidaten; ein freier Name liefert bis zu `limit` Treffer.
 */
export async function searchChannels(input: string, limit = 5): Promise<ChannelCandidate[]> {
  const identifier = parseChannelInput(input.trim());

  if (identifier.type === "id") {
    const channel = await fetchChannelByField("id", identifier.value);
    return channel ? [channel] : [];
  }
  if (identifier.type === "handle") {
    const channel = await fetchChannelByField("forHandle", identifier.value);
    return channel ? [channel] : searchChannelsByQuery(identifier.value, limit);
  }
  if (identifier.type === "username") {
    const channel = await fetchChannelByField("forUsername", identifier.value);
    return channel ? [channel] : searchChannelsByQuery(identifier.value, limit);
  }
  return searchChannelsByQuery(identifier.value, limit);
}
