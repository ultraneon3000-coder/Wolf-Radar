"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { CustomVideoForm } from "@/components/CustomVideoForm";
import { CategoryTabs, ALL_CATEGORY } from "@/components/CategoryTabs";
import { FilterBar } from "@/components/FilterBar";
import { ResultCard } from "@/components/ResultCard";
import { CATEGORIES } from "@/lib/config";
import {
  DEFAULT_FILTERS,
  filterAndSortVideos,
  periodToPublishedAfter,
  type FilterState,
} from "@/lib/filters";
import { useSeen } from "@/lib/seen-context";
import type { AnalyzeEvent, AnalyzedVideo, RegionMode } from "@/lib/types";

type Status = "idle" | "loading" | "done" | "error";

// YouTube liefert auf Folgeseiten gelegentlich Videos, die schon auf einer
// vorherigen Seite dabei waren — ohne diese Prüfung gäbe es doppelte
// React-Keys (video.videoId) in der Liste.
function appendVideoDeduped(
  prev: AnalyzedVideo[],
  video: AnalyzedVideo
): AnalyzedVideo[] {
  return prev.some((v) => v.videoId === video.videoId) ? prev : [...prev, video];
}

// "Neueste zuerst" (sort) und der Zeitraum-Filter (period) betreffen nicht nur
// die lokale Sortierung/Anzeige, sondern müssen echte YouTube-Suchparameter
// werden (order=date / publishedAfter) — sonst holt "Neueste zuerst" nur die
// immer gleichen, relevanzsortierten Treffer und sortiert sie bloß lokal um.
function buildSearchUrl(
  query: string,
  region: RegionMode,
  filters: Pick<FilterState, "sort" | "period">,
  channelsOnly: boolean,
  pageToken?: string
): string {
  const params = new URLSearchParams({ region });
  // Im "Nur meine Kanäle"-Modus ist ein leerer Suchbegriff erlaubt (siehe
  // SearchBar) — dann darf q gar nicht erst gesetzt werden.
  if (query) params.set("q", query);
  if (channelsOnly) params.set("channelsOnly", "true");
  if (filters.sort === "date_desc") params.set("order", "date");
  const publishedAfter = periodToPublishedAfter(filters.period);
  if (publishedAfter) params.set("publishedAfter", publishedAfter);
  if (pageToken) params.set("pageToken", pageToken);
  return `/api/analyze?${params.toString()}`;
}

