import { NextRequest } from "next/server";
import { searchVideoIds, fetchVideoMeta } from "@/lib/youtube";
import { fetchChannelFeed } from "@/lib/rss";
import { buildExternalVideoMeta, detectVideoLink } from "@/lib/links";
import {
  getTranscriptText,
  TranscriptBlockedError,
  TranscriptUnavailableError,
} from "@/lib/transcript";
import { analyzeTranscript } from "@/lib/analyze";
import {
  getCachedFailure,
  getCachedSearch,
  getCachedUrteil,
  listChannels,
  setCachedFailure,
  setCachedSearch,
  setCachedUrteil,
} from "@/lib/cache";
import { DEMO_MODE, searchDemoVideos, type DemoVideo } from "@/lib/demo";
import { SEARCH_CONFIG } from "@/lib/config";
import type { AnalyzedVideo, AnalyzeEvent, RegionMode, VideoMeta } from "@/lib/types";

// Nutzt fs (Cache) und den Anthropic SDK-Client — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

function sseLine(event: AnalyzeEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// transcriptUrl: volle Video-URL für Supadata (siehe lib/links.ts) — bei
// normalen Suchergebnissen implizit die YouTube-URL zur videoId, beim
// "Eigenes Video analysieren"-Feld (route unten) explizit die erkannte
// YouTube-/TikTok-/Instagram-URL.
async function processVideo(
  meta: VideoMeta,
  transcriptUrl: string = `https://youtu.be/${meta.videoId}`
): Promise<AnalyzedVideo> {
  const cachedUrteil = await getCachedUrteil(meta.videoId);
  if (cachedUrteil) {
    return { ...meta, status: "ok", urteil: cachedUrteil };
  }

  // Kurz gemerkter Fehlschlag (z.B. IP-Block) -> nicht sofort erneut bei YouTube anfragen.
  const cachedFailure = getCachedFailure(meta.videoId);
  if (cachedFailure) {
    return { ...meta, status: cachedFailure.status, error: cachedFailure.message };
  }

  try {
    const transcript = await getTranscriptText(transcriptUrl);
    const urteil = await analyzeTranscript(transcript);
    await setCachedUrteil(meta.videoId, urteil);
    return { ...meta, status: "ok", urteil };
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      setCachedFailure(meta.videoId, { status: "kein_transkript", message: err.message });
      return { ...meta, status: "kein_transkript", error: err.message };
    }
    const message =
      err instanceof TranscriptBlockedError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unbekannter Fehler";
    setCachedFailure(meta.videoId, { status: "fehler", message });
    return { ...meta, status: "fehler", error: message };
  }
}

// Demo-Modus: Transkript-TEXT kommt aus der lokalen Datei statt von YouTube,
// aber die Analyse läuft bei JEDEM Aufruf live über Claude — bewusst ohne
// den Urteil-Cache (getCachedUrteil/setCachedUrteil), damit im Demo-Modus
// nie ein vorbereitetes Urteil ausgeliefert wird.
async function processDemoVideo(item: DemoVideo): Promise<AnalyzedVideo> {
  try {
    const urteil = await analyzeTranscript(item.transcript);
    return { ...item.meta, status: "ok", urteil };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler bei der Analyse.";
    return { ...item.meta, status: "fehler", error: message };
  }
}

// Baut den Cache-Schlüssel für eine Stichwort-Suche (siehe cache.ts
// getCachedSearch/setCachedSearch) aus allen Parametern, die das
// search.list-Ergebnis beeinflussen — zwei Suchen mit identischen Werten
// hier sind garantiert dieselbe YouTube-Anfrage.
function buildSearchCacheKey(
  q: string,
  region: RegionMode,
  order: "relevance" | "date",
  publishedAfter: string | undefined,
  pageToken: string | undefined
): string {
  return [q, region, order, publishedAfter ?? "", pageToken ?? ""].join("::");
}

