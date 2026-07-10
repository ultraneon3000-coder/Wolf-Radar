import type { Judgment, StatementJudgment } from "./config";

export interface Aussage {
  aussage: string;
  urteil: StatementJudgment;
  begruendung: string;
  konsens: string;
}

export interface Urteil {
  gesamturteil: Judgment;
  hauptbefund: string;
  gesamtbegruendung: string;
  kategorien: string[];
  vertrauen: number;
  aussagen: Aussage[];
}

// "Eigenes Video analysieren" akzeptiert YouTube-, TikTok- und Instagram-Links
// (siehe lib/links.ts) — für TikTok/Instagram gibt es keine YouTube-Metadaten-API,
// deshalb muss die UI (z.B. ResultCard) je nach Plattform unterscheiden, welche
// Felder verlässlich sind (z.B. keine echte YouTube-channelId zum Kanal-Speichern).
export type VideoPlatform = "youtube" | "tiktok" | "instagram";

export interface VideoMeta {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number;
  channelSubscriberCount: number;
  // Normalisierter Sprachcode (z.B. "de", "en") aus defaultAudioLanguage/
  // defaultLanguage, sonst per Titel/Beschreibung geraten — siehe lib/language.ts.
  language: string | null;
  // Aus contentDetails.duration (ISO 8601) geparst, für den "Video/Short"-Filter
  // (siehe lib/filters.ts) — null, wenn keine Dauer-Info verfügbar ist (z.B.
  // TikTok/Instagram ohne YouTube-Metadaten).
  durationSeconds: number | null;
  platform: VideoPlatform;
  // Klickziel der Karte (siehe ResultCard) — bei YouTube der watch?v=-Link, bei
  // TikTok/Instagram die Original-URL, da videoId dort kein YouTube-Format hat.
  sourceUrl: string;
}

// Umschalter in der Suchleiste: "de" schränkt die YouTube-Suche auf
// regionCode=DE + relevanceLanguage=de ein, "international" sucht ohne
// diese Einschränkung (siehe lib/youtube.ts searchVideoIds).
export type RegionMode = "de" | "international";

// Von Wolf gespeicherter YouTube-Kanal (siehe lib/channels-context.tsx,
// api/channels/route.ts) — für den "Nur meine Kanäle"-Suchmodus.
export interface SavedChannel {
  channelId: string;
  title: string;
  thumbnail: string;
}

// Ein Treffer aus der Kanal-Suche (siehe lib/youtube.ts searchChannels) —
// noch nicht gespeichert, der Nutzer wählt gezielt einen Kandidaten aus.
// subscriberCount ist null, wenn der Kanal die Abo-Zahl verbirgt oder sie
// nicht verfügbar ist.
export interface ChannelCandidate extends SavedChannel {
  subscriberCount: number | null;
}

export type VideoStatus = "ok" | "kein_transkript" | "fehler";

// Von Christian manuell gesetztes Gesamturteil (siehe cache.ts
// getUrteilOverrides/setUrteilOverride) — überschreibt nur die ANZEIGE des
// Gesamturteils, Claudes Original bleibt in `urteil` unverändert erhalten
// und wird beim Zurücksetzen wieder sichtbar.
export interface UrteilOverride {
  gesamturteil: Judgment;
  notiz: string | null;
  createdAt: string;
}

export interface AnalyzedVideo extends VideoMeta {
  status: VideoStatus;
  urteil?: Urteil;
  error?: string;
  urteilOverride?: UrteilOverride;
}

/** Das tatsächlich anzuzeigende Gesamturteil — Override hat Vorrang vor Claudes Original. */
export function effectiveJudgment(video: AnalyzedVideo): Judgment | undefined {
  return video.urteilOverride?.gesamturteil ?? video.urteil?.gesamturteil;
}

// Events, die die /api/analyze Route per Server-Sent Events streamt.
export type AnalyzeEvent =
  | { type: "meta"; total: number; nextPageToken?: string | null }
  | { type: "result"; video: AnalyzedVideo }
  | { type: "done" }
  | { type: "error"; message: string };
