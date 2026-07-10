import type { Judgment } from "./config";
import { daysSince } from "./format";
import type { AnalyzedVideo } from "./types";

export type DateRangeFilter = "alle" | "7" | "21" | "30" | "90";
export type LanguageFilter = "alle" | "de" | "en";
export type SortOption = "fragwuerdig_views" | "views_desc" | "date_desc" | "date_asc";
// "egal" | Zeitraum, der als publishedAfter an YouTube durchgereicht wird (siehe
// periodToPublishedAfter) — im Unterschied zu dateRange (rein lokaler Filter auf
// die schon geladene Liste) schränkt period die YouTube-Suche selbst ein.
export type PeriodFilter = "egal" | "year" | "6months" | "month";
export type VideoTypeFilter = "alle" | "video" | "short";

// Videos gelten ab dieser Dauer (Sekunden) als "Short" — YouTube Shorts sind
// üblicherweise unter 60s (siehe VideoMeta.durationSeconds).
const SHORT_MAX_SECONDS = 60;

export interface FilterState {
  category: string; // "alle" | Kategorie-ID
  dateRange: DateRangeFilter;
  channel: string; // "alle" | exakter Kanalname
  language: LanguageFilter;
  period: PeriodFilter;
  videoType: VideoTypeFilter;
  minSubscribers: number;
  minViews: number;
  sort: SortOption;
}

export const DEFAULT_FILTERS: FilterState = {
  category: "alle",
  dateRange: "alle",
  channel: "alle",
  language: "alle",
  period: "egal",
  videoType: "alle",
  minSubscribers: 0,
  minViews: 0,
  sort: "fragwuerdig_views",
};

export const DATE_RANGE_OPTIONS: { value: DateRangeFilter; label: string }[] = [
  { value: "alle", label: "Upload-Datum: alle" },
  { value: "7", label: "Letzte 7 Tage" },
  { value: "21", label: "Letzte 3 Wochen" },
  { value: "30", label: "Letzter Monat" },
  { value: "90", label: "Letzte 3 Monate" },
];

export const SUBSCRIBER_BUCKETS: { value: number; label: string }[] = [
  { value: 0, label: "Kanalgröße: alle" },
  { value: 10_000, label: "ab 10.000 Abonnenten" },
  { value: 100_000, label: "ab 100.000 Abonnenten" },
  { value: 1_000_000, label: "ab 1 Mio. Abonnenten" },
];

export const LANGUAGE_OPTIONS: { value: LanguageFilter; label: string }[] = [
  { value: "alle", label: "Sprache: alle" },
  { value: "de", label: "Deutsch" },
  { value: "en", label: "Englisch" },
];

export const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "egal", label: "Zeitraum: egal" },
  { value: "year", label: "Letztes Jahr" },
  { value: "6months", label: "Letzte 6 Monate" },
  { value: "month", label: "Letzter Monat" },
];

const PERIOD_DAYS: Record<Exclude<PeriodFilter, "egal">, number> = {
  year: 365,
  "6months": 182,
  month: 30,
};

/** Wandelt die Zeitraum-Auswahl in einen publishedAfter-ISO-Zeitstempel für die YouTube-Suche um. */
export function periodToPublishedAfter(period: PeriodFilter): string | undefined {
  if (period === "egal") return undefined;
  const days = PERIOD_DAYS[period];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const VIDEO_TYPE_OPTIONS: { value: VideoTypeFilter; label: string }[] = [
  { value: "alle", label: "Video/Short: alle" },
  { value: "video", label: "Nur Videos" },
  { value: "short", label: "Nur Shorts" },
];

export const VIEW_BUCKETS: { value: number; label: string }[] = [
  { value: 0, label: "Aufrufe: alle" },
  { value: 1_000, label: "ab 1.000 Aufrufe" },
  { value: 10_000, label: "ab 10.000 Aufrufe" },
  { value: 100_000, label: "ab 100.000 Aufrufe" },
];

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "fragwuerdig_views", label: "Fragwürdig + höchste Aufrufzahl zuerst" },
  { value: "views_desc", label: "Höchste Aufrufzahl zuerst" },
  { value: "date_desc", label: "Neueste zuerst" },
  { value: "date_asc", label: "Älteste zuerst" },
];

const JUDGMENT_RANK: Record<Judgment, number> = {
  "fragwürdig": 0,
  "gemischt": 1,
  "seriös": 2,
};

export function filterAndSortVideos(
  videos: AnalyzedVideo[],
  filters: FilterState
): AnalyzedVideo[] {
  const filtered = videos.filter((v) => {
    if (filters.category !== "alle" && !v.urteil?.kategorien.includes(filters.category)) {
      return false;
    }
    if (filters.dateRange !== "alle" && daysSince(v.publishedAt) > Number(filters.dateRange)) {
      return false;
    }
    if (filters.channel !== "alle" && v.channelTitle !== filters.channel) return false;
    if (filters.language !== "alle" && v.language !== filters.language) return false;
    if (filters.videoType !== "alle") {
      // Unbekannte Dauer (z.B. TikTok/Instagram ohne YouTube-Metadaten) zählt
      // nicht als Short, kann aber auch nicht sicher als "Video" bestätigt
      // werden — landet also nur bei "Nur Videos", nicht bei "Nur Shorts".
      const isShort = (v.durationSeconds ?? Infinity) <= SHORT_MAX_SECONDS;
      if (filters.videoType === "short" && !isShort) return false;
      if (filters.videoType === "video" && isShort) return false;
    }
    if (v.channelSubscriberCount < filters.minSubscribers) return false;
    if (v.viewCount < filters.minViews) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sort) {
      case "views_desc":
        return b.viewCount - a.viewCount;
      case "date_desc":
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case "date_asc":
        return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      case "fragwuerdig_views":
      default: {
        const rankA = a.urteil ? JUDGMENT_RANK[a.urteil.gesamturteil] : 3;
        const rankB = b.urteil ? JUDGMENT_RANK[b.urteil.gesamturteil] : 3;
        if (rankA !== rankB) return rankA - rankB;
        return b.viewCount - a.viewCount;
      }
    }
  });
}
