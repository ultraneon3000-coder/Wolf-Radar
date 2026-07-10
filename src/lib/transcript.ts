import { TRANSCRIPT_CONFIG } from "./config";

/** Für dieses Video existiert kein nutzbares Transkript (Untertitel deaktiviert, keins gefunden, …). */
export class TranscriptUnavailableError extends Error {}
/** Supadata blockt diese Anfrage gerade (Rate-Limit) — kein Fakt über das Video, nur vorübergehend. */
export class TranscriptBlockedError extends Error {}

// Transkript-Abruf läuft über den gehosteten Dienst Supadata (SUPADATA_API_KEY),
// nicht mehr direkt über youtubei.js gegen YouTube — YouTube verlangt für
// Transkripte inzwischen einen PoToken, den Supadata auf seiner Seite löst.
// Details zum Wechsel weg vom direkten InnerTube-Abruf: Git-Historie dieser Datei.

const SUPADATA_TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";

/** Kartentext im UI (video.error) — bewusst kurz und ohne technische Details (siehe cache.ts/ResultCard.tsx). */
const GEO_BLOCKED_MESSAGE =
  "Dieses Video ist in Deutschland nicht verfügbar und konnte nicht geprüft werden.";
const GENERIC_TRANSCRIPT_ERROR_MESSAGE =
  "Für dieses Video konnte kein Transkript abgerufen werden.";
const IP_BLOCKED_MESSAGE =
  "Transkript-Dienst ist gerade ausgelastet (Rate-Limit) — später erneut versuchen.";

interface SupadataContentSegment {
  text: string;
}

interface SupadataTranscriptResponse {
  content?: SupadataContentSegment[];
}

interface SupadataErrorResponse {
  error: string;
  message: string;
  details?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serialisiert alle Transkript-Anfragen app-weit mit Mindestabstand, unabhängig
// davon, wie viele Worker in der /api/analyze-Route gleichzeitig aufrufen —
// schont das Supadata-Rate-Limit bei vielen Videos in Folge.
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

/**
 * Rohe technische Details NUR ins Server-Log, danach immer eine der drei
 * freundlichen Meldungen werfen. Bekannte Supadata-Fehlercodes (siehe
 * https://docs.supadata.ai/errors/list) werden zuerst geprüft; der
 * HTTP-Status dient nur als Fallback, falls Supadata mal ohne bekannten
 * `error`-Code antwortet. Wichtig: "transcript-unavailable" kommt mit
 * HTTP 206 zurück, nicht mit einem 4xx/5xx-Status.
 */
function classifyAndThrow(
  sourceUrl: string,
  status: number,
  body: SupadataErrorResponse | null,
  rawText: string
): never {
  console.error(
    `[transcript] ${sourceUrl}: Supadata ${status} ${body?.error ?? "?"}: ${body?.details ?? body?.message ?? rawText}`
  );

  const code = body?.error;
  if (code === "forbidden" || status === 403) {
    throw new Error(GEO_BLOCKED_MESSAGE);
  }
  if (code === "not-found" || code === "transcript-unavailable" || status === 404 || status === 206) {
    throw new TranscriptUnavailableError(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
  }
  if (code === "limit-exceeded" || status === 429) {
    throw new TranscriptBlockedError(IP_BLOCKED_MESSAGE);
  }
  throw new Error(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
}

// sourceUrl ist die volle Video-URL (YouTube: youtu.be/<id>, TikTok/Instagram:
// die Original-URL) — Supadata bedient alle drei Plattformen über denselben
// Endpunkt, nur die URL entscheidet über die Plattform (siehe lib/links.ts).
async function fetchTranscript(sourceUrl: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.error(`[transcript] ${sourceUrl}: SUPADATA_API_KEY ist nicht gesetzt.`);
    throw new Error(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
  }

  const url = new URL(SUPADATA_TRANSCRIPT_URL);
  url.searchParams.set("url", sourceUrl);
  // Supadata bevorzugt die angegebene Sprache, fällt aber selbst automatisch auf
  // eine verfügbare Sprache zurück, wenn Deutsch nicht existiert (verifiziert: ein
  // Video mit nur deutschen Untertiteln liefert bei lang=en trotzdem die deutschen,
  // Status 200) — ein einzelner Request mit lang=de deckt "bevorzugt Deutsch,
  // sonst Standard" also bereits ab.
  url.searchParams.set("lang", TRANSCRIPT_CONFIG.preferredLanguages[0]);

  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": apiKey } });
  } catch (err) {
    console.error(`[transcript] ${sourceUrl}: Netzwerkfehler beim Supadata-Aufruf:`, err);
    throw new Error(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
  }

  const rawText = await res.text();
  let data: SupadataTranscriptResponse | SupadataErrorResponse | null = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Antwort war kein JSON — data bleibt null, rawText geht ins Log.
  }

  // Nicht nur auf res.ok verlassen: "transcript-unavailable" kommt mit HTTP 206
  // zurück, was fetch als "ok" behandelt.
  if (data && "error" in data) {
    classifyAndThrow(sourceUrl, res.status, data, rawText);
  }
  if (!res.ok || !data) {
    classifyAndThrow(sourceUrl, res.status, null, rawText);
  }

  const text = (data.content ?? []).map((s) => s.text).join(" ").trim();
  if (!text) {
    throw new TranscriptUnavailableError(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
  }
  return text;
}

/** Holt das Transkript über den gehosteten Dienst Supadata (YouTube/TikTok/Instagram), bevorzugt Deutsch. */
export async function getTranscriptText(sourceUrl: string): Promise<string> {
  return throttled(() => fetchTranscript(sourceUrl));
}
