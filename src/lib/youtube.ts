import { detectLanguageFromText, normalizeLanguage } from "./language";
import type { RegionMode, VideoMeta } from "./types";

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
}

interface YoutubeChannelItem {
  id: string;
  statistics?: { subscriberCount?: string };
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

async function getJson<T>(url: URL): Promise<T> {
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
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
  url.searchParams.set("q", query);
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

/** videos.list (statistics) + channels.list -> vollständige Video-Metadaten. */
export async function fetchVideoMeta(videoIds: string[]): Promise<VideoMeta[]> {
  if (videoIds.length === 0) return [];

  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set("part", "snippet,statistics");
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
  }));
}
