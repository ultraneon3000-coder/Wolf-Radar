import { extractVideoId } from "./youtube";
import type { VideoMeta, VideoPlatform } from "./types";

export interface DetectedLink {
  platform: VideoPlatform;
  // Plattform-spezifische ID (YouTube: 11-stellige Video-ID; TikTok: numerische
  // Video-ID oder Kurzlink-Code; Instagram: Shortcode) — dient als Basis für
  // einen eindeutigen videoId-Schlüssel (siehe buildExternalVideoMeta).
  id: string;
  // Für Supadata: bei YouTube eine kanonische youtu.be-URL, bei TikTok/Instagram
  // die unveränderte Original-URL.
  url: string;
  // Bestmöglich aus der URL erratener Ersteller-Handle (z.B. "@username"),
  // oder null, wenn nicht aus der URL ablesbar (z.B. TikTok-Kurzlinks).
  channelHandle: string | null;
  // Anzeigename für Titel/Kanalzeile, wenn keine echten Metadaten existieren.
  label: string;
}

/**
 * Erkennt YouTube-, TikTok- oder Instagram-Links (inkl. Reels) im
 * "Eigenes Video analysieren"-Feld. YouTube nutzt weiterhin extractVideoId
 * (Video-ID oder klassische YouTube-URL); TikTok/Instagram werden zusätzlich
 * per URL-Muster erkannt, da es dafür keine YouTube-Metadaten-API gibt.
 */
export function detectVideoLink(input: string): DetectedLink | null {
  const trimmed = input.trim();

  const youtubeId = extractVideoId(trimmed);
  if (youtubeId) {
    return { platform: "youtube", id: youtubeId, url: `https://youtu.be/${youtubeId}`, channelHandle: null, label: "YouTube-Video" };
  }

  const tiktokFullMatch = trimmed.match(/tiktok\.com\/@([\w.-]+)\/video\/(\d+)/i);
  if (tiktokFullMatch) {
    return {
      platform: "tiktok",
      id: tiktokFullMatch[2],
      url: trimmed,
      channelHandle: `@${tiktokFullMatch[1]}`,
      label: "TikTok-Video",
    };
  }
  // Kurzlinks (vm.tiktok.com/..., vt.tiktok.com/...) enthalten weder Video-ID
  // noch Handle im Klartext — der Kurzcode selbst reicht als eindeutiger Schlüssel.
  const tiktokShortMatch = trimmed.match(/(?:vm|vt)\.tiktok\.com\/([\w-]+)/i);
  if (tiktokShortMatch) {
    return {
      platform: "tiktok",
      id: tiktokShortMatch[1],
      url: trimmed,
      channelHandle: null,
      label: "TikTok-Video",
    };
  }

  const instagramMatch = trimmed.match(/instagram\.com\/(?:([\w.-]+)\/)?(reel|reels|p|tv)\/([\w-]+)/i);
  if (instagramMatch) {
    const kind = instagramMatch[2].toLowerCase();
    return {
      platform: "instagram",
      id: instagramMatch[3],
      url: trimmed,
      channelHandle: instagramMatch[1] ? `@${instagramMatch[1]}` : null,
      label: kind.startsWith("reel") ? "Instagram-Reel" : "Instagram-Post",
    };
  }

  return null;
}

/**
 * Baut ein minimales VideoMeta für TikTok/Instagram-Links, für die es keine
 * YouTube-Metadaten-API gibt — Titel/Kanalzeile kommen bestmöglich aus der
 * URL, Thumbnail/Aufrufe/Dauer bleiben unbekannt (siehe Analyse-Pipeline in
 * api/analyze/route.ts, die davon unabhängig identisch bleibt).
 */
export function buildExternalVideoMeta(link: DetectedLink): VideoMeta {
  const handle = link.channelHandle;
  return {
    videoId: `${link.platform}:${link.id}`,
    title: handle ? `${link.label} von ${handle}` : link.label,
    channelId: handle ?? `${link.platform}:unbekannt`,
    channelTitle: handle ?? link.label,
    publishedAt: new Date().toISOString(),
    thumbnail: "",
    viewCount: 0,
    channelSubscriberCount: 0,
    language: null,
    durationSeconds: null,
    platform: link.platform,
    sourceUrl: link.url,
  };
}
