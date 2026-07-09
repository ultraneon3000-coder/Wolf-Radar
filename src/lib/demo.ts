import fs from "node:fs";
import path from "node:path";
import type { VideoMeta } from "./types";

// Demo-Modus: umgeht den Live-YouTube-/Transkript-Abruf (dauerhaft IP-geblockt)
// und nutzt stattdessen lokale Beispieldaten aus demo-data/. Die Claude-Analyse
// selbst bleibt live — siehe processDemoVideo in api/analyze/route.ts, das
// bewusst KEINE fertigen Urteile aus einer Datei liest.
export const DEMO_MODE = process.env.DEMO_MODE === "true";

interface DemoTranscriptEntry {
  video_id: string;
  text?: string;
  status: string;
}

interface DemoTranscriptsFile {
  videos: DemoTranscriptEntry[];
}

// Schema von demo-data/demo_metadaten.json (siehe dort) — bewusst nah an der
// YouTube-Suche, mit der die Werte ursprünglich erhoben wurden.
interface DemoMetaEntry {
  video_id: string;
  title: string;
  channel: string;
  published: string;
  views: number;
  subscribers: number;
  thumbnail: string;
}

interface DemoMetaFile {
  videos: DemoMetaEntry[];
}

export interface DemoVideo {
  meta: VideoMeta;
  transcript: string;
}

function toVideoMeta(m: DemoMetaEntry): VideoMeta {
  return {
    videoId: m.video_id,
    title: m.title,
    channelId: m.channel,
    channelTitle: m.channel,
    publishedAt: m.published,
    thumbnail: m.thumbnail,
    viewCount: m.views,
    channelSubscriberCount: m.subscribers,
  };
}

let cached: DemoVideo[] | null = null;

function loadDemoVideos(): DemoVideo[] {
  if (cached) return cached;

  const dataDir = path.join(process.cwd(), "demo-data");
  const transcriptsPath = path.join(dataDir, "transkripte_gesamt.json");
  const metaPath = path.join(dataDir, "demo_metadaten.json");

  let transcripts: DemoTranscriptsFile;
  try {
    transcripts = JSON.parse(fs.readFileSync(transcriptsPath, "utf-8")) as DemoTranscriptsFile;
  } catch {
    throw new Error(
      `Demo-Daten fehlen: ${transcriptsPath} nicht gefunden oder ungültig.`
    );
  }

  let metaFile: DemoMetaFile;
  try {
    metaFile = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as DemoMetaFile;
  } catch {
    throw new Error(`Demo-Metadaten fehlen: ${metaPath} nicht gefunden oder ungültig.`);
  }

  const metaById = new Map(metaFile.videos.map((m) => [m.video_id, toVideoMeta(m)]));

  cached = transcripts.videos
    .filter((t) => t.status === "ok" && t.text)
    .map((t) => {
      const meta = metaById.get(t.video_id);
      return meta ? { meta, transcript: t.text as string } : null;
    })
    .filter((v): v is DemoVideo => v !== null);

  return cached;
}

/**
 * Sucht in den Demo-Videos per Substring-Match auf Titel/Kanal. Kein Treffer
 * (z.B. Suchbegriff, der zu keinem der Demo-Videos passt) -> alle Demo-Videos,
 * damit die Demo bei jeder Eingabe zuverlässig Ergebnisse zeigt.
 */
export function searchDemoVideos(query: string): DemoVideo[] {
  const all = loadDemoVideos();
  const q = query.trim().toLowerCase();
  if (!q) return all;

  const matches = all.filter(
    (v) =>
      v.meta.title.toLowerCase().includes(q) || v.meta.channelTitle.toLowerCase().includes(q)
  );
  return matches.length > 0 ? matches : all;
}