// Verarbeitet `count` Elemente mit begrenzter Nebenläufigkeit (siehe
// SEARCH_CONFIG.concurrency), ohne auf alle zu warten — jedes Ergebnis wird
// sofort über `handle` (i.d.R. ein SSE-Send) weitergereicht.
async function processAll(count: number, handle: (index: number) => Promise<void>) {
  let nextIndex = 0;
  const worker = async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= count) return;
      await handle(i);
    }
  };
  const workerCount = Math.min(SEARCH_CONFIG.concurrency, count) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const urlParam = req.nextUrl.searchParams.get("url")?.trim();
  const pageToken = req.nextUrl.searchParams.get("pageToken")?.trim() || undefined;
  const region: RegionMode =
    req.nextUrl.searchParams.get("region") === "international" ? "international" : "de";
  const order: "relevance" | "date" =
    req.nextUrl.searchParams.get("order") === "date" ? "date" : "relevance";
  const publishedAfter = req.nextUrl.searchParams.get("publishedAfter")?.trim() || undefined;
  const channelsOnly = req.nextUrl.searchParams.get("channelsOnly") === "true";

  // Im "Nur meine Kanäle"-Modus ist ein Suchbegriff optional (leer = neueste
  // Videos aus allen gespeicherten Kanälen) — sonst bleibt q/url Pflicht.
  if (!q && !urlParam && !channelsOnly) {
    return new Response(JSON.stringify({ error: "Suchbegriff (q) oder url fehlt." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AnalyzeEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        if (urlParam) {
          // "Eigenes Video analysieren": nimmt IMMER den echten Live-Weg
          // (Transkript-Abruf + Claude), unabhängig vom Demo-Modus — beweist,
          // dass die App mit jedem YouTube-, TikTok- oder Instagram-Video
          // funktioniert. Nur YouTube hat eine Metadaten-API (Titel/Thumbnail/
          // Aufrufe/Dauer); für TikTok/Instagram wird ein Mindest-VideoMeta
          // aus der URL selbst gebaut (siehe lib/links.ts).
          const link = detectVideoLink(urlParam);
          if (!link) {
            send({
              type: "error",
              message: "Ungültiger Link — unterstützt werden YouTube-, TikTok- und Instagram-Links.",
            });
            return;
          }

          let meta: VideoMeta;
          if (link.platform === "youtube") {
            const [fetched] = await fetchVideoMeta([link.id]);
            if (!fetched) {
              send({ type: "error", message: "Video nicht gefunden (privat, gelöscht oder falsche ID?)." });
              return;
            }
            meta = fetched;
          } else {
            meta = buildExternalVideoMeta(link);
          }

          send({ type: "meta", total: 1 });
          const result = await processVideo(meta, link.url);
          send({ type: "result", video: result });
          send({ type: "done" });
          return;
        }

        if (DEMO_MODE) {
          // Demo-Datensatz ist eine feste, kleine Liste (siehe demo.ts) — keine
          // echte Paginierung, "Mehr laden" bekommt hier nie einen Token.
          const demoVideos = searchDemoVideos(q as string);
          send({ type: "meta", total: demoVideos.length, nextPageToken: null });
          await processAll(demoVideos.length, async (i) => {
            const result = await processDemoVideo(demoVideos[i]);
            send({ type: "result", video: result });
          });
        } else if (channelsOnly) {
          // "Nur meine Kanäle": statt einer search.list-Anfrage pro
          // gespeichertem Kanal (100 Quota-Einheiten × Kanalzahl) werden die
          // öffentlichen RSS-Feeds aller Kanäle gelesen (0 Quota, siehe
          // lib/rss.ts) und zusammengeführt. RSS liefert nur die ~15
          // neuesten Videos pro Kanal, keine Relevanz-Sortierung und keine
          // Region-Einschränkung — region/order sind in diesem Modus daher
          // ohne Wirkung, es wird immer nach Datum sortiert. Der Suchbegriff
          // (q) wird nicht an YouTube geschickt, sondern hier gegen
          // Titel/Beschreibung der RSS-Treffer gefiltert.
          const savedChannels = listChannels();
          if (savedChannels.length === 0) {
            send({
              type: "error",
              message: "Keine Kanäle gespeichert — füge zuerst welche unter „Meine Kanäle“ hinzu.",
            });
            return;
          }

          const feeds = await Promise.all(
            savedChannels.map((channel) => fetchChannelFeed(channel.channelId))
          );
          // Map statt Set-auf-Array, da eine Video-ID zwar strukturell nur zu
          // einem Kanal gehören kann, ein einzelner Feed aber theoretisch
          // doppelte Einträge liefern könnte.
          const allEntries = [...new Map(feeds.flat().map((e) => [e.videoId, e])).values()];

          const qLower = q?.toLowerCase();
          const publishedAfterMs = publishedAfter ? new Date(publishedAfter).getTime() : undefined;
          const matched = allEntries
            .filter((e) => {
              if (qLower && !`${e.title} ${e.description}`.toLowerCase().includes(qLower)) {
                return false;
              }
              if (publishedAfterMs !== undefined && new Date(e.publishedAt).getTime() < publishedAfterMs) {
                return false;
              }
              return true;
            })
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

          // Einfacher Offset statt YouTube-nextPageToken — die komplette,
          // gefilterte Liste liegt bereits vor (RSS kennt keine Seiten).
          const offset = pageToken ? Number(pageToken) || 0 : 0;
          const pageEntries = matched.slice(offset, offset + SEARCH_CONFIG.pageSize);
          const nextOffset = offset + SEARCH_CONFIG.pageSize;
          const nextPageToken = nextOffset < matched.length ? String(nextOffset) : null;

          const videos = await fetchVideoMeta(pageEntries.map((e) => e.videoId));
          send({ type: "meta", total: videos.length, nextPageToken });
          await processAll(videos.length, async (i) => {
            const result = await processVideo(videos[i]);
            send({ type: "result", video: result });
          });
        } else {
          const cacheKey = buildSearchCacheKey(q as string, region, order, publishedAfter, pageToken);
          let searchPage = await getCachedSearch(cacheKey);
          if (!searchPage) {
            searchPage = await searchVideoIds(
              q as string,
              SEARCH_CONFIG.pageSize,
              pageToken,
              region,
              order,
              publishedAfter
            );
            await setCachedSearch(cacheKey, searchPage);
          }
          const { videoIds, nextPageToken } = searchPage;
          const videos = await fetchVideoMeta(videoIds);
          send({ type: "meta", total: videos.length, nextPageToken });
          await processAll(videos.length, async (i) => {
            const result = await processVideo(videos[i]);
            send({ type: "result", video: result });
          });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message:
            err instanceof Error ? err.message : "Unbekannter Fehler bei der Suche.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
