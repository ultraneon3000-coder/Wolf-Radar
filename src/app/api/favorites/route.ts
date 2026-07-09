import { NextRequest, NextResponse } from "next/server";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/cache";
import type { AnalyzedVideo } from "@/lib/types";

// Nutzt fs (Cache) — braucht die Node.js-Runtime, kein Edge.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ favorites: listFavorites() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { video?: AnalyzedVideo } | null;
  if (!body?.video?.videoId) {
    return NextResponse.json({ error: "video (mit videoId) fehlt" }, { status: 400 });
  }
  addFavorite(body.video);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId fehlt" }, { status: 400 });
  }
  removeFavorite(videoId);
  return NextResponse.json({ ok: true });
}
