import { spawn } from "node:child_process";
import path from "node:path";
import { TRANSCRIPT_CONFIG } from "./config";

/** Für dieses Video existiert kein nutzbares Transkript (Untertitel deaktiviert, keins gefunden, …). */
export class TranscriptUnavailableError extends Error {}
/** YouTube blockt diese IP gerade (Rate-Limit/Captcha) — kein Fakt über das Video, nur vorübergehend. */
export class TranscriptBlockedError extends Error {}

// WICHTIG: Die JS-Bibliothek "youtube-transcript" wird von YouTube beim Abruf
// des eigentlichen Transkript-Texts mit HTTP 429 (Captcha-Seite) blockiert,
// obwohl die Caption-Tracks korrekt gefunden werden. Die Python-Bibliothek
// `youtube-transcript-api` (siehe transkript_sammler.py) funktioniert für
// dieselben Videos zuverlässiger. Daher ruft dieses Modul ein kleines
// Python-Skript (scripts/fetch_transcript.py) als Subprozess auf, statt die
// JS-Bibliothek direkt zu nutzen.
//
// Trotzdem gilt weiterhin: YouTube blockt Datacenter-IPs (Vercel etc.) für
// Transkript-Abrufe generell — dieser MVP läuft daher bewusst nur lokal. Für
// ein Cloud-Deploy braucht es einen Residential-Proxy (optional bereits über
// TRANSCRIPT_PROXY_URL unterstützt, siehe scripts/fetch_transcript.py) oder
// eine gehostete Transkript-API. Auch lokal kann YouTube nach vielen Anfragen
// in kurzer Zeit vorübergehend blocken — deshalb werden Anfragen unten
// serialisiert mit Mindestabstand (TRANSCRIPT_CONFIG.minRequestIntervalMs).

const SCRIPT_PATH = path.join(process.cwd(), "scripts", "fetch_transcript.py");
// "py" zuerst: der Windows-Python-Launcher (py.exe, von jedem offiziellen
// python.org-Installer mitinstalliert) findet die echte Installation zuverlässig.
// "python"/"python3" auf PATH zeigen in manchen Prozess-Umgebungen (z.B. dem
// Next.js-Dev-Server) stattdessen auf den Microsoft-Store-Platzhalter, der
// nur einen Hinweis zur Store-Installation ausgibt statt Python zu starten.
const PYTHON_CANDIDATES = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN]
  : ["py", "python3", "python"];

interface PythonResult {
  ok: boolean;
  text?: string;
  language?: string;
  language_code?: string;
  is_generated?: boolean;
  error_type?: string;
  message?: string;
}

// Fehlertypen, die bedeuten "für dieses Video existiert kein nutzbares Transkript"
// (im Gegensatz zu einem echten Fehler wie IP-Block oder fehlender Python-Abhängigkeit).
const NOT_AVAILABLE_TYPES = new Set(["disabled", "not_found", "video_unavailable", "empty"]);

function runPythonOnce(pythonBin: string, videoId: string): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, [SCRIPT_PATH, videoId, ...TRANSCRIPT_CONFIG.preferredLanguages], {
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf-8")));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf-8")));

    proc.on("error", (err) => reject(err));
    proc.on("close", () => {
      // Rohe technische Details (Stacktrace-Text, Bibliotheks-Hinweise wie
      // GitHub-Issue-Links) landen NUR hier im Server-Log — dürfen nie bis
      // in die UI durchgereicht werden (siehe getTranscriptText unten).
      if (stderr.trim()) {
        console.error(`[fetch_transcript.py] (${videoId}):`, stderr.trim());
      }
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
      if (!lastLine) {
        reject(new Error(stderr.trim() || "Transkript-Skript lieferte keine Ausgabe."));
        return;
      }
      try {
        resolve(JSON.parse(lastLine) as PythonResult);
      } catch {
        reject(new Error(`Ungültige Antwort vom Transkript-Skript: ${lastLine.slice(0, 300)}`));
      }
    });
  });
}

async function runPython(videoId: string): Promise<PythonResult> {
  let lastSpawnError: unknown;
  for (const bin of PYTHON_CANDIDATES) {
    try {
      return await runPythonOnce(bin, videoId);
    } catch (err) {
      lastSpawnError = err;
      // ENOENT = dieser Python-Befehl existiert nicht -> nächsten Kandidaten probieren.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }
  throw new Error(
    `Kein Python gefunden (versucht: ${PYTHON_CANDIDATES.join(", ")}). ` +
      `Ist Python 3 installiert und im PATH? (${String(lastSpawnError)})`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serialisiert alle Transkript-Anfragen app-weit mit Mindestabstand (siehe
// transkript_sammler.py SLEEP_BETWEEN), unabhängig davon, wie viele Worker in
// der /api/analyze-Route gleichzeitig aufrufen. Reduziert das Risiko, YouTube
// mit einem Schwung paralleler Anfragen erneut in einen IP-Block zu schicken.
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

/** Holt das Transkript per Python-Subprozess (youtube-transcript-api), bevorzugt Deutsch. */
/** Kartentext im UI (video.error) — bewusst kurz und ohne technische Details (siehe cache.ts/ResultCard.tsx). */
const GEO_BLOCKED_MESSAGE =
  "Dieses Video ist in Deutschland nicht verfügbar und konnte nicht geprüft werden.";
const GENERIC_TRANSCRIPT_ERROR_MESSAGE =
  "Für dieses Video konnte kein Transkript abgerufen werden.";
const IP_BLOCKED_MESSAGE =
  "YouTube blockiert diese IP gerade (Rate-Limit) — später erneut versuchen.";

export async function getTranscriptText(videoId: string): Promise<string> {
  const result = await throttled(() => runPython(videoId));

  if (result.ok && result.text) {
    return result.text;
  }

  const type = result.error_type ?? "unknown";
  const message = result.message ?? "Unbekannter Fehler beim Transkript-Abruf.";

  if (NOT_AVAILABLE_TYPES.has(type)) {
    throw new TranscriptUnavailableError(message);
  }
  if (type === "ip_blocked") {
    throw new TranscriptBlockedError(IP_BLOCKED_MESSAGE);
  }
  if (type === "geo_blocked") {
    throw new Error(GEO_BLOCKED_MESSAGE);
  }
  // Alles andere (inkl. unbekannter/neuer Fehlertypen aus der Python-Bibliothek):
  // die rohe Meldung (`message`, ggf. mit Stacktrace-Text/GitHub-Links) darf nie
  // bis in die UI durchgereicht werden — Detail steht im Server-Log (siehe oben).
  console.error(`[transcript] ${videoId}: unklassifizierter Fehler (${type}): ${message}`);
  throw new Error(GENERIC_TRANSCRIPT_ERROR_MESSAGE);
}
