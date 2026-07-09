import { Innertube, YTNodes } from "youtubei.js";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { TRANSCRIPT_CONFIG } from "./config";

/** Für dieses Video existiert kein nutzbares Transkript (Untertitel deaktiviert, keins gefunden, …). */
export class TranscriptUnavailableError extends Error {}
/** YouTube blockt diese IP gerade (Rate-Limit/Captcha) — kein Fakt über das Video, nur vorübergehend. */
export class TranscriptBlockedError extends Error {}

// Transkript-Abruf läuft direkt in Node über youtubei.js (InnerTube-API),
// vorher per Subprozess über das Python-Paket `youtube-transcript-api`
// (siehe Git-Historie: scripts/fetch_transcript.py) — das scheiterte auf
// Vercel mit "spawn python ENOENT", da dort kein Python zur Verfügung steht.
//
// YouTube blockt Datacenter-IPs (Vercel etc.) für Transkript-Abrufe generell
// — deshalb läuft der Abruf über einen Residential-Proxy (TRANSCRIPT_PROXY_URL,
// Format "http://user:pass@host:port"), sofern gesetzt. Lokal kann YouTube nach
// vielen Anfragen in kurzer Zeit ebenfalls vorübergehend blocken — deshalb
// werden Anfragen unten serialisiert mit Mindestabstand
// (TRANSCRIPT_CONFIG.minRequestIntervalMs).

/** Kartentext im UI (video.error) — bewusst kurz und ohne technische Details (siehe cache.ts/ResultCard.tsx). */
const GEO_BLOCKED_MESSAGE =
  "Dieses Video ist in Deutschland nicht verfügbar und konnte nicht geprüft werden.";
const GENERIC_TRANSCRIPT_ERROR_MESSAGE =
  "Für dieses Video konnte kein Transkript abgerufen werden.";
const IP_BLOCKED_MESSAGE =
  "YouTube blockiert diese IP gerade (Rate-Limit) — später erneut versuchen.";

// YouTubes Sprachmenü liefert Anzeigenamen (z.B. "German (auto-generated)"),
// keine ISO-Codes — passend zu TRANSCRIPT_CONFIG.preferredLanguages ("de", "en").
const LANGUAGE_DISPLAY_NAME_HINTS: Record<string, string[]> = {
  de: ["german", "deutsch"],
  en: ["english"],
};

let clientPromise: Promise<Innertube> | null = null;

function buildProxyFetch(proxyUrl: string) {
  const dispatcher = new ProxyAgent(proxyUrl);
  // WICHTIG: Hier bewusst undicis eigenes `fetch` verwenden statt Node's
  // globalem `fetch` (= Platform.shim.fetch unter Node) — Node bündelt intern
  // eine eigene undici-Version, deren Dispatcher-Klassen NICHT kompatibel mit
  // dem separat installierten `undici`-Paket sind, aus dem ProxyAgent stammt
  // ("InvalidArgumentError: invalid onRequestStart method" bei Mischbetrieb).
  // `init` (inkl. der von youtubei.js gesetzten Header) wird unverändert durchgereicht.
  // Die Casts überbrücken undicis eigene Request/Response-Typen, die leicht von
  // den DOM-Typen abweichen, die FetchFunction (= typeof fetch) erwartet —
  // strukturell zur Laufzeit aber kompatibel.
  return (input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(input as never, { ...init, dispatcher } as never) as unknown as Promise<Response>;
}

function getClient(): Promise<Innertube> {
  if (!clientPromise) {
    const proxyUrl = process.env.TRANSCRIPT_PROXY_URL?.trim();
    clientPromise = Innertube.create(proxyUrl ? { fetch: buildProxyFetch(proxyUrl) } : undefined);
  }
  return clientPromise;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serialisiert alle Transkript-Anfragen app-weit mit Mindestabstand, unabhängig
// davon, wie viele Worker in der /api/analyze-Route gleichzeitig aufrufen.
// Reduziert das Risiko, YouTube mit einem Schwung paralleler Anfragen erneut
// in einen IP-Block zu schicken.
let requestQueue: Promise<unknown> = Promise.resolve();

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(task);
  // Die Queue selbst darf nie rejecten (sonst bricht die Kette für alle
  // nachfolgenden Aufrufe ab) — der individuelle Fehler geht trotzdem an den
  // jeweiligen Aufrufer über `result` zurück.
  requestQueue = result.then(
    () => sleep(TRANSCRIPT_CONFIG.minRequestIntervalMs),
    () => sleep(TRANSCRIPT_CONFIG.minRequestIntervalMs)
  );
  return result;
}

/** Rohe technische Details NUR ins Server-Log, danach immer eine der drei freundlichen Meldungen werfen. */
function classifyAndThrow(videoId: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.constructor.name : "UnknownError";
  console.error(`[transcript] ${videoId}: ${name}: ${message}`);

  // Netzwerk-/Proxy-seitige Fehler (Rate-Limit, Captcha-Seite, abgebrochene
  // Verbindung durch den Residential-Proxy) — vorübergehend, kein Fakt über
  // das Video, daher separat von "kein Transkript verfügbar".
  if (/429|too many requests|blocked|captcha|econnreset|econnrefused|etimedout|proxy/i.test(
    `${name} ${message}`
  )) {
    throw new TranscriptBlockedError(IP_BLOCKED_MESSAGE);
  }
  throw new Error(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
}

async function fetchTranscript(videoId: string): Promise<string> {
  const youtube = await getClient();

  const info = await youtube.getInfo(videoId).catch((err) => classifyAndThrow(videoId, err));

  const status = info.playability_status;
  if (status && status.status !== "OK") {
    console.error(
      `[transcript] ${videoId}: playability_status=${status.status} reason="${status.reason}"`
    );
    if (/available in your country/i.test(status.reason ?? "")) {
      throw new Error(GEO_BLOCKED_MESSAGE);
    }
    throw new TranscriptUnavailableError(`Video nicht verfuegbar (${videoId})`);
  }

  let transcriptInfo;
  try {
    transcriptInfo = await info.getTranscript();
    // Wählt bevorzugt Deutsch, dann Englisch (TRANSCRIPT_CONFIG.preferredLanguages);
    // findet sich keine der beiden, bleibt YouTubes Standardauswahl bestehen.
    for (const code of TRANSCRIPT_CONFIG.preferredLanguages) {
      const hints = LANGUAGE_DISPLAY_NAME_HINTS[code] ?? [];
      const match = transcriptInfo.languages.find((lang) =>
        hints.some((hint) => lang.toLowerCase().includes(hint))
      );
      if (!match) continue;
      if (match !== transcriptInfo.selectedLanguage) {
        transcriptInfo = await transcriptInfo.selectLanguage(match);
      }
      break;
    }
  } catch (err) {
    console.error(`[transcript] ${videoId}: getTranscript() fehlgeschlagen:`, err);
    throw new TranscriptUnavailableError(`Kein Transkript gefunden (${videoId})`);
  }

  const segments = transcriptInfo.transcript.content?.body?.initial_segments ?? [];
  const text = segments
    .filter((s) => s.is(YTNodes.TranscriptSegment))
    .map((s) => s.snippet.toString().replace(/\n/g, " "))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

  if (!text) {
    throw new TranscriptUnavailableError(`Leeres Transkript (${videoId})`);
  }
  return text;
}

/** Holt das Transkript direkt über youtubei.js (InnerTube-API), bevorzugt Deutsch, über TRANSCRIPT_PROXY_URL. */
export async function getTranscriptText(videoId: string): Promise<string> {
  return throttled(() => fetchTranscript(videoId));
}
