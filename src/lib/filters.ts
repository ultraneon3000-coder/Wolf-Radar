import type { Judgment } from "./config";
import { daysSince } from "./format";
import type { AnalyzedVideo } from "./types";

export type DateRangeFilter = "alle" | "7" | "21" | "30" | "90";
export type SortOption = "fragwuerdig_views" | "views_desc" | "date_desc" | "date_asc";

export interface FilterState {
  category: string; // "alle" | Kategorie-ID
  dateRange: DateRangeFilter;
  channel: string; // "alle" | exakter Kanalname
  minSubscribers: number;
  minViews: number;
  sort: SortOption;
}

export const DEFAULT_FILTERS: FilterState = {
  category: "alle",
  dateRange: "alle",
  channel: "alle",
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
