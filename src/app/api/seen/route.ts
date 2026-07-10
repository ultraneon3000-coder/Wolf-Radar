import { NextRequest, NextResponse } from "next/server";
import { addSeen, getUrteilOverrides, listSeen, removeSeen } from "@/lib/cache";
import type { AnalyzedVideo } from "@/lib/types";

// Nutzt fs (Cache) — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

export async function GET() {
  const seen = listSeen();
  // Der gespeicherte Snapshot kann ein inzwischen überholtes Urteil enthalten
  // (Override erst nach dem Speichern gesetzt) — deshalb hier frisch überlagern.
  const overrides = await getUrteilOverrides(seen.map((v) => v.videoId));
  return NextResponse.json({
    seen: seen.map((v) => ({ ...v, urteilOverride: overrides.get(v.videoId) })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { video?: AnalyzedVideo } | null;
  if (!body?.video?.videoId) {
    return NextResponse.json({ error: "video (mit videoId) fehlt" }, { status: 400 });
  }
  addSeen(body.video);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId fehlt" }, { status: 400 });
  }
  removeSeen(videoId);
  return NextResponse.json({ ok: true });
}
