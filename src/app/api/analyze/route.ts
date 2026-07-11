import { NextRequest } from "next/server";
import { fetchUploadsPlaylistPage, searchVideoIds, fetchVideoMeta } from "@/lib/youtube";
import { buildExternalVideoMeta, detectVideoLink } from "@/lib/links";
import {
  getTranscriptText,
  TranscriptBlockedError,
  TranscriptUnavailableError,
} from "@/lib/transcript";
import { analyzeTranscript } from "@/lib/analyze";
import {
  getCachedChannelPage,
  getCachedFailure,
  getCachedSearch,
  getCachedUrteil,
  getUrteilOverrides,
  listChannels,
  setCachedChannelPage,
  setCachedFailure,
  setCachedSearch,
  setCachedUrteil,
} from "@/lib/cache";
import { DEMO_MODE, searchDemoVideos, type DemoVideo } from "@/lib/demo";
import { SEARCH_CONFIG } from "@/lib/config";
import type {
  AnalyzedVideo,
  AnalyzeEvent,
  PlaylistVideoEntry,
  RegionMode,
  UrteilOverride,
  VideoMeta,
} from "@/lib/types";

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
  transcriptUrl: string = `https://youtu.be/${meta.videoId}`,
  override?: UrteilOverride
): Promise<AnalyzedVideo> {
  const cachedUrteil = await getCachedUrteil(meta.videoId);
  if (cachedUrteil) {
    return { ...meta, status: "ok", urteil: cachedUrteil, urteilOverride: override };
  }

  // Kurz gemerkter Fehlschlag (z.B. IP-Block) -> nicht sofort erneut bei YouTube anfragen.
  const cachedFailure = getCachedFailure(meta.videoId);
  if (cachedFailure) {
    return { ...meta, status: cachedFailure.status, error: cachedFailure.message, urteilOverride: override };
  }

  try {
    const transcript = await getTranscriptText(transcriptUrl);
    const urteil = await analyzeTranscript(transcript);
    await setCachedUrteil(meta.videoId, urteil);
    return { ...meta, status: "ok", urteil, urteilOverride: override };
  } catch (err) {
    if (err instanceof TranscriptUnavailableError) {
      setCachedFailure(meta.videoId, { status: "kein_transkript", message: err.message });
      return { ...meta, status: "kein_transkript", error: err.message, urteilOverride: override };
    }
    const message =
      err instanceof TranscriptBlockedError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unbekannter Fehler";
    setCachedFailure(meta.videoId, { status: "fehler", message });
    return { ...meta, status: "fehler", error: message, urteilOverride: override };
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

// Cache-Key für eine einzelne Uploads-Playlist-Seite eines Kanals (siehe
// cache.ts getCachedChannelPage/setCachedChannelPage) — unabhängig vom
// Suchbegriff, da die Stichwort-Filterung erst nach dem Laden lokal passiert.
function channelPageCacheKey(channelId: string, pageToken: string | undefined): string {
  return `channelsOnly::${channelId}::${pageToken ?? "p1"}`;
}

// Lädt Seiten 1..depth der Uploads-Playlist eines Kanals (playlistItems.list,
// siehe lib/youtube.ts fetchUploadsPlaylistPage), verkettet über den
// YouTube-nextPageToken. Bereits geholte Seiten kommen aus dem Cache (0
// Quota-Einheiten), nur eine neu hinzukommende Tiefenstufe kostet 1 Einheit.
async function fetchChannelUploadsUpToDepth(
  channelId: string,
  depth: number
): Promise<{ entries: PlaylistVideoEntry[]; exhausted: boolean }> {
  let token: string | undefined;
  const entries: PlaylistVideoEntry[] = [];
  let exhausted = false;
  for (let page = 1; page <= depth; page++) {
    const cacheKey = channelPageCacheKey(channelId, token);
    let result = await getCachedChannelPage(cacheKey);
    if (!result) {
      result = await fetchUploadsPlaylistPage(channelId, token);
      await setCachedChannelPage(cacheKey, result);
    }
    entries.push(...result.entries);
    if (!result.nextPageToken) {
      exhausted = true;
      break;
    }
    token = result.nextPageToken;
  }
  return { entries, exhausted };
}

// Stichwort- und Zeitraum-Filter + Sortierung für die "Nur meine Kanäle"-
// Treffer, lokal auf den bereits geholten Playlist-Einträgen (kein
// search.list nötig). Der Suchbegriff muss im TITEL vorkommen — die
// Beschreibung wird bewusst NICHT mehr durchsucht, da Kanäle oft einen
// wiederkehrenden Beschreibungs-Boilerplate (Bio/Links/Hashtags) verwenden,
// der sonst thematisch völlig unpassende Videos matchen ließ. Einfaches
// Substring-Matching (statt strikter \b-Wortgrenzen) ist hier gewollt, damit
// z.B. "gesund" auch "Gesundheit" und "ungesund" im Titel findet.
function filterAndSortChannelEntries(
  entries: PlaylistVideoEntry[],
  qLower: string | undefined,
  publishedAfterMs: number | undefined
): PlaylistVideoEntry[] {
  return entries
    .filter((e) => {
      if (qLower && !e.title.toLowerCase().includes(qLower)) {
        return false;
      }
      if (publishedAfterMs !== undefined && new Date(e.publishedAt).getTime() < publishedAfterMs) {
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

// pageToken im "Nur meine Kanäle"-Modus ist kein YouTube-Token, sondern
// "<depth>:<offset>" — depth = wie viele Playlist-Seiten pro Kanal
// mindestens geladen sind, offset = Position im gefilterten, sortierten
// Gesamtpool aller Kanäle.
function parseChannelsPageToken(pageToken: string | undefined): { depth: number; offset: number } {
  if (!pageToken) return { depth: 1, offset: 0 };
  const [depthStr, offsetStr] = pageToken.split(":");
  return {
    depth: Math.max(1, Number(depthStr) || 1),
    offset: Math.max(0, Number(offsetStr) || 0),
  };
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
          const override = (await getUrteilOverrides([meta.videoId])).get(meta.videoId);
          const result = await processVideo(meta, link.url, override);
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
          // gespeichertem Kanal (100 Quota-Einheiten × Kanalzahl) wird pro
          // Kanal die Uploads-Playlist über playlistItems.list gelesen (1
          // Quota-Einheit pro Seite à 50 Videos, siehe youtube.ts
          // fetchUploadsPlaylistPage) und zusammengeführt. Wie beim früheren
          // RSS-Ansatz gibt es keine Relevanz-Sortierung und keine
          // Region-Einschränkung — region/order sind in diesem Modus daher
          // ohne Wirkung, es wird immer nach Datum sortiert. Der Suchbegriff
          // (q) wird nicht an YouTube geschickt, sondern hier gegen
          // Titel/Beschreibung der Playlist-Treffer gefiltert.
          const savedChannels = await listChannels();
          if (savedChannels.length === 0) {
            send({
              type: "error",
              message: "Keine Kanäle gespeichert — füge zuerst welche unter „Meine Kanäle“ hinzu.",
            });
            return;
          }

          const qLower = q?.toLowerCase();
          const publishedAfterMs = publishedAfter ? new Date(publishedAfter).getTime() : undefined;
          const { depth: startDepth, offset } = parseChannelsPageToken(pageToken);

          // Lädt so lange weitere Playlist-Seiten pro Kanal nach (jeweils +1
          // Quota-Einheit pro Kanal), bis der gefilterte Pool die
          // angeforderte Seite füllt oder alle Kanäle erschöpft sind —
          // begrenzt durch SEARCH_CONFIG.channelsMaxDepth als Sicherheitsnetz
          // gegen sehr enge Stichwort-Filter.
          let depth = startDepth;
          let filtered: PlaylistVideoEntry[] = [];
          let allExhausted = false;
          for (;;) {
            const perChannel = await Promise.all(
              savedChannels.map((channel) => fetchChannelUploadsUpToDepth(channel.channelId, depth))
            );
            // Map statt Set-auf-Array, da eine Video-ID zwar strukturell nur
            // zu einem Kanal gehören kann, doppelte Playlist-Einträge aber
            // theoretisch möglich sind.
            const allEntries = [
              ...new Map(perChannel.flatMap((r) => r.entries).map((e) => [e.videoId, e])).values(),
            ];
            filtered = filterAndSortChannelEntries(allEntries, qLower, publishedAfterMs);
            allExhausted = perChannel.every((r) => r.exhausted);
            if (filtered.length >= offset + SEARCH_CONFIG.pageSize || allExhausted) break;
            if (depth >= SEARCH_CONFIG.channelsMaxDepth) break;
            depth++;
          }

          const pageEntries = filtered.slice(offset, offset + SEARCH_CONFIG.pageSize);
          const nextOffset = offset + SEARCH_CONFIG.pageSize;
          const depthLimitReached = depth >= SEARCH_CONFIG.channelsMaxDepth && !allExhausted;
          const nextPageToken =
            nextOffset < filtered.length
              ? `${depth}:${nextOffset}`
              : allExhausted || depth >= SEARCH_CONFIG.channelsMaxDepth
                ? null
                : `${depth + 1}:${nextOffset}`;

          const videos = await fetchVideoMeta(pageEntries.map((e) => e.videoId));
          const overrides = await getUrteilOverrides(videos.map((v) => v.videoId));
          send({ type: "meta", total: videos.length, nextPageToken, channelsDepthLimited: depthLimitReached });
          await processAll(videos.length, async (i) => {
            const result = await processVideo(videos[i], undefined, overrides.get(videos[i].videoId));
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
          const overrides = await getUrteilOverrides(videos.map((v) => v.videoId));
          send({ type: "meta", total: videos.length, nextPageToken });
          await processAll(videos.length, async (i) => {
            const result = await processVideo(videos[i], undefined, overrides.get(videos[i].videoId));
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
