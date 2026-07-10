// Liest den öffentlichen YouTube-Atom-Feed eines Kanals — 0 Quota-Einheiten,
// im Gegensatz zu search.list (100 Einheiten pro Aufruf). Ersetzt die
// Pro-Kanal-Suche im "Nur meine Kanäle"-Modus (siehe api/analyze/route.ts).
// Liefert nur die ~15 neuesten Videos pro Kanal und keine Statistiken/Dauer —
// dafür wird pro Suchseite zusätzlich fetchVideoMeta (youtube.ts) aufgerufen.

export interface RssVideoEntry {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  publishedAt: string;
}

const ENTRY_RE = /<entry>([\s\S]*?)<\/entry>/g;
const VIDEO_ID_RE = /<yt:videoId>([^<]+)<\/yt:videoId>/;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const PUBLISHED_RE = /<published>([^<]+)<\/published>/;
const DESCRIPTION_RE = /<media:description>([\s\S]*?)<\/media:description>/;

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Atom-Feed eines Kanals -> die ~15 neuesten Videos. Liefert bei Netzwerk-/Parse-Fehlern [] statt zu werfen, damit ein einzelner defekter Kanal-Feed nicht die ganze "Nur meine Kanäle"-Suche abbricht. */
export async function fetchChannelFeed(channelId: string): Promise<RssVideoEntry[]> {
  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();

    const entries: RssVideoEntry[] = [];
    for (const match of xml.matchAll(ENTRY_RE)) {
      const block = match[1];
      const videoId = VIDEO_ID_RE.exec(block)?.[1];
      const title = TITLE_RE.exec(block)?.[1];
      const published = PUBLISHED_RE.exec(block)?.[1];
      if (!videoId || !title || !published) continue;
      const description = DESCRIPTION_RE.exec(block)?.[1] ?? "";
      entries.push({
        videoId,
        channelId,
        title: decodeXmlEntities(title.trim()),
        description: decodeXmlEntities(description.trim()),
        publishedAt: published.trim(),
      });
    }
    return entries;
  } catch (err) {
    console.error(`RSS-Feed für Kanal ${channelId} konnte nicht gelesen werden:`, err);
    return [];
  }
}
