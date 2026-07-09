import { NextRequest } from "next/server";
import { extractVideoId, searchVideoIds, fetchVideoMeta } from "@/lib/youtube";
import {
  getTranscriptText,
  TranscriptBlockedError,
  TranscriptUnavailableError,
} from "@/lib/transcript";
import { analyzeTranscript } from "@/lib/analyze";
import {
  getCachedFailure,
  getCachedUrteil,
  setCachedFailure,
  setCachedUrteil,
} from "@/lib/cache";
import { DEMO_MODE, searchDemoVideos, type DemoVideo } from "@/lib/demo";
import { SEARCH_CONFIG } from "@/lib/config";
import type { AnalyzedVideo, AnalyzeEvent, VideoMeta } from "@/lib/types";

// Nutzt fs (Cache) und den Anthropic SDK-Client — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

function sseLine(event: AnalyzeEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function processVideo(meta: VideoMeta): Promise<AnalyzedVideo> {
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
    const transcript = await getTranscriptText(meta.videoId);
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

  if (!q && !urlParam) {
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
          // (YouTube-API + Transkript-Abruf + Claude), unabhängig vom
          // Demo-Modus — beweist, dass die App mit jedem Video funktioniert.
          const videoId = extractVideoId(urlParam);
          if (!videoId) {
            send({ type: "error", message: "Ungültige YouTube-URL oder Video-ID." });
            return;
          }
          const [meta] = await fetchVideoMeta([videoId]);
          if (!meta) {
            send({ type: "error", message: "Video nicht gefunden (privat, gelöscht oder falsche ID?)." });
            return;
          }
          send({ type: "meta", total: 1 });
          const result = await processVideo(meta);
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
        } else {
          const { videoIds, nextPageToken } = await searchVideoIds(
            q as string,
            SEARCH_CONFIG.pageSize,
            pageToken
          );
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
