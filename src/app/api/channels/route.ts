import { NextRequest, NextResponse } from "next/server";
import { addChannel, listChannels, removeChannel } from "@/lib/cache";
import { fetchChannelById, searchChannels } from "@/lib/youtube";
import type { SavedChannel } from "@/lib/types";

// Nutzt fs (Cache) und die YouTube-API — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

// Ohne ?q=: gespeicherte Kanäle auflisten. Mit ?q=: Kandidaten-Suche für die
// "Meine Kanäle hinzufügen"-Auswahlliste (siehe kanaele/page.tsx) — liefert
// noch nichts Gespeichertes, der Nutzer wählt gezielt einen Treffer aus.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (q) {
    try {
      const candidates = await searchChannels(q);
      return NextResponse.json({ candidates });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler bei der Kanal-Suche.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json({ channels: listChannels() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { channelId?: string; title?: string; thumbnail?: string }
    | null;
  const channelId = body?.channelId?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "channelId fehlt" }, { status: 400 });
  }

  let title = body?.title;
  let thumbnail = body?.thumbnail;
  if (!title || thumbnail === undefined) {
    // Schnelles "Kanal speichern" von einer Video-Karte liefert nur
    // channelId + Titel aus dem Video, kein Kanal-Thumbnail — einmal
    // nachschlagen, damit "Meine Kanäle" trotzdem ein Bild zeigt.
    try {
      const resolved = await fetchChannelById(channelId);
      title = title ?? resolved?.title ?? channelId;
      thumbnail = thumbnail ?? resolved?.thumbnail ?? "";
    } catch {
      title = title ?? channelId;
      thumbnail = thumbnail ?? "";
    }
  }

  const channel: SavedChannel = { channelId, title, thumbnail };
  addChannel(channel);
  return NextResponse.json({ channel });
}

export async function DELETE(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId fehlt" }, { status: 400 });
  }
  removeChannel(channelId);
  return NextResponse.json({ ok: true });
}
