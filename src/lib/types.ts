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
