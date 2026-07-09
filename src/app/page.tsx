"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResultCard } from "@/components/ResultCard";
import { WOLF_TOPICS } from "@/lib/config";
import { DEFAULT_FILTERS, filterAndSortVideos } from "@/lib/filters";
import { useSeen } from "@/lib/seen-context";
import type { AnalyzeEvent, AnalyzedVideo } from "@/lib/types";

// undefined = für dieses Thema noch keine Seite geladen, null = keine
// weitere Seite mehr, sonst YouTube-nextPageToken für die nächste Seite.
type TopicToken = string | null | undefined;

// Vorgeschlagen (Radar) — die Startansicht. Rotiert Seite für Seite durch
// Wolfs Kernthemen (WOLF_TOPICS, siehe lib/config.ts): jede Ladung (erste
// Ladung + jeder "Mehr laden"-Klick) holt genau eine 10er-Seite von genau
// einem Thema, reihum. So bleiben die Analyse-Kosten pro Ladung wie bei der
// Suche auf ~10 begrenzt, statt alle 5 Themen sofort parallel zu laden.
// In einer späteren Ausbaustufe werden die Themen aus Wolfs echter
// Reaction-Historie abgeleitet, statt aus der festen Liste in config.ts.
export default function VorgeschlagenPage() {
  const [videosById, setVideosById] = useState<Record<string, AnalyzedVideo>>({});
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTopic, setCurrentTopic] = useState<string>(WOLF_TOPICS[0]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchFinished, setBatchFinished] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const { isSeen } = useSeen();

  // Kontrollfluss (welches Thema ist als Nächstes dran, welche Themen haben
  // noch weitere Seiten) lebt in Refs statt State, damit der "done"-Handler
  // einer Anfrage immer den aktuellsten Stand sieht, statt eine veraltete
  // Closure aus dem Render zu erwischen, in dem die Anfrage gestartet wurde.
  const tokensRef = useRef<Record<string, TopicToken>>({});
  const roundRobinRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const cancelledRef = useRef(false);

  function nextAvailableTopicIndex(from: number): number | null {
    for (let i = 0; i < WOLF_TOPICS.length; i++) {
      const idx = (from + i) % WOLF_TOPICS.length;
      if (tokensRef.current[WOLF_TOPICS[idx]] !== null) return idx;
    }
    return null;
  }

  function finishBatch(topicIndex: number, isInitial: boolean, failed: boolean) {
    if (cancelledRef.current) return;
    const next = nextAvailableTopicIndex(topicIndex + 1);
    roundRobinRef.current = next ?? 0;
    setHasMore(next !== null);
    if (isInitial) setStatus(failed ? "error" : "done");
    setIsLoadingMore(false);
  }

  function fetchTopicPage(topicIndex: number, isInitial: boolean) {
    const topic = WOLF_TOPICS[topicIndex];
    const token = tokensRef.current[topic];
    setCurrentTopic(topic);

    const url = `/api/analyze?q=${encodeURIComponent(topic)}${
      token ? `&pageToken=${encodeURIComponent(token)}` : ""
    }`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      if (cancelledRef.current) return;
      const parsed: AnalyzeEvent = JSON.parse(event.data);
      switch (parsed.type) {
        case "meta":
          setBatchTotal(parsed.total);
          tokensRef.current[topic] = parsed.nextPageToken ?? null;
          break;
        case "result":
          // Dedupe über Themen UND Seiten hinweg: dieselbe Video-ID kann bei
          // mehreren Themen auftauchen (z.B. ein Video zu "Honig" UND
          // "Süßstoffe") — ein ID-Schlüssel-Objekt ist hier von Natur aus
          // dopplungsfrei, anders als ein Array.
          setVideosById((prev) => ({ ...prev, [parsed.video.videoId]: parsed.video }));
          setBatchFinished((c) => c + 1);
          break;
        case "error":
          if (isInitial) setErrorMessage(parsed.message);
          else setLoadMoreError(parsed.message);
          es.close();
          finishBatch(topicIndex, isInitial, true);
          break;
        case "done":
          es.close();
          finishBatch(topicIndex, isInitial, false);
          break;
      }
    };

    es.onerror = () => {
      if (cancelledRef.current) return;
      es.close();
      if (isInitial) setErrorMessage((prev) => prev ?? "Verbindung zum Server unterbrochen.");
      else setLoadMoreError((prev) => prev ?? "Verbindung zum Server unterbrochen.");
      finishBatch(topicIndex, isInitial, true);
    };
  }

  useEffect(() => {
    // Alle State-Werte, die hier sonst zurückgesetzt würden, entsprechen
    // bereits ihren useState-Initialwerten oben — der Effect läuft nur
    // einmal beim Mount (leeres Deps-Array), ein Reset ist daher unnötig.
    cancelledRef.current = false;
    // Außerhalb des synchronen Effect-Bodys angestoßen (statt direkt hier),
    // damit das erste setState nicht synchron innerhalb des Effects landet.
    queueMicrotask(() => {
      if (!cancelledRef.current) fetchTopicPage(0, true);
    });

    return () => {
      cancelledRef.current = true;
      esRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- läuft bewusst nur einmal beim Mount, WOLF_TOPICS ist eine feste Konstante.
  }, []);

  function handleLoadMore() {
    if (isLoadingMore || status === "loading" || !hasMore) return;
    const idx = nextAvailableTopicIndex(roundRobinRef.current);
    if (idx === null) {
      setHasMore(false);
      return;
    }
    esRef.current?.close();
    setIsLoadingMore(true);
    setLoadMoreError(null);
    setBatchTotal(0);
    setBatchFinished(0);
    fetchTopicPage(idx, false);
  }

  const videos = useMemo(() => Object.values(videosById), [videosById]);
  // "Schon gesehen" markierte Videos verschwinden aus dieser Liste (siehe
  // /gesehen) — Sortierung läuft konsequent auf der bereinigten Liste.
  const unseenVideos = useMemo(
    () => videos.filter((v) => !isSeen(v.videoId)),
    [videos, isSeen]
  );
  const sorted = useMemo(
    () => filterAndSortVideos(unseenVideos, DEFAULT_FILTERS),
    [unseenVideos]
  );
  const isBusy = status === "loading" || isLoadingMore;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Vorgeschlagen</h1>
        <p className="max-w-2xl text-sm text-muted">
          Rotierende Suche über Wolfs Kernthemen — gebündelt und sortiert nach
          „fragwürdig + höchste Reichweite zuerst“.
        </p>
        <p className="text-xs text-muted">
          {isBusy
            ? `Prüfe „${currentTopic}“ — ${batchFinished} von ${batchTotal || "?"} Videos fertig…`
            : `${videos.length} Videos geladen.`}
        </p>
      </header>

      {status === "error" && errorMessage && videos.length === 0 ? (
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {errorMessage}
        </div>
      ) : null}

      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((video) => (
            <ResultCard key={video.videoId} video={video} />
          ))}
        </div>
      ) : status === "loading" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">Keine Ergebnisse gefunden.</p>
      )}

      {(status === "done" || status === "error" || isLoadingMore) && videos.length > 0 ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          {loadMoreError ? <p className="text-xs text-bad">{loadMoreError}</p> : null}
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore || !hasMore}
            className="rounded-full border border-line px-5 py-2 text-sm font-medium text-ink transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingMore ? "Lädt…" : hasMore ? "Mehr laden" : "Keine weiteren Ergebnisse"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
