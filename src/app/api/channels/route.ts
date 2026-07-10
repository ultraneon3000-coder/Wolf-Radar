import { NextRequest, NextResponse } from "next/server";
import { addChannel, listChannels, removeChannel } from "@/lib/cache";
import { resolveChannel } from "@/lib/youtube";

// Nutzt fs (Cache) und die YouTube-API — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ channels: listChannels() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { input?: string } | null;
  const input = body?.input?.trim();
  if (!input) {
    return NextResponse.json({ error: "Kanal-Name, -URL oder @handle fehlt." }, { status: 400 });
  }

  try {
    const resolved = await resolveChannel(input);
    if (!resolved) {
      return NextResponse.json({ error: `Kein Kanal gefunden für "${input}".` }, { status: 404 });
    }
    addChannel(resolved);
    return NextResponse.json({ channel: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler bei der Kanal-Suche.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "channelId fehlt" }, { status: 400 });
  }
  removeChannel(channelId);
  return NextResponse.json({ ok: true });
}