export default function SuchePage() {
  const [videos, setVideos] = useState<AnalyzedVideo[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  // Fortschritt bezieht sich bewusst nur auf die aktuell ladende Charge (10er
  // Seite), nicht auf die gesamte bisher geladene Liste — die steht in videos.length.
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFinished, setBatchFinished] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  // Steuert regionCode=DE + relevanceLanguage=de bei der YouTube-Suche (siehe
  // api/analyze/route.ts) — gilt für die normale Suche UND "Mehr laden".
  const [regionMode, setRegionMode] = useState<RegionMode>("de");
  // "Nur meine Kanäle": schränkt die Suche auf die gespeicherten Kanäle ein
  // (siehe api/analyze/route.ts) — wie regionMode gilt der beim Klick auf
  // "Suchen"/"Mehr laden" aktive Wert, ein Toggle mitten in der Anzeige löst
  // keinen automatischen Refetch aus.
  const [channelsOnly, setChannelsOnly] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  // undefined = noch nicht gesucht, null = keine weitere Seite mehr, sonst YouTube-Token.
  const [nextPageToken, setNextPageToken] = useState<string | null | undefined>(undefined);
  // true, wenn im "Nur meine Kanäle"-Modus SEARCH_CONFIG.channelsMaxDepth
  // erreicht wurde, bevor mindestens ein Kanal wirklich erschöpft war — die
  // Suche deckt dann nicht den gesamten Video-Bestand aller Kanäle ab (siehe
  // api/analyze/route.ts, AnalyzeEvent.channelsDepthLimited).
  const [channelsDepthLimited, setChannelsDepthLimited] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const customEventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      customEventSourceRef.current?.close();
    };
  }, []);

  // Analysiert ein einzelnes, frei eingegebenes Video — nimmt serverseitig
  // immer den echten Live-Weg (siehe api/analyze/route.ts, url-Parameter),
  // unabhängig vom Demo-Modus. Ergebnis landet in derselben Liste wie die
  // normale Suche, damit Filter/Tabs/Sortierung identisch greifen.
  function handleCustomVideoSubmit(url: string) {
    customEventSourceRef.current?.close();
    setCustomError(null);
    setCustomLoading(true);

    const es = new EventSource(`/api/analyze?url=${encodeURIComponent(url)}`);
    customEventSourceRef.current = es;

    es.onmessage = (event) => {
      const parsed: AnalyzeEvent = JSON.parse(event.data);
      switch (parsed.type) {
        case "result":
          setVideos((prev) => [
            parsed.video,
            ...prev.filter((v) => v.videoId !== parsed.video.videoId),
          ]);
          break;
        case "done":
          setCustomLoading(false);
          es.close();
          break;
        case "error":
          setCustomError(parsed.message);
          setCustomLoading(false);
          es.close();
          break;
      }
    };

    es.onerror = () => {
      setCustomLoading(false);
      setCustomError((prev) => prev ?? "Verbindung zum Server unterbrochen.");
      es.close();
    };
  }

  // Startet eine komplett frische Suche (leert die geladene Liste) — genutzt
  // sowohl vom Suchen-Button (mit zurückgesetzten Filtern) als auch, wenn
  // sort/period sich ändern und dadurch andere YouTube-Suchparameter (order/
  // publishedAfter) erfordern (siehe handleFiltersChange).
  function startSearch(query: string, searchFilters: FilterState) {
    eventSourceRef.current?.close();

    setLastQuery(query);
    setVideos([]);
    setBatchTotal(0);
    setBatchFinished(0);
    setErrorMessage(null);
    setStatus("loading");
    setNextPageToken(undefined);
    setChannelsDepthLimited(false);
    setIsLoadingMore(false);
    setLoadMoreError(null);

    const es = new EventSource(buildSearchUrl(query, regionMode, searchFilters, channelsOnly));
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const parsed: AnalyzeEvent = JSON.parse(event.data);
      switch (parsed.type) {
        case "meta":
          setBatchTotal(parsed.total);
          setNextPageToken(parsed.nextPageToken ?? null);
          setChannelsDepthLimited(parsed.channelsDepthLimited ?? false);
          break;
        case "result":
          setVideos((prev) => appendVideoDeduped(prev, parsed.video));
          setBatchFinished((c) => c + 1);
          break;
        case "done":
          setStatus("done");
          es.close();
          break;
        case "error":
          setErrorMessage(parsed.message);
          setStatus("error");
          es.close();
          break;
      }
    };

    es.onerror = () => {
      // Verbindung abgebrochen, bevor der Server "done"/"error" gesendet hat.
      setStatus((prev) => (prev === "loading" ? "error" : prev));
      setErrorMessage((prev) => prev ?? "Verbindung zum Server unterbrochen.");
      es.close();
    };
  }

  function handleSearch(query: string) {
    setFilters(DEFAULT_FILTERS);
    startSearch(query, DEFAULT_FILTERS);
  }

  // FilterBar-Änderungen sind normalerweise rein lokal (Kategorie, Kanal,
  // Sprache, Abo-/Aufrufzahlen, Sortierung) — sort=date_desc und period sind
  // die Ausnahme: die bestimmen echte YouTube-Suchparameter (order/
  // publishedAfter), also muss eine Änderung dort eine neue Suche auslösen,
  // statt nur die schon geladene Liste umzusortieren.
  function handleFiltersChange(next: FilterState) {
    const needsResearch =
      next.period !== filters.period ||
      (next.sort === "date_desc") !== (filters.sort === "date_desc");

    setFilters(next);
    if (needsResearch && lastQuery) {
      startSearch(lastQuery, next);
    }
  }

  // Holt die nächste 10er-Seite über den zuletzt gemerkten nextPageToken und
  // hängt die Ergebnisse an die bestehende Liste an (siehe videos.length-basierte
  // Counts/Filter/Sortierung oben — die greifen automatisch auf die volle Liste).
  function handleLoadMore() {
    if (!nextPageToken || isLoadingMore || status === "loading") return;

    eventSourceRef.current?.close();
    setIsLoadingMore(true);
    setLoadMoreError(null);
    setBatchTotal(0);
    setBatchFinished(0);

    const es = new EventSource(
      buildSearchUrl(lastQuery, regionMode, filters, channelsOnly, nextPageToken)
    );
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const parsed: AnalyzeEvent = JSON.parse(event.data);
      switch (parsed.type) {
        case "meta":
          setBatchTotal(parsed.total);
          setNextPageToken(parsed.nextPageToken ?? null);
          setChannelsDepthLimited(parsed.channelsDepthLimited ?? false);
          break;
        case "result":
          setVideos((prev) => appendVideoDeduped(prev, parsed.video));
          setBatchFinished((c) => c + 1);
          break;
        case "done":
          setIsLoadingMore(false);
          es.close();
          break;
        case "error":
          setLoadMoreError(parsed.message);
          setIsLoadingMore(false);
          es.close();
          break;
      }
    };

    es.onerror = () => {
      setIsLoadingMore(false);
      setLoadMoreError((prev) => prev ?? "Verbindung zum Server unterbrochen.");
      es.close();
    };
  }

  const { isSeen } = useSeen();
  // "Schon gesehen" markierte Videos verschwinden aus der normalen Liste
  // (siehe /gesehen) — Counts/Filter/Sortierung arbeiten konsequent auf
  // dieser bereinigten Liste, sonst würden Tab-Zahlen nicht zu den
  // tatsächlich angezeigten Karten passen.
  const unseenVideos = useMemo(
    () => videos.filter((v) => !isSeen(v.videoId)),
    [videos, isSeen]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { [ALL_CATEGORY]: unseenVideos.length };
    for (const cat of CATEGORIES) {
      counts[cat.id] = unseenVideos.filter((v) => v.urteil?.kategorien.includes(cat.id)).length;
    }
    return counts;
  }, [unseenVideos]);

  const channels = useMemo(
    () => [...new Set(unseenVideos.map((v) => v.channelTitle))].sort((a, b) => a.localeCompare(b)),
    [unseenVideos]
  );

  const visibleVideos = useMemo(
    () => filterAndSortVideos(unseenVideos, filters),
    [unseenVideos, filters]
  );

  const isLoading = status === "loading";
  const isBusy = isLoading || isLoadingMore;
  // Im "Nur meine Kanäle"-Modus ohne Suchbegriff ist lastQuery leer ("neueste
  // Videos aus allen Kanälen") — dafür einen sprechenden Anzeigetext statt „“.
  const queryLabel = lastQuery ? `„${lastQuery}“` : "Neueste Videos aus deinen Kanälen";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Suche</h1>
        <p className="max-w-xl text-sm text-muted">
          Durchsucht YouTube nach einem Suchbegriff und prüft die Videos auf
          Ernährungs-Fehlinformationen — als Ideenquelle für Reaktionsvideos.
        </p>
      </header>

      <SearchBar
        onSearch={handleSearch}
        isLoading={isLoading}
        regionMode={regionMode}
        onRegionModeChange={setRegionMode}
        channelsOnly={channelsOnly}
        onChannelsOnlyChange={setChannelsOnly}
      />

      <CustomVideoForm
        onSubmit={handleCustomVideoSubmit}
        isLoading={customLoading}
        error={customError}
      />

      {status === "loading" || status === "done" ? (
        <p className="text-center text-xs text-muted">
          {isBusy
            ? `Prüfe ${queryLabel} — ${batchFinished} von ${batchTotal || "?"} Videos fertig…`
            : `${queryLabel} — ${videos.length} Videos geprüft.`}
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {errorMessage}
        </div>
      ) : null}

      {channelsOnly && channelsDepthLimited ? (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          Suchtiefe erreicht — ältere Videos aus mindestens einem deiner Kanäle wurden nicht
          durchsucht. Nutze bei Bedarf den Zeitraum-Filter oder engere Suchbegriffe.
        </div>
      ) : null}

      {status === "idle" && videos.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-muted">
          <p className="text-sm">Gib oben einen Suchbegriff ein, um loszulegen.</p>
          <p className="text-xs">z.B. &quot;Honig gesund&quot; oder &quot;Intervallfasten&quot;</p>
        </div>
      ) : null}

      {videos.length > 0 ? (
        <div className="flex flex-col gap-4">
          <CategoryTabs
            active={filters.category}
            onChange={(category) => setFilters((f) => ({ ...f, category }))}
            counts={categoryCounts}
          />
          <FilterBar filters={filters} onChange={handleFiltersChange} channels={channels} />
        </div>
      ) : null}

      {status !== "idle" && videos.length === 0 && !isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-muted">
          <p className="text-sm">Keine Videos gefunden für {queryLabel}.</p>
        </div>
      ) : null}

      {visibleVideos.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleVideos.map((video) => (
            <ResultCard key={video.videoId} video={video} />
          ))}
        </div>
      ) : videos.length > 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          Keine Videos entsprechen den aktuellen Filtern.
        </p>
      ) : null}

      {isLoading && videos.length === 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : null}

      {(status === "done" || isLoadingMore) && videos.length > 0 ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          {loadMoreError ? <p className="text-xs text-bad">{loadMoreError}</p> : null}
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore || !nextPageToken}
            className="rounded-full border border-line px-5 py-2 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore
              ? "Lädt…"
              : nextPageToken
                ? "Mehr laden"
                : "Keine weiteren Ergebnisse"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
