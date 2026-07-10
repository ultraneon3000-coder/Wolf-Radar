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

export interface AnalyzedVideo extends VideoMeta {
  status: VideoStatus;
  urteil?: Urteil;
  error?: string;
}

// Events, die die /api/analyze Route per Server-Sent Events streamt.
export type AnalyzeEvent =
  | { type: "meta"; total: number; nextPageToken?: string | null }
  | { type: "result"; video: AnalyzedVideo }
  | { type: "done" }
  | { type: "error"; message: string };
